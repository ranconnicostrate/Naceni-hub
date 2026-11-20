import { Router } from 'express';
import { and, asc, desc, eq, gte, ilike, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  categories,
  inventory,
  products,
  reorderRules,
  suppliers,
  warehouses,
  wishlists,
} from '../../db/schema.ts';
import {
  requireAuth,
  requireRoles,
  type AuthRequest,
} from '../middleware/auth.ts';
import { emitRealtimeEvent, logAudit } from '../utils/audit.ts';

const router = Router();

router.get('/categories', async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
    res.json({ categories: rows });
  } catch (error) {
    console.error('Categories fetch error:', error);
    res.status(500).json({ error: 'Failed to load categories.' });
  }
});

router.post(
  '/categories',
  requireAuth,
  requireRoles('SUPER_ADMIN', 'INVENTORY_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const parsed = z
        .object({
          name: z.string().min(2),
          description: z.string().optional().default(''),
          icon: z.string().optional().default('package'),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid category payload.' });
      }
      const slug = parsed.data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const [created] = await db
        .insert(categories)
        .values({
          name: parsed.data.name,
          slug,
          description: parsed.data.description,
          icon: parsed.data.icon,
        })
        .returning();

      res.status(201).json({ category: created });
    } catch (error) {
      console.error('Create category error:', error);
      res.status(500).json({ error: 'Failed to create category.' });
    }
  }
);

router.get('/products', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const categorySlug = String(req.query.category || '').trim();
    const sort = String(req.query.sort || 'popular');
    const featured = req.query.featured === 'true';
    const includeInactive = req.query.includeInactive === 'true';
    const minPrice = Number(req.query.minPrice || 0);
    const maxPrice = Number(req.query.maxPrice || 0);

    const conditions = [];
    if (!includeInactive) {
      conditions.push(eq(products.status, 'ACTIVE'));
    }
    if (featured) {
      conditions.push(eq(products.isFeatured, true));
    }
    if (search) {
      conditions.push(
        or(
          ilike(products.name, `%${search}%`),
          ilike(products.sku, `%${search}%`),
          ilike(products.brand, `%${search}%`),
          ilike(products.description, `%${search}%`)
        )!
      );
    }
    if (minPrice > 0) {
      conditions.push(gte(products.retailPriceRwf, minPrice));
    }
    if (maxPrice > 0) {
      conditions.push(lte(products.retailPriceRwf, maxPrice));
    }

    if (categorySlug && categorySlug !== 'all') {
      const [cat] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, categorySlug))
        .limit(1);
      if (cat) {
        conditions.push(eq(products.categoryId, cat.id));
      } else {
        return res.json({ products: [], total: 0 });
      }
    }

    const orderByClause =
      sort === 'price_asc'
        ? asc(products.retailPriceRwf)
        : sort === 'price_desc'
          ? desc(products.retailPriceRwf)
          : sort === 'newest'
            ? desc(products.createdAt)
            : desc(products.isBestSeller);

    const rows = await db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        slug: products.slug,
        description: products.description,
        categoryId: products.categoryId,
        categoryName: categories.name,
        categorySlug: categories.slug,
        supplierId: products.supplierId,
        supplierName: suppliers.name,
        brand: products.brand,
        unitOfMeasure: products.unitOfMeasure,
        retailPriceRwf: products.retailPriceRwf,
        wholesalePriceRwf: products.wholesalePriceRwf,
        bulkTiers: products.bulkTiers,
        imageUrl: products.imageUrl,
        availableStock: products.availableStock,
        reservedStock: products.reservedStock,
        minStockLevel: products.minStockLevel,
        reorderPoint: products.reorderPoint,
        reorderQuantity: products.reorderQuantity,
        batchNumber: products.batchNumber,
        isFeatured: products.isFeatured,
        isBestSeller: products.isBestSeller,
        promoBadge: products.promoBadge,
        status: products.status,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderByClause, asc(products.id));

    res.json({ products: rows, total: rows.length });
  } catch (error) {
    console.error('Products list error:', error);
    res.status(500).json({ error: 'Failed to load products.' });
  }
});

