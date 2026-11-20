import { Router } from 'express';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  businessAccounts,
  deliveries,
  invoices,
  orderItems,
  orders,
  ORDER_STATUSES,
  payments,
  products,
  quotationItems,
  quotations,
  stockMovements,
  users,
  warehouses,
  type OrderStatus,
  type TimelineEntry,
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

function computeUnitPrice(
  product: {
    retailPriceRwf: number;
    wholesalePriceRwf: number;
    bulkTiers: { minQty: number; discountPct: number; unitPriceRwf: number }[];
  },
  quantity: number,
  isB2B: boolean
): number {
  let price = isB2B ? product.wholesalePriceRwf : product.retailPriceRwf;
  const sortedTiers = [...(product.bulkTiers || [])].sort(
    (a, b) => b.minQty - a.minQty
  );
  for (const tier of sortedTiers) {
    if (quantity >= tier.minQty && tier.unitPriceRwf < price) {
      price = tier.unitPriceRwf;
      break;
    }
  }
  return price;
}

// ==================== B2B QUOTATIONS (RFQ) ====================

router.get('/quotations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const isStaff = ['SUPER_ADMIN', 'SALES_MANAGER'].includes(req.authUser!.role);

    const quoteRows = await db
      .select({
        id: quotations.id,
        quoteNumber: quotations.quoteNumber,
        userId: quotations.userId,
        customerName: users.fullName,
        customerEmail: users.email,
        companyName: businessAccounts.companyName,
        status: quotations.status,
        subtotalRwf: quotations.subtotalRwf,
        discountRwf: quotations.discountRwf,
        totalRwf: quotations.totalRwf,
        validUntil: quotations.validUntil,
        customerNotes: quotations.customerNotes,
        internalNotes: quotations.internalNotes,
        createdAt: quotations.createdAt,
      })
      .from(quotations)
      .innerJoin(users, eq(users.id, quotations.userId))
      .leftJoin(
        businessAccounts,
        eq(businessAccounts.id, quotations.businessAccountId)
      )
      .where(isStaff ? undefined : eq(quotations.userId, req.authUser!.id))
      .orderBy(desc(quotations.createdAt));

    const itemRows = await db
      .select({
        id: quotationItems.id,
        quotationId: quotationItems.quotationId,
        productId: quotationItems.productId,
        productName: products.name,
        sku: products.sku,
        retailPriceRwf: products.retailPriceRwf,
        quantity: quotationItems.quantity,
        requestedPriceRwf: quotationItems.requestedPriceRwf,
        quotedPriceRwf: quotationItems.quotedPriceRwf,
        lineTotalRwf: quotationItems.lineTotalRwf,
      })
      .from(quotationItems)
      .innerJoin(products, eq(products.id, quotationItems.productId));

    const byQuote = new Map<number, typeof itemRows>();
    for (const item of itemRows) {
      const list = byQuote.get(item.quotationId) || [];
      list.push(item);
      byQuote.set(item.quotationId, list);
    }

    res.json({
      quotations: quoteRows.map((q) => ({
        ...q,
        items: byQuote.get(q.id) || [],
      })),
    });
  } catch (error) {
    console.error('List quotations error:', error);
    res.status(500).json({ error: 'Failed to load quotations.' });
  }
});

