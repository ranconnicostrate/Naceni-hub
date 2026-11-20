import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const USER_ROLES = [
  'SUPER_ADMIN',
  'INVENTORY_MANAGER',
  'SALES_MANAGER',
  'WAREHOUSE_STAFF',
  'DELIVERY_MANAGER',
  'B2B_CUSTOMER',
  'REGULAR_CUSTOMER',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PAYMENT_PENDING',
  'PROCESSING',
  'PICKING',
  'PACKING',
  'READY_FOR_DISPATCH',
  'DISPATCHED',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface BulkPriceTier {
  minQty: number;
  discountPct: number;
  unitPriceRwf: number;
}

export interface TimelineEntry {
  status: OrderStatus;
  timestamp: string;
  note: string;
  actor: string;
}

export interface ShippingAddressSnapshot {
  recipientName: string;
  phone: string;
  province: string;
  district: string;
  sector?: string;
  streetAddress: string;
}

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').unique(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash'),
    fullName: text('full_name').notNull(),
    phone: text('phone').default(''),
    role: text('role').notNull().default('REGULAR_CUSTOMER'),
    isActive: boolean('is_active').notNull().default(true),
    emailVerified: boolean('email_verified').notNull().default(false),
    resetTokenHash: text('reset_token_hash'),
    resetTokenExpiresAt: timestamp('reset_token_expires_at'),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_users_role').on(table.role)]
);

export const loginActivities = pgTable(
  'login_activities',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    method: text('method').notNull(),
    ipAddress: text('ip_address').default(''),
    userAgent: text('user_agent').default(''),
    success: boolean('success').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_login_activities_user').on(table.userId)]
);

export const businessAccounts = pgTable('business_accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  companyName: text('company_name').notNull(),
  tinNumberEncrypted: text('tin_number_encrypted').notNull(),
  tinLastFour: text('tin_last_four').notNull().default('0000'),
  industry: text('industry').notNull().default('Construction & Civil Works'),
  creditLimitRwf: integer('credit_limit_rwf').notNull().default(5000000),
  paymentTerms: text('payment_terms').notNull().default('NET_15'),
  verified: boolean('verified').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const addresses = pgTable(
  'addresses',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    label: text('label').notNull().default('Site Address'),
    recipientName: text('recipient_name').notNull(),
    phone: text('phone').notNull(),
    province: text('province').notNull(),
    district: text('district').notNull(),
    sector: text('sector').default(''),
    streetAddress: text('street_address').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_addresses_user').on(table.userId)]
);

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull().default(''),
  icon: text('icon').notNull().default('hammer'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  contactPerson: text('contact_person').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  address: text('address').notNull(),
  leadTimeDays: integer('lead_time_days').notNull().default(5),
  rating: numeric('rating', { precision: 3, scale: 2 }).notNull().default('4.70'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const warehouses = pgTable('warehouses', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  location: text('location').notNull(),
  managerName: text('manager_name').notNull(),
  capacityUnits: integer('capacity_units').notNull().default(10000),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    sku: text('sku').notNull().unique(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description').notNull(),
    categoryId: integer('category_id')
      .references(() => categories.id, { onDelete: 'restrict' })
      .notNull(),
    supplierId: integer('supplier_id')
      .references(() => suppliers.id, { onDelete: 'set null' }),
    brand: text('brand').notNull(),
    unitOfMeasure: text('unit_of_measure').notNull().default('Piece'),
    retailPriceRwf: integer('retail_price_rwf').notNull(),
    wholesalePriceRwf: integer('wholesale_price_rwf').notNull(),
    bulkTiers: jsonb('bulk_tiers').$type<BulkPriceTier[]>().notNull().default([]),
    imageUrl: text('image_url').notNull(),
    galleryImages: jsonb('gallery_images').$type<string[]>().notNull().default([]),
    availableStock: integer('available_stock').notNull().default(0),
    reservedStock: integer('reserved_stock').notNull().default(0),
    minStockLevel: integer('min_stock_level').notNull().default(10),
    reorderPoint: integer('reorder_point').notNull().default(15),
    reorderQuantity: integer('reorder_quantity').notNull().default(40),
    batchNumber: text('batch_number').default('BATCH-2026-A'),
    isFeatured: boolean('is_featured').notNull().default(false),
    isBestSeller: boolean('is_best_seller').notNull().default(false),
    promoBadge: text('promo_badge'),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_products_category').on(table.categoryId),
    index('idx_products_status').on(table.status),
  ]
);

export const inventory = pgTable(
  'inventory',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    warehouseId: integer('warehouse_id')
      .references(() => warehouses.id, { onDelete: 'cascade' })
      .notNull(),
    quantityOnHand: integer('quantity_on_hand').notNull().default(0),
    binLocation: text('bin_location').notNull().default('A1-01'),
    batchCode: text('batch_code').notNull().default('BATCH-2026-01'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_inventory_product_warehouse').on(
      table.productId,
      table.warehouseId
    ),
  ]
);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    warehouseId: integer('warehouse_id')
      .references(() => warehouses.id, { onDelete: 'set null' }),
    type: text('type').notNull(), // INCOMING | OUTGOING | ADJUSTMENT | TRANSFER | RETURN
    quantityDelta: integer('quantity_delta').notNull(),
    previousStock: integer('previous_stock').notNull(),
    newStock: integer('new_stock').notNull(),
    referenceType: text('reference_type').notNull().default('MANUAL'),
    referenceId: text('reference_id').default(''),
    notes: text('notes').default(''),
    performedById: integer('performed_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_stock_movements_product').on(table.productId)]
);

