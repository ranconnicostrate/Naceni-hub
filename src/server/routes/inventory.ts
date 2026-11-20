import { Router } from 'express';
import { and, asc, desc, eq, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  categories,
  inventory,
  products,
  purchaseOrderItems,
  purchaseOrders,
  reorderRules,
  stockMovements,
  suppliers,
  users,
  warehouses,
} from '../../db/schema.ts';
import {
  requireAuth,
  requireRoles,
  type AuthRequest,
} from '../middleware/auth.ts';
import {
  createNotification,
  emitRealtimeEvent,
  logAudit,
} from '../utils/audit.ts';
import { evaluateReorderForProduct } from '../utils/reorder.ts';

const router = Router();

router.get(
  '/inventory',
  requireAuth,
  requireRoles(
    'SUPER_ADMIN',
    'INVENTORY_MANAGER',
    'WAREHOUSE_STAFF',
    'SALES_MANAGER'
  ),
  async (_req, res) => {
    try {
      const productRows = await db
        .select({
          id: products.id,
          sku: products.sku,
          name: products.name,
          categoryName: categories.name,
          supplierId: products.supplierId,
          supplierName: suppliers.name,
          unitOfMeasure: products.unitOfMeasure,
          retailPriceRwf: products.retailPriceRwf,
          wholesalePriceRwf: products.wholesalePriceRwf,
          availableStock: products.availableStock,
          reservedStock: products.reservedStock,
          minStockLevel: products.minStockLevel,
          reorderPoint: products.reorderPoint,
          reorderQuantity: products.reorderQuantity,
          batchNumber: products.batchNumber,
          status: products.status,
          updatedAt: products.updatedAt,
        })
        .from(products)
        .leftJoin(categories, eq(categories.id, products.categoryId))
        .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
        .where(eq(products.status, 'ACTIVE'))
        .orderBy(asc(products.availableStock), asc(products.name));

      const warehouseRows = await db.select().from(warehouses);

      const breakdown = await db
        .select({
          id: inventory.id,
          productId: inventory.productId,
          warehouseId: inventory.warehouseId,
          warehouseName: warehouses.name,
          warehouseCode: warehouses.code,
          quantityOnHand: inventory.quantityOnHand,
          binLocation: inventory.binLocation,
          batchCode: inventory.batchCode,
        })
        .from(inventory)
        .innerJoin(warehouses, eq(warehouses.id, inventory.warehouseId));

      let totalStockUnits = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;
      let inventoryValueRwf = 0;

      for (const item of productRows) {
        totalStockUnits += item.availableStock;
        inventoryValueRwf += item.availableStock * item.wholesalePriceRwf;
        if (item.availableStock <= 0) {
          outOfStockCount += 1;
        } else if (item.availableStock <= item.minStockLevel) {
          lowStockCount += 1;
        }
      }

      res.json({
        summary: {
          totalStockUnits,
          lowStockCount,
          outOfStockCount,
          inStockCount:
            productRows.length - lowStockCount - outOfStockCount,
          inventoryValueRwf,
          totalSkus: productRows.length,
        },
        items: productRows,
        warehouses: warehouseRows,
        warehouseBreakdown: breakdown,
      });
    } catch (error) {
      console.error('Inventory overview error:', error);
      res.status(500).json({ error: 'Failed to load inventory data.' });
    }
  }
);

router.get('/inventory/warehouses', requireAuth, async (_req, res) => {
  try {
    const rows = await db.select().from(warehouses);
    res.json({ warehouses: rows });
  } catch (error) {
    console.error('Warehouses fetch error:', error);
    res.status(500).json({ error: 'Failed to load warehouses.' });
  }
});

router.get(
  '/stock-movements',
  requireAuth,
  requireRoles('SUPER_ADMIN', 'INVENTORY_MANAGER', 'WAREHOUSE_STAFF'),
  async (_req, res) => {
    try {
      const rows = await db
        .select({
          id: stockMovements.id,
          productId: stockMovements.productId,
          productName: products.name,
          sku: products.sku,
          warehouseId: stockMovements.warehouseId,
          warehouseName: warehouses.name,
          type: stockMovements.type,
          quantityDelta: stockMovements.quantityDelta,
          previousStock: stockMovements.previousStock,
          newStock: stockMovements.newStock,
          referenceType: stockMovements.referenceType,
          referenceId: stockMovements.referenceId,
          notes: stockMovements.notes,
          performedByName: users.fullName,
          createdAt: stockMovements.createdAt,
        })
        .from(stockMovements)
        .innerJoin(products, eq(products.id, stockMovements.productId))
        .leftJoin(warehouses, eq(warehouses.id, stockMovements.warehouseId))
        .leftJoin(users, eq(users.id, stockMovements.performedById))
        .orderBy(desc(stockMovements.createdAt))
        .limit(120);

      res.json({ movements: rows });
    } catch (error) {
      console.error('Stock movements error:', error);
      res.status(500).json({ error: 'Failed to load stock movements.' });
    }
  }
);