router.post('/quotations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      customerNotes: z.string().optional().default(''),
      items: z
        .array(
          z.object({
            productId: z.number().int().positive(),
            quantity: z.number().int().positive(),
            requestedPriceRwf: z.number().int().positive().optional(),
          })
        )
        .min(1),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid quotation request.' });
    }

    const [biz] = await db
      .select()
      .from(businessAccounts)
      .where(eq(businessAccounts.userId, req.authUser!.id))
      .limit(1);

    const quoteNumber = `RFQ-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 8999)}`;

    const created = await db.transaction(async (tx) => {
      let subtotal = 0;
      const lineItems: {
        productId: number;
        quantity: number;
        requestedPriceRwf: number;
        quotedPriceRwf: number;
        lineTotalRwf: number;
      }[] = [];

      for (const reqItem of parsed.data.items) {
        const [prod] = await tx
          .select()
          .from(products)
          .where(eq(products.id, reqItem.productId))
          .limit(1);
        if (!prod) throw new Error('PRODUCT_NOT_FOUND');

        const baseWholesale = computeUnitPrice(prod, reqItem.quantity, true);
        const requested = reqItem.requestedPriceRwf || baseWholesale;
        const lineTotal = requested * reqItem.quantity;
        subtotal += prod.retailPriceRwf * reqItem.quantity;
        lineItems.push({
          productId: prod.id,
          quantity: reqItem.quantity,
          requestedPriceRwf: requested,
          quotedPriceRwf: requested,
          lineTotalRwf: lineTotal,
        });
      }

      const quotedTotal = lineItems.reduce((s, l) => s + l.lineTotalRwf, 0);
      const discount = Math.max(0, subtotal - quotedTotal);

      const [q] = await tx
        .insert(quotations)
        .values({
          quoteNumber,
          userId: req.authUser!.id,
          businessAccountId: biz?.id ?? null,
          status: 'REQUESTED',
          subtotalRwf: subtotal,
          discountRwf: discount,
          totalRwf: quotedTotal,
          validUntil: new Date(Date.now() + 14 * 86400000),
          customerNotes: parsed.data.customerNotes,
        })
        .returning();

      await tx.insert(quotationItems).values(
        lineItems.map((l) => ({
          quotationId: q.id,
          ...l,
        }))
      );

      return q;
    });

    await createNotification({
      targetRole: 'SALES_MANAGER',
      type: 'PROCUREMENT',
      title: `New B2B RFQ: ${created.quoteNumber}`,
      message: `${req.authUser!.fullName} submitted a bulk quotation request totaling Rwf ${created.totalRwf.toLocaleString()}.`,
      linkView: 'b2b',
    });

    res.status(201).json({ quotation: created });
  } catch (error) {
    console.error('Create quotation error:', error);
    res.status(500).json({ error: 'Failed to submit quotation request.' });
  }
});

router.patch('/quotations/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const schema = z.object({
      status: z.enum(['REVIEWING', 'QUOTED', 'ACCEPTED', 'REJECTED']),
      internalNotes: z.string().optional(),
      discountRwf: z.number().int().min(0).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success || Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid quotation update.' });
    }

    const [existing] = await db
      .select()
      .from(quotations)
      .where(eq(quotations.id, id))
      .limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Quotation not found.' });
    }

    const isStaff = ['SUPER_ADMIN', 'SALES_MANAGER'].includes(req.authUser!.role);
    if (
      ['REVIEWING', 'QUOTED', 'REJECTED'].includes(parsed.data.status) &&
      !isStaff
    ) {
      return res
        .status(403)
        .json({ error: 'Only Sales Managers or Admins can issue quotes.' });
    }
    if (
      parsed.data.status === 'ACCEPTED' &&
      existing.userId !== req.authUser!.id &&
      !isStaff
    ) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const nextDiscount = parsed.data.discountRwf ?? existing.discountRwf;
    const nextTotal = Math.max(0, existing.subtotalRwf - nextDiscount);

    const [updated] = await db
      .update(quotations)
      .set({
        status: parsed.data.status,
        discountRwf: nextDiscount,
        totalRwf: nextTotal,
        ...(parsed.data.internalNotes !== undefined
          ? { internalNotes: parsed.data.internalNotes }
          : {}),
        reviewedById: isStaff ? req.authUser!.id : existing.reviewedById,
        updatedAt: new Date(),
      })
      .where(eq(quotations.id, id))
      .returning();

    res.json({ quotation: updated });
  } catch (error) {
    console.error('Update quotation error:', error);
    res.status(500).json({ error: 'Failed to update quotation.' });
  }
});

// ==================== ORDERS & CHECKOUT ====================

