import { Router } from 'express';
import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  businessAccounts,
  categories,
  deliveries,
  notifications,
  orderItems,
  orders,
  payments,
  products,
  purchaseOrders,
  stockMovements,
  suppliers,
  users,
} from '../../db/schema.ts';
import {
  requireAuth,
  requireRoles,
  type AuthRequest,
} from '../middleware/auth.ts';

const router = Router();

router.get(
  '/analytics/dashboard',
  requireAuth,
  requireRoles(
    'SUPER_ADMIN',
    'INVENTORY_MANAGER',
    'SALES_MANAGER',
    'WAREHOUSE_STAFF',
    'DELIVERY_MANAGER'
  ),
  async (req, res) => {
    try {
      const range = String(req.query.range || '180d');
      const days =
        range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 365;
      const sinceDate = new Date(Date.now() - days * 86400000);

      const allOrders = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          totalRwf: orders.totalRwf,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(gte(orders.createdAt, sinceDate))
        .orderBy(desc(orders.createdAt));

      const allProducts = await db
        .select({
          id: products.id,
          name: products.name,
          sku: products.sku,
          categoryId: products.categoryId,
          categoryName: categories.name,
          availableStock: products.availableStock,
          minStockLevel: products.minStockLevel,
          wholesalePriceRwf: products.wholesalePriceRwf,
        })
        .from(products)
        .leftJoin(categories, eq(categories.id, products.categoryId))
        .where(eq(products.status, 'ACTIVE'));

      const allUsers = await db
        .select({ id: users.id, role: users.role })
        .from(users);

      const activeDeliveriesRows = await db
        .select({ id: deliveries.id, status: deliveries.status })
        .from(deliveries)
        .where(inArray(deliveries.status, ['SCHEDULED', 'ASSIGNED', 'DISPATCHED', 'IN_TRANSIT']));

      const pendingPaymentsRows = await db
        .select({ amountRwf: payments.amountRwf })
        .from(payments)
        .where(eq(payments.status, 'PENDING'));

      const poRows = await db
        .select({ totalCostRwf: purchaseOrders.totalCostRwf, status: purchaseOrders.status })
        .from(purchaseOrders);

      const totalRevenueRwf = allOrders
        .filter((o) => o.status !== 'CANCELLED')
        .reduce((sum, o) => sum + o.totalRwf, 0);

      const pendingOrdersCount = allOrders.filter((o) =>
        ['PENDING', 'CONFIRMED', 'PAYMENT_PENDING', 'PROCESSING'].includes(o.status)
      ).length;

      const totalCustomers = allUsers.filter((u) =>
        ['REGULAR_CUSTOMER', 'B2B_CUSTOMER'].includes(u.role)
      ).length;
      const totalB2BClients = allUsers.filter((u) => u.role === 'B2B_CUSTOMER').length;

      let inventoryValueRwf = 0;
      let lowStockProducts = 0;
      let outOfStockProducts = 0;
      let inStockProducts = 0;

      for (const p of allProducts) {
        inventoryValueRwf += p.availableStock * p.wholesalePriceRwf;
        if (p.availableStock <= 0) {
          outOfStockProducts += 1;
        } else if (p.availableStock <= p.minStockLevel) {
          lowStockProducts += 1;
        } else {
          inStockProducts += 1;
        }
      }

      // Monthly sales series computed from real PostgreSQL orders
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const salesByMonthMap = new Map<string, { label: string; revenue: number; orders: number; sortKey: number }>();
      for (const ord of allOrders) {
        if (ord.status === 'CANCELLED') continue;
        const d = new Date(ord.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = `${monthNames[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
        const curr = salesByMonthMap.get(key) || {
          label,
          revenue: 0,
          orders: 0,
          sortKey: d.getFullYear() * 100 + d.getMonth(),
        };
        curr.revenue += ord.totalRwf;
        curr.orders += 1;
        salesByMonthMap.set(key, curr);
      }
      const salesSeries = Array.from(salesByMonthMap.values()).sort(
        (a, b) => a.sortKey - b.sortKey
      );

      // Sales by category & top products from real PostgreSQL order_items
      const categorySalesRows = await db
        .select({
          categoryName: categories.name,
          revenue: sql<number>`COALESCE(SUM(${orderItems.lineTotalRwf}), 0)`,
          units: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .innerJoin(products, eq(products.id, orderItems.productId))
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(gte(orders.createdAt, sinceDate))
        .groupBy(categories.name);

      const topProductsRows = await db
        .select({
          productId: orderItems.productId,
          productName: orderItems.productName,
          sku: orderItems.sku,
          totalQty: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
          totalRevenue: sql<number>`COALESCE(SUM(${orderItems.lineTotalRwf}), 0)`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(gte(orders.createdAt, sinceDate))
        .groupBy(orderItems.productId, orderItems.productName, orderItems.sku)
        .orderBy(desc(sql`SUM(${orderItems.lineTotalRwf})`))
        .limit(6);

      const procurementExpensesRwf = poRows
        .filter((po) => po.status !== 'CANCELLED')
        .reduce((s, po) => s + po.totalCostRwf, 0);

      const outstandingPaymentsRwf = pendingPaymentsRows.reduce(
        (s, p) => s + p.amountRwf,
        0
      );

      const stockHealthPct =
        allProducts.length > 0
          ? Math.round((inStockProducts / allProducts.length) * 100)
          : 100;

      res.json({
        kpis: {
          totalOrders: allOrders.length,
          totalRevenueRwf,
          totalProducts: allProducts.length,
          totalCustomers,
          totalB2BClients,
          inventoryValueRwf,
          lowStockProducts,
          outOfStockProducts,
          inStockProducts,
          stockHealthPct,
          pendingOrdersCount,
          activeDeliveriesCount: activeDeliveriesRows.length,
          outstandingPaymentsRwf,
          procurementExpensesRwf,
        },
        salesSeries,
        categoryBreakdown: categorySalesRows.map((c) => ({
          name: c.categoryName,
          revenue: Number(c.revenue),
          units: Number(c.units),
        })),
        topProducts: topProductsRows.map((tp) => ({
          ...tp,
          totalQty: Number(tp.totalQty),
          totalRevenue: Number(tp.totalRevenue),
        })),
        recentOrders: allOrders.slice(0, 6),
      });
    } catch (error) {
      console.error('Analytics dashboard error:', error);
      res.status(500).json({ error: 'Failed to load analytics dashboard.' });
    }
  }
);

router.get(
  '/reports/:type',
  requireAuth,
  requireRoles(
    'SUPER_ADMIN',
    'INVENTORY_MANAGER',
    'SALES_MANAGER',
    'DELIVERY_MANAGER'
  ),
  async (req, res) => {
    try {
      const type = String(req.params.type || 'inventory').toLowerCase();
      const format = String(req.query.format || 'json').toLowerCase();
      const generatedAt = new Date().toISOString();

      let title = 'Report';
      let rows: Record<string, unknown>[] = [];

      if (type === 'inventory') {
        title = 'Inventory Valuation Report';
        rows = await db
          .select({
            SKU: products.sku,
            Product: products.name,
            Category: categories.name,
            Stock: products.availableStock,
            MinStock: products.minStockLevel,
            WholesaleRwf: products.wholesalePriceRwf,
            RetailRwf: products.retailPriceRwf,
          })
          .from(products)
          .leftJoin(categories, eq(categories.id, products.categoryId));
      } else if (type === 'stock-movements') {
        title = 'Stock Movements Audit Report';
        rows = await db
          .select({
            Date: stockMovements.createdAt,
            SKU: products.sku,
            Product: products.name,
            Type: stockMovements.type,
            Delta: stockMovements.quantityDelta,
            NewStock: stockMovements.newStock,
            Reference: stockMovements.referenceId,
            Notes: stockMovements.notes,
          })
          .from(stockMovements)
          .innerJoin(products, eq(products.id, stockMovements.productId))
          .orderBy(desc(stockMovements.createdAt));
      } else if (type === 'sales' || type === 'orders') {
        title = type === 'sales' ? 'Sales Revenue Report' : 'Order Fulfillment Report';
        rows = await db
          .select({
            OrderNumber: orders.orderNumber,
            Customer: users.fullName,
            Type: orders.orderType,
            Status: orders.status,
            PaymentStatus: orders.paymentStatus,
            SubtotalRwf: orders.subtotalRwf,
            TaxRwf: orders.taxRwf,
            TotalRwf: orders.totalRwf,
            CreatedAt: orders.createdAt,
          })
          .from(orders)
          .innerJoin(users, eq(users.id, orders.userId))
          .orderBy(desc(orders.createdAt));
      } else if (type === 'procurement') {
        title = 'Procurement & Purchase Orders Report';
        rows = await db
          .select({
            PONumber: purchaseOrders.poNumber,
            Supplier: suppliers.name,
            Status: purchaseOrders.status,
            TotalCostRwf: purchaseOrders.totalCostRwf,
            AutoGenerated: purchaseOrders.isAutoGenerated,
            CreatedAt: purchaseOrders.createdAt,
          })
          .from(purchaseOrders)
          .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
          .orderBy(desc(purchaseOrders.createdAt));
      } else if (type === 'suppliers') {
        title = 'Approved Suppliers Report';
        rows = await db
          .select({
            Name: suppliers.name,
            Contact: suppliers.contactPerson,
            Email: suppliers.email,
            Phone: suppliers.phone,
            LeadTimeDays: suppliers.leadTimeDays,
            Rating: suppliers.rating,
          })
          .from(suppliers);
      } else if (type === 'customers') {
        title = 'Customers & B2B Accounts Report';
        rows = await db
          .select({
            Name: users.fullName,
            Email: users.email,
            Phone: users.phone,
            Role: users.role,
            Company: businessAccounts.companyName,
            PaymentTerms: businessAccounts.paymentTerms,
            Active: users.isActive,
          })
          .from(users)
          .leftJoin(businessAccounts, eq(businessAccounts.userId, users.id));
      } else if (type === 'deliveries') {
        title = 'Delivery & Logistics Schedule Report';
        rows = await db
          .select({
            TrackingCode: deliveries.trackingCode,
            OrderNumber: orders.orderNumber,
            ScheduledDate: deliveries.scheduledDate,
            TimeSlot: deliveries.timeSlot,
            Driver: deliveries.driverName,
            Vehicle: deliveries.vehiclePlate,
            Status: deliveries.status,
          })
          .from(deliveries)
          .innerJoin(orders, eq(orders.id, deliveries.orderId));
      } else if (type === 'financial') {
        title = 'Financial & Payment Reconciliation Report';
        rows = await db
          .select({
            TransactionRef: payments.transactionRef,
            OrderNumber: orders.orderNumber,
            Provider: payments.provider,
            AmountRwf: payments.amountRwf,
            Status: payments.status,
            PaidAt: payments.paidAt,
          })
          .from(payments)
          .innerJoin(orders, eq(orders.id, payments.orderId))
          .orderBy(desc(payments.createdAt));
      } else {
        return res.status(400).json({ error: 'Unknown report type.' });
      }

      if (format === 'csv') {
        const headers = rows.length > 0 ? Object.keys(rows[0]) : ['Info'];
        const csvLines = [
          `# ${title} - Generated ${generatedAt}`,
          headers.join(','),
          ...rows.map((r) =>
            headers
              .map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`)
              .join(',')
          ),
        ];
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="nacenis-${type}-report.csv"`
        );
        return res.send(csvLines.join('\n'));
      }

      res.json({ title, generatedAt, rows });
    } catch (error) {
      console.error('Report generation error:', error);
      res.status(500).json({ error: 'Failed to generate report.' });
    }
  }
);

router.get('/notifications', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.authUser!;
    const rows = await db
      .select()
      .from(notifications)
      .where(
        user.role === 'SUPER_ADMIN'
          ? undefined
          : or(
              eq(notifications.userId, user.id),
              eq(notifications.targetRole, user.role)
            )
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    res.json({ notifications: rows });
  } catch (error) {
    console.error('Notifications fetch error:', error);
    res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

router.patch(
  '/notifications/:id/read',
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.id, id));
      res.json({ ok: true });
    } catch (error) {
      console.error('Notification mark read error:', error);
      res.status(500).json({ error: 'Failed to mark notification read.' });
    }
  }
);