router.post(
  '/inventory/adjust',
  requireAuth,
  requireRoles('SUPER_ADMIN', 'INVENTORY_MANAGER', 'WAREHOUSE_STAFF'),
  async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        productId: z.number().int().positive(),
        warehouseId: z.number().int().positive(),
        targetWarehouseId: z.number().int().positive().optional(),
        type: z.enum(['INCOMING', 'OUTGOING', 'ADJUSTMENT', 'TRANSFER']),
        quantity: z.number().int().positive(),
        batchCode: z.string().optional(),
        notes: z.string().optional().default(''),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message || 'Invalid payload.' });
      }

      const d = parsed.data;
      if (d.type === 'TRANSFER' && (!d.targetWarehouseId || d.targetWarehouseId === d.warehouseId)) {
        return res
          .status(400)
          .json({ error: 'Select a different destination warehouse for transfer.' });
      }

      const result = await db.transaction(async (tx) => {
        const locked = await tx.execute(
          sql`SELECT id, available_stock, name, sku FROM products WHERE id = ${d.productId} FOR UPDATE`
        );
        const prodRow = locked.rows[0] as
          | { id: number; available_stock: number; name: string; sku: string }
          | undefined;

        if (!prodRow) {
          throw new Error('PRODUCT_NOT_FOUND');
        }

        const prevStock = Number(prodRow.available_stock);
        let delta = d.quantity;
        if (d.type === 'OUTGOING') {
          delta = -d.quantity;
        } else if (d.type === 'ADJUSTMENT') {
          // Set absolute or signed adjustment; treat quantity as positive addition unless negative
          delta = d.quantity;
        } else if (d.type === 'TRANSFER') {
          delta = 0;
        }

        const newStock = prevStock + delta;
        if (newStock < 0) {
          throw new Error('INSUFFICIENT_STOCK');
        }

        if (d.type === 'TRANSFER' && d.targetWarehouseId) {
          const [sourceInv] = await tx
            .select()
            .from(inventory)
            .where(
              and(
                eq(inventory.productId, d.productId),
                eq(inventory.warehouseId, d.warehouseId)
              )
            )
            .limit(1);

          if (!sourceInv || sourceInv.quantityOnHand < d.quantity) {
            throw new Error('INSUFFICIENT_WAREHOUSE_STOCK');
          }

          await tx
            .update(inventory)
            .set({
              quantityOnHand: sourceInv.quantityOnHand - d.quantity,
              updatedAt: new Date(),
            })
            .where(eq(inventory.id, sourceInv.id));

          await tx
            .insert(inventory)
            .values({
              productId: d.productId,
              warehouseId: d.targetWarehouseId,
              quantityOnHand: d.quantity,
              binLocation: 'TR-01',
              batchCode: d.batchCode || sourceInv.batchCode,
            })
            .onConflictDoUpdate({
              target: [inventory.productId, inventory.warehouseId],
              set: {
                quantityOnHand: sql`${inventory.quantityOnHand} + ${d.quantity}`,
                updatedAt: new Date(),
              },
            });
        } else {
          await tx
            .update(products)
            .set({
              availableStock: newStock,
              ...(d.batchCode ? { batchNumber: d.batchCode } : {}),
              updatedAt: new Date(),
            })
            .where(eq(products.id, d.productId));

          const [whInv] = await tx
            .select()
            .from(inventory)
            .where(
              and(
                eq(inventory.productId, d.productId),
                eq(inventory.warehouseId, d.warehouseId)
              )
            )
            .limit(1);

          if (whInv) {
            const nextWhQty = Math.max(0, whInv.quantityOnHand + delta);
            await tx
              .update(inventory)
              .set({
                quantityOnHand: nextWhQty,
                ...(d.batchCode ? { batchCode: d.batchCode } : {}),
                updatedAt: new Date(),
              })
              .where(eq(inventory.id, whInv.id));
          } else if (delta > 0) {
            await tx.insert(inventory).values({
              productId: d.productId,
              warehouseId: d.warehouseId,
              quantityOnHand: delta,
              binLocation: 'A1-01',
              batchCode: d.batchCode || 'BATCH-2026',
            });
          }
        }

        const [movement] = await tx
          .insert(stockMovements)
          .values({
            productId: d.productId,
            warehouseId: d.warehouseId,
            type: d.type,
            quantityDelta: d.type === 'TRANSFER' ? d.quantity : delta,
            previousStock: prevStock,
            newStock,
            referenceType: 'MANUAL_ADJUSTMENT',
            referenceId: `ADJ-${Date.now().toString().slice(-6)}`,
            notes:
              d.notes ||
              (d.type === 'TRANSFER'
                ? `Transferred ${d.quantity} units to warehouse #${d.targetWarehouseId}`
                : `${d.type} stock adjustment`),
            performedById: req.authUser!.id,
          })
          .returning();

        return { movement, newStock, prevStock };
      });

      await logAudit({
        userId: req.authUser!.id,
        actorEmail: req.authUser!.email,
        action: `INVENTORY_${d.type}`,
        entityType: 'product',
        entityId: d.productId,
        details: {
          previousStock: result.prevStock,
          newStock: result.newStock,
          notes: d.notes,
        },
        ipAddress: req.ip,
      });

      emitRealtimeEvent('inventory:updated', {
        productId: d.productId,
        availableStock: result.newStock,
      });

      await evaluateReorderForProduct(d.productId, req.authUser!.id);

      res.json({ movement: result.movement, newStock: result.newStock });
    } catch (error: any) {
      if (error?.message === 'PRODUCT_NOT_FOUND') {
        return res.status(404).json({ error: 'Product not found.' });
      }
      if (
        error?.message === 'INSUFFICIENT_STOCK' ||
        error?.message === 'INSUFFICIENT_WAREHOUSE_STOCK'
      ) {
        return res
          .status(400)
          .json({ error: 'Insufficient stock in selected warehouse.' });
      }
      console.error('Inventory adjust error:', error);
      res.status(500).json({ error: 'Failed to adjust inventory.' });
    }
  }
);