router.get('/orders/track/:orderNumber', async (req, res) => {
  try {
    const orderNumber = String(req.params.orderNumber || '')
      .trim()
      .replace(/^#/, '')
      .toUpperCase();

    if (!orderNumber) {
      return res.status(400).json({ error: 'Order number is required.' });
    }

    const [order] = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        orderType: orders.orderType,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        subtotalRwf: orders.subtotalRwf,
        deliveryFeeRwf: orders.deliveryFeeRwf,
        taxRwf: orders.taxRwf,
        totalRwf: orders.totalRwf,
        statusTimeline: orders.statusTimeline,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
        deliveryStatus: deliveries.status,
        trackingCode: deliveries.trackingCode,
        scheduledDate: deliveries.scheduledDate,
        timeSlot: deliveries.timeSlot,
        driverName: deliveries.driverName,
        vehiclePlate: deliveries.vehiclePlate,
        deliveredAt: deliveries.deliveredAt,
      })
      .from(orders)
      .leftJoin(deliveries, eq(deliveries.orderId, orders.id))
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);

    if (!order) {
      return res
        .status(404)
        .json({ error: `Order ${orderNumber} was not found.` });
    }

    const items = await db
      .select({
        id: orderItems.id,
        productName: orderItems.productName,
        sku: orderItems.sku,
        quantity: orderItems.quantity,
        fulfilledQuantity: orderItems.fulfilledQuantity,
        unitPriceRwf: orderItems.unitPriceRwf,
        lineTotalRwf: orderItems.lineTotalRwf,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    res.json({ order: { ...order, items } });
  } catch (error) {
    console.error('Track order error:', error);
    res.status(500).json({ error: 'Failed to track order.' });
  }
});

router.get('/orders', requireAuth, async (req: AuthRequest, res) => {
  try {
    const isStaff = [
      'SUPER_ADMIN',
      'SALES_MANAGER',
      'WAREHOUSE_STAFF',
      'DELIVERY_MANAGER',
      'INVENTORY_MANAGER',
    ].includes(req.authUser!.role);

    const orderRows = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        userId: orders.userId,
        customerName: users.fullName,
        customerEmail: users.email,
        orderType: orders.orderType,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        subtotalRwf: orders.subtotalRwf,
        discountRwf: orders.discountRwf,
        deliveryFeeRwf: orders.deliveryFeeRwf,
        taxRwf: orders.taxRwf,
        totalRwf: orders.totalRwf,
        shippingAddress: orders.shippingAddress,
        internalNotes: orders.internalNotes,
        statusTimeline: orders.statusTimeline,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
        deliveryId: deliveries.id,
        trackingCode: deliveries.trackingCode,
        scheduledDate: deliveries.scheduledDate,
        timeSlot: deliveries.timeSlot,
        driverName: deliveries.driverName,
        vehiclePlate: deliveries.vehiclePlate,
        deliveryStatus: deliveries.status,
        invoiceNumber: invoices.invoiceNumber,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .leftJoin(deliveries, eq(deliveries.orderId, orders.id))
      .leftJoin(invoices, eq(invoices.orderId, orders.id))
      .where(isStaff ? undefined : eq(orders.userId, req.authUser!.id))
      .orderBy(desc(orders.createdAt));

    const itemRows = await db.select().from(orderItems);
    const itemsByOrder = new Map<number, typeof itemRows>();
    for (const item of itemRows) {
      const list = itemsByOrder.get(item.orderId) || [];
      list.push(item);
      itemsByOrder.set(item.orderId, list);
    }

    const paymentRows = await db.select().from(payments);
    const payByOrder = new Map<number, typeof paymentRows>();
    for (const p of paymentRows) {
      const list = payByOrder.get(p.orderId) || [];
      list.push(p);
      payByOrder.set(p.orderId, list);
    }

    res.json({
      orders: orderRows.map((o) => ({
        ...o,
        items: itemsByOrder.get(o.id) || [],
        payments: payByOrder.get(o.id) || [],
      })),
    });
  } catch (error) {
    console.error('List orders error:', error);
    res.status(500).json({ error: 'Failed to load orders.' });
  }
});