export const reorderRules = pgTable('reorder_rules', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  supplierId: integer('supplier_id').references(() => suppliers.id, {
    onDelete: 'set null',
  }),
  minStockLevel: integer('min_stock_level').notNull().default(10),
  reorderPoint: integer('reorder_point').notNull().default(15),
  reorderQuantity: integer('reorder_quantity').notNull().default(40),
  leadTimeDays: integer('lead_time_days').notNull().default(5),
  autoDraftPo: boolean('auto_draft_po').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const purchaseOrders = pgTable('purchase_orders', {
  id: serial('id').primaryKey(),
  poNumber: text('po_number').notNull().unique(),
  supplierId: integer('supplier_id')
    .references(() => suppliers.id, { onDelete: 'restrict' })
    .notNull(),
  status: text('status').notNull().default('DRAFT'), // DRAFT | PENDING_APPROVAL | APPROVED | ORDERED | RECEIVED | CANCELLED
  totalCostRwf: integer('total_cost_rwf').notNull().default(0),
  expectedDeliveryDate: timestamp('expected_delivery_date'),
  notes: text('notes').default(''),
  isAutoGenerated: boolean('is_auto_generated').notNull().default(false),
  createdById: integer('created_by_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedById: integer('approved_by_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  receivedAt: timestamp('received_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: serial('id').primaryKey(),
  purchaseOrderId: integer('purchase_order_id')
    .references(() => purchaseOrders.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'restrict' })
    .notNull(),
  quantityOrdered: integer('quantity_ordered').notNull(),
  quantityReceived: integer('quantity_received').notNull().default(0),
  unitCostRwf: integer('unit_cost_rwf').notNull(),
  lineTotalRwf: integer('line_total_rwf').notNull(),
});

export const quotations = pgTable('quotations', {
  id: serial('id').primaryKey(),
  quoteNumber: text('quote_number').notNull().unique(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  businessAccountId: integer('business_account_id').references(
    () => businessAccounts.id,
    { onDelete: 'set null' }
  ),
  status: text('status').notNull().default('REQUESTED'), // REQUESTED | REVIEWING | QUOTED | ACCEPTED | REJECTED | CONVERTED
  subtotalRwf: integer('subtotal_rwf').notNull().default(0),
  discountRwf: integer('discount_rwf').notNull().default(0),
  totalRwf: integer('total_rwf').notNull().default(0),
  validUntil: timestamp('valid_until'),
  customerNotes: text('customer_notes').default(''),
  internalNotes: text('internal_notes').default(''),
  reviewedById: integer('reviewed_by_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const quotationItems = pgTable('quotation_items', {
  id: serial('id').primaryKey(),
  quotationId: integer('quotation_id')
    .references(() => quotations.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'restrict' })
    .notNull(),
  quantity: integer('quantity').notNull(),
  requestedPriceRwf: integer('requested_price_rwf').notNull(),
  quotedPriceRwf: integer('quoted_price_rwf').notNull(),
  lineTotalRwf: integer('line_total_rwf').notNull(),
});

export const carts = pgTable('carts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const cartItems = pgTable(
  'cart_items',
  {
    id: serial('id').primaryKey(),
    cartId: integer('cart_id')
      .references(() => carts.id, { onDelete: 'cascade' })
      .notNull(),
    productId: integer('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    quantity: integer('quantity').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_cart_items_cart_product').on(
      table.cartId,
      table.productId
    ),
  ]
);

export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    orderNumber: text('order_number').notNull().unique(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    orderType: text('order_type').notNull().default('RETAIL'), // RETAIL | B2B_BULK
    status: text('status').notNull().default('PENDING'),
    paymentStatus: text('payment_status').notNull().default('PENDING'),
    subtotalRwf: integer('subtotal_rwf').notNull(),
    discountRwf: integer('discount_rwf').notNull().default(0),
    deliveryFeeRwf: integer('delivery_fee_rwf').notNull().default(0),
    taxRwf: integer('tax_rwf').notNull().default(0),
    totalRwf: integer('total_rwf').notNull(),
    shippingAddress: jsonb('shipping_address')
      .$type<ShippingAddressSnapshot>()
      .notNull(),
    internalNotes: text('internal_notes').default(''),
    assignedStaffId: integer('assigned_staff_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    statusTimeline: jsonb('status_timeline')
      .$type<TimelineEntry[]>()
      .notNull()
      .default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_orders_user').on(table.userId),
    index('idx_orders_status').on(table.status),
  ]
);

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'restrict' })
    .notNull(),
  productName: text('product_name').notNull(),
  sku: text('sku').notNull(),
  quantity: integer('quantity').notNull(),
  fulfilledQuantity: integer('fulfilled_quantity').notNull().default(0),
  unitPriceRwf: integer('unit_price_rwf').notNull(),
  lineTotalRwf: integer('line_total_rwf').notNull(),
});