router.get('/suppliers', requireAuth, async (_req, res) => {
  try {
    const rows = await db.select().from(suppliers).orderBy(asc(suppliers.name));
    res.json({ suppliers: rows });
  } catch (error) {
    console.error('Suppliers list error:', error);
    res.status(500).json({ error: 'Failed to load suppliers.' });
  }
});

router.post(
  '/suppliers',
  requireAuth,
  requireRoles('SUPER_ADMIN', 'INVENTORY_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        name: z.string().min(2),
        contactPerson: z.string().min(2),
        email: z.string().email(),
        phone: z.string().min(6),
        address: z.string().min(3),
        leadTimeDays: z.number().int().positive().default(5),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid supplier fields.' });
      }

      const [created] = await db
        .insert(suppliers)
        .values(parsed.data)
        .returning();

      await logAudit({
        userId: req.authUser!.id,
        actorEmail: req.authUser!.email,
        action: 'SUPPLIER_CREATED',
        entityType: 'supplier',
        entityId: created.id,
        ipAddress: req.ip,
      });

      res.status(201).json({ supplier: created });
    } catch (error) {
      console.error('Create supplier error:', error);
      res.status(500).json({ error: 'Failed to create supplier.' });
    }
  }
);

router.get(
  '/reorders/rules',
  requireAuth,
  requireRoles('SUPER_ADMIN', 'INVENTORY_MANAGER'),
  async (_req, res) => {
    try {
      const rows = await db
        .select({
          id: reorderRules.id,
          productId: reorderRules.productId,
          productName: products.name,
          sku: products.sku,
          availableStock: products.availableStock,
          supplierId: reorderRules.supplierId,
          supplierName: suppliers.name,
          minStockLevel: reorderRules.minStockLevel,
          reorderPoint: reorderRules.reorderPoint,
          reorderQuantity: reorderRules.reorderQuantity,
          leadTimeDays: reorderRules.leadTimeDays,
          autoDraftPo: reorderRules.autoDraftPo,
          isActive: reorderRules.isActive,
        })
        .from(reorderRules)
        .innerJoin(products, eq(products.id, reorderRules.productId))
        .leftJoin(suppliers, eq(suppliers.id, reorderRules.supplierId))
        .orderBy(asc(products.availableStock));

      res.json({ rules: rows });
    } catch (error) {
      console.error('Reorder rules error:', error);
      res.status(500).json({ error: 'Failed to load reorder rules.' });
    }
  }
);