router.post('/orders', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      items: z
        .array(
          z.object({
            productId: z.number().int().positive(),
            quantity: z.number().int().positive(),
          })
        )
        .min(1),
      shippingAddress: z.object({
        recipientName: z.string().min(2),
        phone: z.string().min(6),
        province: z.string().min(2),
        district: z.string().min(2),
        sector: z.string().optional().default(''),
        streetAddress: z.string().min(3),
      }),
      scheduledDate: z.string().min(8),
      timeSlot: z.string().default('09:00 - 12:00'),
      paymentProvider: z.enum([
        'MTN_MOMO',
        'AIRTEL_MONEY',
        'BANK_TRANSFER',
        'CASH_ON_DELIVERY',
        'CARD_GATEWAY',
      ]),
      accountHint: z.string().optional().default(''),
      quotationId: z.number().int().positive().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message || 'Invalid checkout payload.' });
    }

    const d = parsed.data;
    const isB2B = req.authUser!.role === 'B2B_CUSTOMER';

    const created = await db.transaction(async (tx) => {
      let subtotal = 0;
      const lineDetails: {
        productId: number;
        name: string;
        sku: string;
        quantity: number;
        unitPriceRwf: number;
        lineTotalRwf: number;
        prevStock: number;
        newStock: number;
      }[] = [];

      for (const reqItem of d.items) {
        const locked = await tx.execute(
          sql`SELECT id, sku, name, retail_price_rwf, wholesale_price_rwf, bulk_tiers, available_stock
              FROM products WHERE id = ${reqItem.productId} FOR UPDATE`
        );
        const prod = locked.rows[0] as
          | {
              id: number;
              sku: string;
              name: string;
              retail_price_rwf: number;
              wholesale_price_rwf: number;
              bulk_tiers: any;
              available_stock: number;
            }
          | undefined;

        if (!prod) throw new Error('PRODUCT_NOT_FOUND');
        if (Number(prod.available_stock) < reqItem.quantity) {
          throw new Error(`INSUFFICIENT_STOCK:${prod.name}`);
        }

        const unitPrice = computeUnitPrice(
          {
            retailPriceRwf: Number(prod.retail_price_rwf),
            wholesalePriceRwf: Number(prod.wholesale_price_rwf),
            bulkTiers: Array.isArray(prod.bulk_tiers) ? prod.bulk_tiers : [],
          },
          reqItem.quantity,
          isB2B
        );
        const lineTotal = unitPrice * reqItem.quantity;
        subtotal += lineTotal;

        const prevStock = Number(prod.available_stock);
        const newStock = prevStock - reqItem.quantity;

        await tx
          .update(products)
          .set({ availableStock: newStock, updatedAt: new Date() })
          .where(eq(products.id, prod.id));

        lineDetails.push({
          productId: prod.id,
          name: prod.name,
          sku: prod.sku,
          quantity: reqItem.quantity,
          unitPriceRwf: unitPrice,
          lineTotalRwf: lineTotal,
          prevStock,
          newStock,
        });
      }

      const deliveryFee = subtotal >= 500000 ? 0 : 15000;
      const tax = Math.round(subtotal * 0.18);
      const total = subtotal + deliveryFee + tax;
      const orderNumber = `ORD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 8999)}`;

      const isInstantPayment = ['MTN_MOMO', 'AIRTEL_MONEY', 'CARD_GATEWAY'].includes(
        d.paymentProvider
      );
      const initialOrderStatus: OrderStatus = isInstantPayment
        ? 'CONFIRMED'
        : 'PAYMENT_PENDING';

      const timeline: TimelineEntry[] = [
        {
          status: 'PENDING',
          timestamp: new Date().toISOString(),
          note: 'Order placed online',
          actor: req.authUser!.fullName,
        },
        {
          status: initialOrderStatus,
          timestamp: new Date().toISOString(),
          note: isInstantPayment
            ? `Payment authorized via ${d.paymentProvider}`
            : `Awaiting ${d.paymentProvider} settlement`,
          actor: 'Payment Gateway',
        },
      ];

      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber,
          userId: req.authUser!.id,
          orderType: isB2B || subtotal >= 1000000 ? 'B2B_BULK' : 'RETAIL',
          status: initialOrderStatus,
          paymentStatus: isInstantPayment ? 'PAID' : 'PENDING',
          subtotalRwf: subtotal,
          discountRwf: 0,
          deliveryFeeRwf: deliveryFee,
          taxRwf: tax,
          totalRwf: total,
          shippingAddress: d.shippingAddress,
          statusTimeline: timeline,
        })
        .returning();

      const [mainWh] = await tx.select().from(warehouses).limit(1);

      for (const item of lineDetails) {
        await tx.insert(orderItems).values({
          orderId: order.id,
          productId: item.productId,
          productName: item.name,
          sku: item.sku,
          quantity: item.quantity,
          fulfilledQuantity: 0,
          unitPriceRwf: item.unitPriceRwf,
          lineTotalRwf: item.lineTotalRwf,
        });

        await tx.insert(stockMovements).values({
          productId: item.productId,
          warehouseId: mainWh?.id ?? null,
          type: 'OUTGOING',
          quantityDelta: -item.quantity,
          previousStock: item.prevStock,
          newStock: item.newStock,
          referenceType: 'ORDER',
          referenceId: orderNumber,
          notes: `Stock deducted for order ${orderNumber}`,
          performedById: req.authUser!.id,
        });
      }

      const [payment] = await tx
        .insert(payments)
        .values({
          transactionRef: `TXN-${Date.now().toString().slice(-8)}`,
          orderId: order.id,
          userId: req.authUser!.id,
          provider: d.paymentProvider,
          amountRwf: total,
          status: isInstantPayment ? 'COMPLETED' : 'PENDING',
          maskedAccount: d.accountHint ? `***${d.accountHint.slice(-4)}` : 'Sandbox',
          providerResponse: { mode: 'sandbox', verified: isInstantPayment },
          paidAt: isInstantPayment ? new Date() : null,
        })
        .returning();

      const [invoice] = await tx
        .insert(invoices)
        .values({
          invoiceNumber: `INV-${orderNumber}`,
          orderId: order.id,
          userId: req.authUser!.id,
          subtotalRwf: subtotal,
          taxRwf: tax,
          deliveryFeeRwf: deliveryFee,
          totalRwf: total,
          status: isInstantPayment ? 'PAID' : 'ISSUED',
          dueDate: new Date(Date.now() + 14 * 86400000),
        })
        .returning();

      const [delivery] = await tx
        .insert(deliveries)
        .values({
          orderId: order.id,
          trackingCode: `TRK-${orderNumber.slice(-4)}-${Math.floor(10 + Math.random() * 89)}`,
          scheduledDate: d.scheduledDate,
          timeSlot: d.timeSlot,
          status: 'SCHEDULED',
          deliveryFeeRwf: deliveryFee,
        })
        .returning();

      if (d.quotationId) {
        await tx
          .update(quotations)
          .set({ status: 'CONVERTED', updatedAt: new Date() })
          .where(eq(quotations.id, d.quotationId));
      }

      return { order, payment, invoice, delivery, lineDetails };
    });

    for (const item of created.lineDetails) {
      emitRealtimeEvent('inventory:updated', {
        productId: item.productId,
        availableStock: item.newStock,
      });
      await evaluateReorderForProduct(item.productId, req.authUser!.id);
    }

    await createNotification({
      targetRole: 'SALES_MANAGER',
      type: 'ORDER',
      title: `New Order ${created.order.orderNumber}`,
      message: `${req.authUser!.fullName} placed an order worth Rwf ${created.order.totalRwf.toLocaleString()}.`,
      linkView: 'orders',
    });

    await logAudit({
      userId: req.authUser!.id,
      actorEmail: req.authUser!.email,
      action: 'ORDER_CREATED',
      entityType: 'order',
      entityId: created.order.orderNumber,
      details: { totalRwf: created.order.totalRwf },
      ipAddress: req.ip,
    });

    emitRealtimeEvent('order:updated', {
      orderId: created.order.id,
      orderNumber: created.order.orderNumber,
      status: created.order.status,
    });

    res.status(201).json({
      order: created.order,
      payment: created.payment,
      invoice: created.invoice,
      delivery: created.delivery,
    });
  } catch (error: any) {
    if (error?.message === 'PRODUCT_NOT_FOUND') {
      return res.status(404).json({ error: 'One or more products were not found.' });
    }
    if (String(error?.message || '').startsWith('INSUFFICIENT_STOCK:')) {
      const name = String(error.message).split(':')[1];
      return res
        .status(400)
        .json({ error: `Insufficient stock available for ${name}.` });
    }
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to place order.' });
  }
});