router.get('/products/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid product ID.' });
    }

    const [product] = await db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        slug: products.slug,
        description: products.description,
        categoryId: products.categoryId,
        categoryName: categories.name,
        categorySlug: categories.slug,
        supplierId: products.supplierId,
        supplierName: suppliers.name,
        brand: products.brand,
        unitOfMeasure: products.unitOfMeasure,
        retailPriceRwf: products.retailPriceRwf,
        wholesalePriceRwf: products.wholesalePriceRwf,
        bulkTiers: products.bulkTiers,
        imageUrl: products.imageUrl,
        availableStock: products.availableStock,
        reservedStock: products.reservedStock,
        minStockLevel: products.minStockLevel,
        reorderPoint: products.reorderPoint,
        reorderQuantity: products.reorderQuantity,
        batchNumber: products.batchNumber,
        isFeatured: products.isFeatured,
        isBestSeller: products.isBestSeller,
        promoBadge: products.promoBadge,
        status: products.status,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(suppliers, eq(suppliers.id, products.supplierId))
      .where(eq(products.id, id))
      .limit(1);

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const warehouseStock = await db
      .select({
        warehouseId: warehouses.id,
        warehouseName: warehouses.name,
        warehouseCode: warehouses.code,
        quantityOnHand: inventory.quantityOnHand,
        binLocation: inventory.binLocation,
        batchCode: inventory.batchCode,
      })
      .from(inventory)
      .innerJoin(warehouses, eq(warehouses.id, inventory.warehouseId))
      .where(eq(inventory.productId, id));

    res.json({ product, warehouseStock });
  } catch (error) {
    console.error('Product detail error:', error);
    res.status(500).json({ error: 'Failed to load product detail.' });
  }
});

const productUpsertSchema = z.object({
  sku: z.string().min(2),
  name: z.string().min(2),
  description: z.string().min(5),
  categoryId: z.number().int().positive(),
  supplierId: z.number().int().positive().nullable().optional(),
  brand: z.string().min(1),
  unitOfMeasure: z.string().min(1).default('Piece'),
  retailPriceRwf: z.number().int().positive(),
  wholesalePriceRwf: z.number().int().positive(),
  availableStock: z.number().int().min(0).default(0),
  minStockLevel: z.number().int().min(0).default(10),
  reorderPoint: z.number().int().min(0).default(15),
  reorderQuantity: z.number().int().positive().default(30),
  imageUrl: z
    .string()
    .optional()
    .default('/src/assets/images/product_cordless_drill_1795165786389.jpg'),
  batchNumber: z.string().optional().default('BATCH-2026-NEW'),
  isFeatured: z.boolean().optional().default(false),
  promoBadge: z.string().nullable().optional(),
});