router.put(
  '/reorders/rules/:productId',
  requireAuth,
  requireRoles('SUPER_ADMIN', 'INVENTORY_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const productId = Number(req.params.productId);
      const schema = z.object({
        supplierId: z.number().int().positive().nullable().optional(),
        minStockLevel: z.number().int().min(0),
        reorderPoint: z.number().int().min(0),
        reorderQuantity: z.number().int().positive(),
        leadTimeDays: z.number().int().positive(),
        autoDraftPo: z.boolean(),
        isActive: z.boolean(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success || Number.isNaN(productId)) {
        return res.status(400).json({ error: 'Invalid reorder rule payload.' });
      }

      const [updated] = await db
        .insert(reorderRules)
        .values({ productId, ...parsed.data })
        .onConflictDoUpdate({
          target: reorderRules.productId,
          set: { ...parsed.data, updatedAt: new Date() },
        })
        .returning();

      await db
        .update(products)
        .set({
          minStockLevel: parsed.data.minStockLevel,
          reorderPoint: parsed.data.reorderPoint,
          reorderQuantity: parsed.data.reorderQuantity,
          ...(parsed.data.supplierId ? { supplierId: parsed.data.supplierId } : {}),
        })
        .where(eq(products.id, productId));

      await logAudit({
        userId: req.authUser!.id,
        actorEmail: req.authUser!.email,
        action: 'REORDER_RULE_UPDATED',
        entityType: 'reorder_rule',
        entityId: productId,
        details: parsed.data,
        ipAddress: req.ip,
      });

      res.json({ rule: updated });
    } catch (error) {
      console.error('Update reorder rule error:', error);
      res.status(500).json({ error: 'Failed to update reorder rule.' });
    }
  }
);

router.get(
  '/reorders/recommendations',
  requireAuth,
  requireRoles('SUPER_ADMIN', 'INVENTORY_MANAGER'),
  async (_req, res) => {
    try {
      const lowProducts = await db
        .select({
          productId: products.id,
          sku: products.sku,
          name: products.name,
          availableStock: products.availableStock,
          minStockLevel: products.minStockLevel,
          reorderPoint: products.reorderPoint,
          reorderQuantity: products.reorderQuantity,
          wholesalePriceRwf: products.wholesalePriceRwf,
          supplierId: products.supplierId,
          supplierName: suppliers.name,
          leadTimeDays: suppliers.leadTimeDays,
        })
        .from(products)
        .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
        .where(
          and(
            eq(products.status, 'ACTIVE'),
            lte(products.availableStock, products.reorderPoint)
          )
        )
        .orderBy(asc(products.availableStock));

      res.json({ recommendations: lowProducts });
    } catch (error) {
      console.error('Reorder recommendations error:', error);
      res.status(500).json({ error: 'Failed to load reorder recommendations.' });
    }
  }
);

router.post(
  '/reorders/trigger-check',
  requireAuth,
  requireRoles('SUPER_ADMIN', 'INVENTORY_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const lowProducts = await db
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.status, 'ACTIVE'),
            lte(products.availableStock, products.reorderPoint)
          )
        );

      const generated = [];
      for (const p of lowProducts) {
        const po = await evaluateReorderForProduct(p.id, req.authUser!.id);
        if (po) generated.push(po);
      }

      res.json({
        checkedCount: lowProducts.length,
        generatedCount: generated.length,
        purchaseOrders: generated,
      });
    } catch (error) {
      console.error('Trigger reorder check error:', error);
      res.status(500).json({ error: 'Failed to execute reorder check.' });
    }
  }
);