router.patch(
  '/orders/:id/status',
  requireAuth,
  requireRoles(
    'SUPER_ADMIN',
    'SALES_MANAGER',
    'WAREHOUSE_STAFF',
    'DELIVERY_MANAGER'
  ),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const schema = z.object({
        status: z.enum(ORDER_STATUSES),
        note: z.string().optional().default(''),
        internalNotes: z.string().optional(),
        itemFulfillments: z
          .array(
            z.object({
              orderItemId: z.number().int().positive(),
              fulfilledQuantity: z.number().int().min(0),
            })
          )
          .optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success || Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid order status payload.' });
      }

      const [existing] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, id))
        .limit(1);
      if (!existing) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      const nextTimeline: TimelineEntry[] = [
        ...(existing.statusTimeline || []),
        {
          status: parsed.data.status,
          timestamp: new Date().toISOString(),
          note:
            parsed.data.note || `Order moved to ${parsed.data.status.replace(/_/g, ' ')}`,
          actor: req.authUser!.fullName,
        },
      ];

      const [updated] = await db.transaction(async (tx) => {
        const resOrder = await tx
          .update(orders)
          .set({
            status: parsed.data.status,
            statusTimeline: nextTimeline,
            ...(parsed.data.internalNotes !== undefined
              ? { internalNotes: parsed.data.internalNotes }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(orders.id, id))
          .returning();

        if (parsed.data.itemFulfillments) {
          for (const f of parsed.data.itemFulfillments) {
            await tx
              .update(orderItems)
              .set({ fulfilledQuantity: f.fulfilledQuantity })
              .where(eq(orderItems.id, f.orderItemId));
          }
        }

        if (parsed.data.status === 'CANCELLED' && existing.status !== 'CANCELLED') {
          const items = await tx
            .select()
            .from(orderItems)
            .where(eq(orderItems.orderId, id));
          for (const item of items) {
            const locked = await tx.execute(
              sql`SELECT available_stock FROM products WHERE id = ${item.productId} FOR UPDATE`
            );
            const prev = Number(
              (locked.rows[0] as { available_stock: number })?.available_stock || 0
            );
            const restored = prev + item.quantity;
            await tx
              .update(products)
              .set({ availableStock: restored, updatedAt: new Date() })
              .where(eq(products.id, item.productId));

            await tx.insert(stockMovements).values({
              productId: item.productId,
              type: 'RETURN',
              quantityDelta: item.quantity,
              previousStock: prev,
              newStock: restored,
              referenceType: 'ORDER_CANCELLATION',
              referenceId: existing.orderNumber,
              notes: `Stock restored upon cancellation of ${existing.orderNumber}`,
              performedById: req.authUser!.id,
            });
          }
        }

        return resOrder;
      });

      await createNotification({
        userId: existing.userId,
        type: 'ORDER',
        title: `Order ${existing.orderNumber}: ${parsed.data.status.replace(/_/g, ' ')}`,
        message: parsed.data.note || `Your order status is now ${parsed.data.status}.`,
        linkView: 'track',
      });

      await logAudit({
        userId: req.authUser!.id,
        actorEmail: req.authUser!.email,
        action: `ORDER_STATUS_${parsed.data.status}`,
        entityType: 'order',
        entityId: existing.orderNumber,
        ipAddress: req.ip,
      });

      emitRealtimeEvent('order:updated', {
        orderId: id,
        orderNumber: existing.orderNumber,
        status: parsed.data.status,
      });

      res.json({ order: updated });
    } catch (error) {
      console.error('Order status update error:', error);
      res.status(500).json({ error: 'Failed to update order status.' });
    }
  }
);