router.post(
  '/products',
  requireAuth,
  requireRoles('SUPER_ADMIN', 'INVENTORY_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const parsed = productUpsertSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Invalid product payload.',
        });
      }

      const d = parsed.data;
      const slug = `${d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`;
      const bulkTiers = [
        {
          minQty: 10,
          discountPct: 8,
          unitPriceRwf: Math.round(d.retailPriceRwf * 0.92),
        },
        {
          minQty: 30,
          discountPct: 14,
          unitPriceRwf: d.wholesalePriceRwf,
        },
      ];

      const [created] = await db
        .insert(products)
        .values({
          ...d,
          slug,
          bulkTiers,
          status: 'ACTIVE',
        })
        .returning();

      const [mainWh] = await db.select().from(warehouses).limit(1);
      if (mainWh) {
        await db.insert(inventory).values({
          productId: created.id,
          warehouseId: mainWh.id,
          quantityOnHand: created.availableStock,
          binLocation: 'C1-01',
          batchCode: created.batchNumber || 'BATCH-2026-NEW',
        });
      }

      await db.insert(reorderRules).values({
        productId: created.id,
        supplierId: created.supplierId,
        minStockLevel: created.minStockLevel,
        reorderPoint: created.reorderPoint,
        reorderQuantity: created.reorderQuantity,
        leadTimeDays: 4,
        autoDraftPo: true,
        isActive: true,
      });

      await logAudit({
        userId: req.authUser!.id,
        actorEmail: req.authUser!.email,
        action: 'PRODUCT_CREATED',
        entityType: 'product',
        entityId: created.id,
        details: { sku: created.sku, name: created.name },
        ipAddress: req.ip,
      });

      emitRealtimeEvent('inventory:updated', {
        productId: created.id,
        availableStock: created.availableStock,
      });

      res.status(201).json({ product: created });
    } catch (error) {
      console.error('Create product error:', error);
      res.status(500).json({ error: 'Failed to create product.' });
    }
  }
);

router.patch(
  '/products/:id',
  requireAuth,
  requireRoles('SUPER_ADMIN', 'INVENTORY_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid product ID.' });
      }

      const patchSchema = productUpsertSchema.partial().extend({
        status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
      });
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid product update payload.' });
      }

      const [updated] = await db
        .update(products)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(products.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Product not found.' });
      }

      await logAudit({
        userId: req.authUser!.id,
        actorEmail: req.authUser!.email,
        action: 'PRODUCT_UPDATED',
        entityType: 'product',
        entityId: id,
        details: parsed.data,
        ipAddress: req.ip,
      });

      emitRealtimeEvent('inventory:updated', {
        productId: updated.id,
        availableStock: updated.availableStock,
      });

      res.json({ product: updated });
    } catch (error) {
      console.error('Update product error:', error);
      res.status(500).json({ error: 'Failed to update product.' });
    }
  }
);

router.delete(
  '/products/:id',
  requireAuth,
  requireRoles('SUPER_ADMIN', 'INVENTORY_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [archived] = await db
        .update(products)
        .set({ status: 'ARCHIVED', updatedAt: new Date() })
        .where(eq(products.id, id))
        .returning();

      if (!archived) {
        return res.status(404).json({ error: 'Product not found.' });
      }

      await logAudit({
        userId: req.authUser!.id,
        actorEmail: req.authUser!.email,
        action: 'PRODUCT_ARCHIVED',
        entityType: 'product',
        entityId: id,
        ipAddress: req.ip,
      });

      res.json({ ok: true });
    } catch (error) {
      console.error('Archive product error:', error);
      res.status(500).json({ error: 'Failed to archive product.' });
    }
  }
);

router.get('/wishlist', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select({
        id: wishlists.id,
        productId: wishlists.productId,
      })
      .from(wishlists)
      .where(eq(wishlists.userId, req.authUser!.id));
    res.json({ productIds: rows.map((r) => r.productId) });
  } catch (error) {
    console.error('Wishlist fetch error:', error);
    res.status(500).json({ error: 'Failed to load wishlist.' });
  }
});

router.post('/wishlist/toggle', requireAuth, async (req: AuthRequest, res) => {
  try {
    const productId = Number(req.body?.productId);
    if (Number.isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID.' });
    }

    const existing = await db
      .select()
      .from(wishlists)
      .where(
        and(
          eq(wishlists.userId, req.authUser!.id),
          eq(wishlists.productId, productId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db.delete(wishlists).where(eq(wishlists.id, existing[0].id));
      return res.json({ saved: false });
    }

    await db.insert(wishlists).values({
      userId: req.authUser!.id,
      productId,
    });
    res.json({ saved: true });
  } catch (error) {
    console.error('Wishlist toggle error:', error);
    res.status(500).json({ error: 'Failed to update wishlist.' });
  }
});

export default router;