router.get(
  '/procurement/purchase-orders',
  requireAuth,
  requireRoles('SUPER_ADMIN', 'INVENTORY_MANAGER', 'WAREHOUSE_STAFF'),
  async (_req, res) => {
    try {
      const pos = await db
        .select({
          id: purchaseOrders.id,
          poNumber: purchaseOrders.poNumber,
          supplierId: purchaseOrders.supplierId,
          supplierName: suppliers.name,
          status: purchaseOrders.status,
          totalCostRwf: purchaseOrders.totalCostRwf,
          expectedDeliveryDate: purchaseOrders.expectedDeliveryDate,
          notes: purchaseOrders.notes,
          isAutoGenerated: purchaseOrders.isAutoGenerated,
          receivedAt: purchaseOrders.receivedAt,
          createdAt: purchaseOrders.createdAt,
        })
        .from(purchaseOrders)
        .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
        .orderBy(desc(purchaseOrders.createdAt));

      const items = await db
        .select({
          id: purchaseOrderItems.id,
          purchaseOrderId: purchaseOrderItems.purchaseOrderId,
          productId: purchaseOrderItems.productId,
          productName: products.name,
          sku: products.sku,
          quantityOrdered: purchaseOrderItems.quantityOrdered,
          quantityReceived: purchaseOrderItems.quantityReceived,
          unitCostRwf: purchaseOrderItems.unitCostRwf,
          lineTotalRwf: purchaseOrderItems.lineTotalRwf,
        })
        .from(purchaseOrderItems)
        .innerJoin(products, eq(products.id, purchaseOrderItems.productId));

      const itemsByPo = new Map<number, typeof items>();
      for (const item of items) {
        const list = itemsByPo.get(item.purchaseOrderId) || [];
        list.push(item);
        itemsByPo.set(item.purchaseOrderId, list);
      }

      res.json({
        purchaseOrders: pos.map((po) => ({
          ...po,
          items: itemsByPo.get(po.id) || [],
        })),
      });
    } catch (error) {
      console.error('List POs error:', error);
      res.status(500).json({ error: 'Failed to load purchase orders.' });
    }
  }
);

router.post(
  '/procurement/purchase-orders',
  requireAuth,
  requireRoles('SUPER_ADMIN', 'INVENTORY_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const schema = z.object({
        supplierId: z.number().int().positive(),
        notes: z.string().optional().default(''),
        items: z
          .array(
            z.object({
              productId: z.number().int().positive(),
              quantityOrdered: z.number().int().positive(),
              unitCostRwf: z.number().int().positive(),
            })
          )
          .min(1),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid purchase order payload.' });
      }

      const d = parsed.data;
      const totalCost = d.items.reduce(
        (sum, i) => sum + i.quantityOrdered * i.unitCostRwf,
        0
      );
      const poNumber = `PO-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 89999)}`;
      const expectedDeliveryDate = new Date(Date.now() + 5 * 86400000);

      const created = await db.transaction(async (tx) => {
        const [po] = await tx
          .insert(purchaseOrders)
          .values({
            poNumber,
            supplierId: d.supplierId,
            status: 'PENDING_APPROVAL',
            totalCostRwf: totalCost,
            expectedDeliveryDate,
            notes: d.notes,
            isAutoGenerated: false,
            createdById: req.authUser!.id,
          })
          .returning();

        await tx.insert(purchaseOrderItems).values(
          d.items.map((item) => ({
            purchaseOrderId: po.id,
            productId: item.productId,
            quantityOrdered: item.quantityOrdered,
            quantityReceived: 0,
            unitCostRwf: item.unitCostRwf,
            lineTotalRwf: item.quantityOrdered * item.unitCostRwf,
          }))
        );

        return po;
      });

      await logAudit({
        userId: req.authUser!.id,
        actorEmail: req.authUser!.email,
        action: 'PURCHASE_ORDER_CREATED',
        entityType: 'purchase_order',
        entityId: created.id,
        ipAddress: req.ip,
      });

      emitRealtimeEvent('procurement:updated', { purchaseOrderId: created.id });
      res.status(201).json({ purchaseOrder: created });
    } catch (error) {
      console.error('Create PO error:', error);
      res.status(500).json({ error: 'Failed to create purchase order.' });
    }
  }
);