// ==================== PAYMENTS ====================

router.get('/payments', requireAuth, async (req: AuthRequest, res) => {
  try {
    const isStaff = ['SUPER_ADMIN', 'SALES_MANAGER'].includes(req.authUser!.role);
    const rows = await db
      .select({
        id: payments.id,
        transactionRef: payments.transactionRef,
        orderId: payments.orderId,
        orderNumber: orders.orderNumber,
        customerName: users.fullName,
        provider: payments.provider,
        amountRwf: payments.amountRwf,
        status: payments.status,
        maskedAccount: payments.maskedAccount,
        paidAt: payments.paidAt,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .innerJoin(users, eq(users.id, payments.userId))
      .where(isStaff ? undefined : eq(payments.userId, req.authUser!.id))
      .orderBy(desc(payments.createdAt));

    res.json({ payments: rows });
  } catch (error) {
    console.error('List payments error:', error);
    res.status(500).json({ error: 'Failed to load payments.' });
  }
});

router.post(
  '/payments/:id/confirm',
  requireAuth,
  requireRoles('SUPER_ADMIN', 'SALES_MANAGER', 'DELIVERY_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.id, id))
        .limit(1);
      if (!payment) {
        return res.status(404).json({ error: 'Payment record not found.' });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(payments)
          .set({ status: 'COMPLETED', paidAt: new Date() })
          .where(eq(payments.id, id));
        await tx
          .update(orders)
          .set({ paymentStatus: 'PAID', status: 'CONFIRMED', updatedAt: new Date() })
          .where(eq(orders.id, payment.orderId));
        await tx
          .update(invoices)
          .set({ status: 'PAID' })
          .where(eq(invoices.orderId, payment.orderId));
      });

      await createNotification({
        userId: payment.userId,
        type: 'PAYMENT',
        title: `Payment Confirmed (${payment.transactionRef})`,
        message: `Rwf ${payment.amountRwf.toLocaleString()} settled successfully.`,
        linkView: 'orders',
      });

      res.json({ ok: true });
    } catch (error) {
      console.error('Confirm payment error:', error);
      res.status(500).json({ error: 'Failed to confirm payment.' });
    }
  }
);