router.patch(
  '/notifications/read-all',
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const user = req.authUser!;
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(
          user.role === 'SUPER_ADMIN'
            ? undefined
            : or(
                eq(notifications.userId, user.id),
                eq(notifications.targetRole, user.role)
              )
        );
      res.json({ ok: true });
    } catch (error) {
      console.error('Mark all notifications read error:', error);
      res.status(500).json({ error: 'Failed to mark notifications read.' });
    }
  }
);

router.get('/docs/openapi.json', (_req, res) => {
  res.json({
    openapi: '3.0.3',
    info: {
      title: "Naceni's Business Construction Supply & Inventory API",
      version: '1.0.0',
      description:
        'REST API for E-Commerce, Real-Time Inventory, B2B Bulk Procurement, Automated Reordering, Deliveries, Payments, and Analytics.',
    },
    paths: {
      '/api/auth/register': { post: { summary: 'Register customer or B2B client' } },
      '/api/auth/login': { post: { summary: 'Email & password sign in' } },
      '/api/auth/google-sync': { post: { summary: 'Firebase Google OAuth session sync' } },
      '/api/products': {
        get: { summary: 'Search and filter products' },
        post: { summary: 'Create product (Admin/Inventory Manager)' },
      },
      '/api/inventory': { get: { summary: 'Real-time stock and valuation summary' } },
      '/api/inventory/adjust': { post: { summary: 'Transactional stock adjustment / transfer' } },
      '/api/reorders/recommendations': { get: { summary: 'Automated reorder recommendations' } },
      '/api/procurement/purchase-orders': {
        get: { summary: 'List supplier purchase orders' },
        post: { summary: 'Create purchase order' },
      },
      '/api/quotations': {
        get: { summary: 'List B2B RFQs' },
        post: { summary: 'Submit B2B quotation request' },
      },
      '/api/orders': {
        get: { summary: 'List orders' },
        post: { summary: 'Atomic checkout & order placement' },
      },
      '/api/orders/track/{orderNumber}': {
        get: { summary: 'Real-time order tracking lookup' },
      },
      '/api/deliveries': { get: { summary: 'List scheduled deliveries' } },
      '/api/analytics/dashboard': { get: { summary: 'Live PostgreSQL dashboard metrics' } },
      '/api/reports/{type}': { get: { summary: 'Download CSV/JSON operational reports' } },
    },
  });
});

export default router;