router.patch(
  '/procurement/purchase-orders/:id/status',
  requireAuth,
  requireRoles('SUPER_ADMIN', 'INVENTORY_MANAGER', 'WAREHOUSE_STAFF'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const parsed = z
        .object({
          status: z.enum([
            'PENDING_APPROVAL',
            'APPROVED',
            'ORDERED',
            'RECEIVED',
            'CANCELLED',
          ]),
        })
        .safeParse(req.body);

      if (!parsed.success || Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid status payload.' });
      }

      const nextStatus = parsed.data.status;
      if (
        nextStatus === 'APPROVED' &&
        req.authUser!.role !== 'SUPER_ADMIN' &&
        req.authUser!.role !== 'INVENTORY_MANAGER'
      ) {
        return res
          .status(403)
          .json({ error: 'Only Inventory Managers or Super Admins can approve POs.' });
      }

      const updatedPo = await db.transaction(async (tx) => {
        const [po] = await tx
          .select()
          .from(purchaseOrders)
          .where(eq(purchaseOrders.id, id))
          .limit(1);
        if (!po) throw new Error('PO_NOT_FOUND');
        if (po.status === 'RECEIVED') throw new Error('ALREADY_RECEIVED');

        const [saved] = await tx
          .update(purchaseOrders)
          .set({
            status: nextStatus,
            ...(nextStatus === 'APPROVED'
              ? { approvedById: req.authUser!.id }
              : {}),
            ...(nextStatus === 'RECEIVED' ? { receivedAt: new Date() } : {}),
            updatedAt: new Date(),
          })
          .where(eq(purchaseOrders.id, id))
          .returning();

        if (nextStatus === 'RECEIVED') {
          const poItems = await tx
            .select()
            .from(purchaseOrderItems)
            .where(eq(purchaseOrderItems.purchaseOrderId, id));

          const [mainWh] = await tx.select().from(warehouses).limit(1);

          for (const item of poItems) {
            const locked = await tx.execute(
              sql`SELECT id, available_stock FROM products WHERE id = ${item.productId} FOR UPDATE`
            );
            const prev = Number(
              (locked.rows[0] as { available_stock: number })?.available_stock || 0
            );
            const nextStock = prev + item.quantityOrdered;

            await tx
              .update(products)
              .set({ availableStock: nextStock, updatedAt: new Date() })
              .where(eq(products.id, item.productId));

            await tx
              .update(purchaseOrderItems)
              .set({ quantityReceived: item.quantityOrdered })
              .where(eq(purchaseOrderItems.id, item.id));

            if (mainWh) {
              await tx
                .insert(inventory)
                .values({
                  productId: item.productId,
                  warehouseId: mainWh.id,
                  quantityOnHand: item.quantityOrdered,
                  binLocation: 'RCV-01',
                  batchCode: `PO-${po.poNumber}`,
                })
                .onConflictDoUpdate({
                  target: [inventory.productId, inventory.warehouseId],
                  set: {
                    quantityOnHand: sql`${inventory.quantityOnHand} + ${item.quantityOrdered}`,
                    updatedAt: new Date(),
                  },
                });
            }

            await tx.insert(stockMovements).values({
              productId: item.productId,
              warehouseId: mainWh?.id ?? null,
              type: 'INCOMING',
              quantityDelta: item.quantityOrdered,
              previousStock: prev,
              newStock: nextStock,
              referenceType: 'PURCHASE_ORDER',
              referenceId: po.poNumber,
              notes: `Goods received from Purchase Order ${po.poNumber}`,
              performedById: req.authUser!.id,
            });
          }
        }

        return saved;
      });

      await createNotification({
        targetRole: 'INVENTORY_MANAGER',
        type: 'PROCUREMENT',
        title: `PO ${updatedPo.poNumber} -> ${nextStatus}`,
        message:
          nextStatus === 'RECEIVED'
            ? `Goods received for ${updatedPo.poNumber}. Stock levels updated automatically.`
            : `Purchase order ${updatedPo.poNumber} marked as ${nextStatus}.`,
        linkView: 'procurement',
      });

      await logAudit({
        userId: req.authUser!.id,
        actorEmail: req.authUser!.email,
        action: `PO_STATUS_${nextStatus}`,
        entityType: 'purchase_order',
        entityId: id,
        ipAddress: req.ip,
      });

      emitRealtimeEvent('inventory:updated', { poId: id, status: nextStatus });
      emitRealtimeEvent('procurement:updated', { poId: id, status: nextStatus });

      res.json({ purchaseOrder: updatedPo });
    } catch (error: any) {
      if (error?.message === 'PO_NOT_FOUND') {
        return res.status(404).json({ error: 'Purchase order not found.' });
      }
      if (error?.message === 'ALREADY_RECEIVED') {
        return res.status(400).json({ error: 'Purchase order already received.' });
      }
      console.error('Update PO status error:', error);
      res.status(500).json({ error: 'Failed to update purchase order.' });
    }
  }
);

export default router;