router.post(
  '/payments/:id/refund',
  requireAuth,
  requireRoles('SUPER_ADMIN', 'SALES_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.id, id))
        .limit(1);
      if (!payment) {
        return res.status(404).json({ error: 'Payment record not found.' });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(payments)
          .set({ status: 'REFUNDED' })
          .where(eq(payments.id, id));
        await tx
          .update(orders)
          .set({ paymentStatus: 'REFUNDED', updatedAt: new Date() })
          .where(eq(orders.id, payment.orderId));
      });

      await logAudit({
        userId: req.authUser!.id,
        actorEmail: req.authUser!.email,
        action: 'PAYMENT_REFUNDED',
        entityType: 'payment',
        entityId: payment.transactionRef,
        ipAddress: req.ip,
      });

      res.json({ ok: true });
    } catch (error) {
      console.error('Refund error:', error);
      res.status(500).json({ error: 'Failed to refund payment.' });
    }
  }
);

// ==================== DELIVERIES & LOGISTICS ====================

router.get('/deliveries', requireAuth, async (req: AuthRequest, res) => {
  try {
    const isStaff = [
      'SUPER_ADMIN',
      'DELIVERY_MANAGER',
      'WAREHOUSE_STAFF',
      'SALES_MANAGER',
    ].includes(req.authUser!.role);

    const rows = await db
      .select({
        id: deliveries.id,
        orderId: deliveries.orderId,
        orderNumber: orders.orderNumber,
        customerName: users.fullName,
        shippingAddress: orders.shippingAddress,
        trackingCode: deliveries.trackingCode,
        scheduledDate: deliveries.scheduledDate,
        timeSlot: deliveries.timeSlot,
        driverName: deliveries.driverName,
        driverPhone: deliveries.driverPhone,
        vehiclePlate: deliveries.vehiclePlate,
        status: deliveries.status,
        deliveryFeeRwf: deliveries.deliveryFeeRwf,
        proofOfDelivery: deliveries.proofOfDelivery,
        deliveredAt: deliveries.deliveredAt,
      })
      .from(deliveries)
      .innerJoin(orders, eq(orders.id, deliveries.orderId))
      .innerJoin(users, eq(users.id, orders.userId))
      .where(isStaff ? undefined : eq(orders.userId, req.authUser!.id))
      .orderBy(desc(deliveries.scheduledDate));

    res.json({ deliveries: rows });
  } catch (error) {
    console.error('Deliveries list error:', error);
    res.status(500).json({ error: 'Failed to load deliveries.' });
  }
});