export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    transactionRef: text('transaction_ref').notNull().unique(),
    orderId: integer('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    provider: text('provider').notNull(), // MTN_MOMO | AIRTEL_MONEY | BANK_TRANSFER | CASH_ON_DELIVERY | CARD_GATEWAY
    amountRwf: integer('amount_rwf').notNull(),
    status: text('status').notNull().default('PENDING'), // INITIATED | PENDING | COMPLETED | FAILED | REFUNDED
    maskedAccount: text('masked_account').default(''),
    providerResponse: jsonb('provider_response').$type<Record<string, unknown>>().default({}),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_payments_order').on(table.orderId)]
);

export const invoices = pgTable('invoices', {
  id: serial('id').primaryKey(),
  invoiceNumber: text('invoice_number').notNull().unique(),
  orderId: integer('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  subtotalRwf: integer('subtotal_rwf').notNull(),
  taxRwf: integer('tax_rwf').notNull(),
  deliveryFeeRwf: integer('delivery_fee_rwf').notNull(),
  totalRwf: integer('total_rwf').notNull(),
  status: text('status').notNull().default('ISSUED'), // ISSUED | PAID | VOID
  issuedAt: timestamp('issued_at').defaultNow().notNull(),
  dueDate: timestamp('due_date'),
});

export const deliveries = pgTable(
  'deliveries',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    trackingCode: text('tracking_code').notNull().unique(),
    scheduledDate: text('scheduled_date').notNull(), // YYYY-MM-DD
    timeSlot: text('time_slot').notNull().default('09:00 - 12:00'),
    driverName: text('driver_name').default('Unassigned'),
    driverPhone: text('driver_phone').default(''),
    vehiclePlate: text('vehicle_plate').default(''),
    status: text('status').notNull().default('SCHEDULED'), // SCHEDULED | ASSIGNED | DISPATCHED | IN_TRANSIT | DELIVERED | FAILED
    deliveryFeeRwf: integer('delivery_fee_rwf').notNull().default(0),
    proofOfDelivery: jsonb('proof_of_delivery').$type<{
      signedBy?: string;
      notes?: string;
      confirmedAt?: string;
    }>().default({}),
    deliveredAt: timestamp('delivered_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_deliveries_date').on(table.scheduledDate)]
);

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    targetRole: text('target_role'),
    type: text('type').notNull(), // LOW_STOCK | ORDER | PAYMENT | DELIVERY | REORDER | PROCUREMENT
    title: text('title').notNull(),
    message: text('message').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    linkView: text('link_view').default('dashboard'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_notifications_user').on(table.userId)]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    actorEmail: text('actor_email').notNull().default('system'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>().default({}),
    ipAddress: text('ip_address').default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_audit_logs_created').on(table.createdAt)]
);

export const wishlists = pgTable(
  'wishlists',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    productId: integer('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_wishlist_user_product').on(table.userId, table.productId),
  ]
);

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  supplier: one(suppliers, {
    fields: [products.supplierId],
    references: [suppliers.id],
  }),
  reorderRule: one(reorderRules, {
    fields: [products.id],
    references: [reorderRules.productId],
  }),
  inventoryRecords: many(inventory),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  items: many(orderItems),
  payments: many(payments),
  delivery: one(deliveries, {
    fields: [orders.id],
    references: [deliveries.orderId],
  }),
  invoice: one(invoices, {
    fields: [orders.id],
    references: [invoices.orderId],
  }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));
