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

export interface BusinessAccount {
  id: number;
  companyName: string;
  tinLastFour: string;
  industry: string;
  creditLimitRwf: number;
  paymentTerms: string;
  verified: boolean;
}

export interface UserAddress {
  id: number;
  label: string;
  recipientName: string;
  phone: string;
  province: string;
  district: string;
  sector: string;
  streetAddress: string;
  isDefault: boolean;
}

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt?: string;
  createdAt?: string;
  businessAccount: BusinessAccount | null;
  addresses: UserAddress[];
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  sortOrder: number;
}

export interface BulkPriceTier {
  minQty: number;
  discountPct: number;
  unitPriceRwf: number;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  slug: string;
  description: string;
  categoryId: number;
  categoryName: string | null;
  categorySlug: string | null;
  supplierId: number | null;
  supplierName: string | null;
  brand: string;
  unitOfMeasure: string;
  retailPriceRwf: number;
  wholesalePriceRwf: number;
  bulkTiers: BulkPriceTier[];
  imageUrl: string;
  availableStock: number;
  reservedStock: number;
  minStockLevel: number;
  reorderPoint: number;
  reorderQuantity: number;
  batchNumber: string | null;
  isFeatured: boolean;
  isBestSeller: boolean;
  promoBadge: string | null;
  status: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderTimelineEntry {
  status: string;
  timestamp: string;
  note: string;
  actor: string;
}

export interface OrderItem {
  id: number;
  productId: number;
  productName: string;
  sku: string;
  quantity: number;
  fulfilledQuantity: number;
  unitPriceRwf: number;
  lineTotalRwf: number;
}

export interface Order {
  id: number;
  orderNumber: string;
  userId: number;
  customerName?: string;
  customerEmail?: string;
  orderType: string;
  status: string;
  paymentStatus: string;
  subtotalRwf: number;
  discountRwf: number;
  deliveryFeeRwf: number;
  taxRwf: number;
  totalRwf: number;
  shippingAddress: {
    recipientName: string;
    phone: string;
    province: string;
    district: string;
    sector?: string;
    streetAddress: string;
  };
  internalNotes?: string;
  statusTimeline: OrderTimelineEntry[];
  createdAt: string;
  trackingCode?: string | null;
  scheduledDate?: string | null;
  timeSlot?: string | null;
  driverName?: string | null;
  vehiclePlate?: string | null;
  deliveryStatus?: string | null;
  invoiceNumber?: string | null;
  items: OrderItem[];
  payments?: {
    id: number;
    transactionRef: string;
    provider: string;
    amountRwf: number;
    status: string;
    maskedAccount: string;
    paidAt: string | null;
  }[];
}

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  linkView: string | null;
  createdAt: string;
}