router.patch(
  '/deliveries/:id',
  requireAuth,
  requireRoles('SUPER_ADMIN', 'DELIVERY_MANAGER', 'WAREHOUSE_STAFF'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const schema = z.object({
        scheduledDate: z.string().optional(),
        timeSlot: z.string().optional(),
        driverName: z.string().optional(),
        driverPhone: z.string().optional(),
        vehiclePlate: z.string().optional(),
        status: z
          .enum([
            'SCHEDULED',
            'ASSIGNED',
            'DISPATCHED',
            'IN_TRANSIT',
            'DELIVERED',
            'FAILED',
          ])
          .optional(),
        signedBy: z.string().optional(),
        podNotes: z.string().optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success || Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid delivery update.' });
      }

      const [existing] = await db
        .select()
        .from(deliveries)
        .where(eq(deliveries.id, id))
        .limit(1);
      if (!existing) {
        return res.status(404).json({ error: 'Delivery not found.' });
      }

      const nextDate = parsed.data.scheduledDate || existing.scheduledDate;
      const nextSlot = parsed.data.timeSlot || existing.timeSlot;
      const nextDriver = parsed.data.driverName ?? existing.driverName;

      // Prevent conflicting delivery assignment for same driver + date + slot
      if (nextDriver && nextDriver !== 'Unassigned') {
        const conflicts = await db
          .select({ id: deliveries.id })
          .from(deliveries)
          .where(
            and(
              ne(deliveries.id, id),
              eq(deliveries.driverName, nextDriver),
              eq(deliveries.scheduledDate, nextDate),
              eq(deliveries.timeSlot, nextSlot),
              ne(deliveries.status, 'DELIVERED'),
              ne(deliveries.status, 'FAILED')
            )
          )
          .limit(1);

        if (conflicts.length > 0) {
          return res.status(409).json({
            error: `Schedule conflict: ${nextDriver} is already assigned on ${nextDate} (${nextSlot}).`,
          });
        }
      }

      const nextStatus = parsed.data.status || existing.status;
      const [updated] = await db
        .update(deliveries)
        .set({
          scheduledDate: nextDate,
          timeSlot: nextSlot,
          driverName: nextDriver,
          ...(parsed.data.driverPhone !== undefined
            ? { driverPhone: parsed.data.driverPhone }
            : {}),
          ...(parsed.data.vehiclePlate !== undefined
            ? { vehiclePlate: parsed.data.vehiclePlate }
            : {}),
          status: nextStatus,
          ...(nextStatus === 'DELIVERED'
            ? {
                deliveredAt: new Date(),
                proofOfDelivery: {
                  signedBy: parsed.data.signedBy || 'Site Supervisor',
                  notes: parsed.data.podNotes || 'Delivered in full condition',
                  confirmedAt: new Date().toISOString(),
                },
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(deliveries.id, id))
        .returning();

      // Sync corresponding order status on key delivery milestones
      if (['DISPATCHED', 'IN_TRANSIT', 'DELIVERED'].includes(nextStatus)) {
        const [ord] = await db
          .select()
          .from(orders)
          .where(eq(orders.id, existing.orderId))
          .limit(1);
        if (ord) {
          const nextTimeline: TimelineEntry[] = [
            ...(ord.statusTimeline || []),
            {
              status: nextStatus as OrderStatus,
              timestamp: new Date().toISOString(),
              note: `Delivery ${nextStatus.toLowerCase()} by ${nextDriver}`,
              actor: req.authUser!.fullName,
            },
          ];
          await db
            .update(orders)
            .set({
              status: nextStatus,
              statusTimeline: nextTimeline,
              updatedAt: new Date(),
            })
            .where(eq(orders.id, ord.id));

          emitRealtimeEvent('order:updated', {
            orderId: ord.id,
            orderNumber: ord.orderNumber,
            status: nextStatus,
          });
        }
      }

      emitRealtimeEvent('delivery:updated', updated);
      res.json({ delivery: updated });
    } catch (error) {
      console.error('Update delivery error:', error);
      res.status(500).json({ error: 'Failed to update delivery schedule.' });
    }
  }
);

export default router;
