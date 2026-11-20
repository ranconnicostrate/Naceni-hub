import React, { useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  FileDown,
  Minus,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch, formatRwf } from '../services/api.ts';
import { downloadOrderInvoicePdf } from '../services/exportUtils.ts';
import type { CartItem, Order } from '../types/index.ts';

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQty: (productId: number, qty: number) => void;
  onRemove: (productId: number) => void;
  onClear: () => void;
  onRequireAuth: () => void;
  onOrderPlaced: (orderNumber: string) => void;
}

export function getEffectiveUnitPrice(
  item: CartItem,
  isB2B: boolean
): number {
  let price = isB2B
    ? item.product.wholesalePriceRwf
    : item.product.retailPriceRwf;
  const tiers = [...(item.product.bulkTiers || [])].sort(
    (a, b) => b.minQty - a.minQty
  );
  for (const t of tiers) {
    if (item.quantity >= t.minQty && t.unitPriceRwf < price) {
      price = t.unitPriceRwf;
      break;
    }
  }
  return price;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  open,
  onClose,
  items,
  onUpdateQty,
  onRemove,
  onClear,
  onRequireAuth,
  onOrderPlaced,
}) => {
  const { user } = useAuth();
  const isB2B = user?.role === 'B2B_CUSTOMER';
  const [step, setStep] = useState<'cart' | 'checkout' | 'success'>('cart');
  const [recipientName, setRecipientName] = useState(
    user?.fullName || 'Site Supervisor'
  );
  const [phone, setPhone] = useState(user?.phone || '+250 788 000 000');
  const [province, setProvince] = useState('Kigali City');
  const [district, setDistrict] = useState('Gasabo');
  const [streetAddress, setStreetAddress] = useState(
    'KG 7 Ave, Construction Site'
  );
  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date(Date.now() + 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [timeSlot, setTimeSlot] = useState('09:00 - 12:00');
  const [provider, setProvider] = useState<
    | 'MTN_MOMO'
    | 'AIRTEL_MONEY'
    | 'BANK_TRANSFER'
    | 'CARD_GATEWAY'
    | 'CASH_ON_DELIVERY'
  >('MTN_MOMO');
  const [accountHint, setAccountHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);

  if (!open) return null;

  const subtotal = items.reduce(
    (sum, item) => sum + getEffectiveUnitPrice(item, isB2B) * item.quantity,
    0
  );
  const deliveryFee = subtotal >= 500000 || subtotal === 0 ? 0 : 15000;
  const tax = Math.round(subtotal * 0.18);
  const total = subtotal + deliveryFee + tax;

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await apiFetch<{
        order: Order;
        invoice: { invoiceNumber: string };
        delivery: { trackingCode: string };
      }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.product.id,
            quantity: i.quantity,
          })),
          shippingAddress: {
            recipientName: recipientName || user.fullName,
            phone: phone || user.phone || '+250 788 000 000',
            province,
            district,
            streetAddress,
          },
          scheduledDate,
          timeSlot,
          paymentProvider: provider,
          accountHint,
        }),
      });

      const fullOrder: Order = {
        ...res.order,
        invoiceNumber: res.invoice.invoiceNumber,
        trackingCode: res.delivery.trackingCode,
        items: items.map((i, idx) => {
          const u = getEffectiveUnitPrice(i, isB2B);
          return {
            id: idx + 1,
            productId: i.product.id,
            productName: i.product.name,
            sku: i.product.sku,
            quantity: i.quantity,
            fulfilledQuantity: 0,
            unitPriceRwf: u,
            lineTotalRwf: u * i.quantity,
          };
        }),
      };

      setPlacedOrder(fullOrder);
      onClear();
      setStep('success');
      onOrderPlaced(res.order.orderNumber);
    } catch (err: any) {
      setError(err?.message || 'Failed to complete checkout.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#0B1F3A]/50 backdrop-blur-xs">
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
              {step === 'cart'
                ? 'Procurement Cart'
                : step === 'checkout'
                  ? 'Delivery & Payment'
                  : 'Order Confirmed'}
            </h2>
            <p className="text-xs text-slate-500">
              {subtotal >= 500000
                ? 'Qualifies for Free Kigali Delivery'
                : 'Free delivery on orders above Rwf 500,000'}
            </p>
          </div>
          <button
            onClick={() => {
              setStep('cart');
              onClose();
            }}
            aria-label="Close cart drawer"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'cart' && (
            <>
              {items.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="font-display text-base font-semibold text-slate-700">
                    Your cart is empty
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Add tools, plumbing, electrical, or building materials to
                    start an order.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((item) => {
                    const unitPrice = getEffectiveUnitPrice(item, isB2B);
                    const discounted = unitPrice < item.product.retailPriceRwf;
                    return (
                      <div
                        key={item.product.id}
                        className="flex gap-3.5 rounded-xl border border-slate-200 p-3"
                      >
                        <img
                          src={item.product.imageUrl}
                          alt={item.product.name}
                          referrerPolicy="no-referrer"
                          className="h-18 w-18 shrink-0 rounded-lg border border-slate-100 bg-white object-contain p-1"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="truncate text-sm font-semibold text-slate-900">
                              {item.product.name}
                            </h3>
                            <button
                              onClick={() => onRemove(item.product.id)}
                              aria-label={`Remove ${item.product.name}`}
                              className="text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <p className="mt-0.5 font-mono text-xs text-slate-500">
                            {item.product.sku} · Stock:{' '}
                            {item.product.availableStock}
                          </p>
                          <div className="mt-2 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() =>
                                  onUpdateQty(
                                    item.product.id,
                                    Math.max(1, item.quantity - 1)
                                  )
                                }
                                className="rounded-md border border-slate-200 p-1 hover:bg-slate-100"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={item.product.availableStock}
                                value={item.quantity}
                                onChange={(e) =>
                                  onUpdateQty(
                                    item.product.id,
                                    Math.max(
                                      1,
                                      Math.min(
                                        item.product.availableStock,
                                        Number(e.target.value) || 1
                                      )
                                    )
                                  )
                                }
                                className="w-14 rounded-md border border-slate-200 py-0.5 text-center font-mono text-xs tabular-nums"
                              />
                              <button
                                onClick={() =>
                                  onUpdateQty(
                                    item.product.id,
                                    Math.min(
                                      item.product.availableStock,
                                      item.quantity + 1
                                    )
                                  )
                                }
                                className="rounded-md border border-slate-200 p-1 hover:bg-slate-100"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="text-right">
                              <div className="font-mono text-sm font-bold text-[#0B1F3A] tabular-nums">
                                {formatRwf(unitPrice * item.quantity)}
                              </div>
                              {discounted && (
                                <div className="text-[11px] font-medium text-emerald-700">
                                  Bulk rate {formatRwf(unitPrice)}/ea
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {step === 'checkout' && (
            <form
              id="checkout-form"
              onSubmit={handleCheckout}
              className="space-y-4"
            >
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {error}
                </div>
              )}

              <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                <h3 className="flex items-center gap-2 text-sm font-bold text-[#0B1F3A]">
                  <Truck className="h-4 w-4 text-[#F97316]" />
                  Delivery Schedule &amp; Site Address
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      Recipient Name
                    </label>
                    <input
                      type="text"
                      required
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      Contact Phone
                    </label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      Province
                    </label>
                    <select
                      value={province}
                      onChange={(e) => setProvince(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    >
                      <option>Kigali City</option>
                      <option>Northern Province</option>
                      <option>Eastern Province</option>
                      <option>Southern Province</option>
                      <option>Western Province</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      District
                    </label>
                    <input
                      type="text"
                      required
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Street / Site Plot Address
                  </label>
                  <input
                    type="text"
                    required
                    value={streetAddress}
                    onChange={(e) => setStreetAddress(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      Delivery Date
                    </label>
                    <input
                      type="date"
                      required
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      Preferred Time Window
                    </label>
                    <select
                      value={timeSlot}
                      onChange={(e) => setTimeSlot(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    >
                      <option>08:00 - 11:00</option>
                      <option>09:00 - 12:00</option>
                      <option>13:00 - 16:00</option>
                      <option>16:00 - 18:30</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                <h3 className="flex items-center gap-2 text-sm font-bold text-[#0B1F3A]">
                  <CreditCard className="h-4 w-4 text-[#F97316]" />
                  Payment Provider (Sandbox Mode)
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'MTN_MOMO', label: 'MTN Mobile Money' },
                    { id: 'AIRTEL_MONEY', label: 'Airtel Money' },
                    { id: 'BANK_TRANSFER', label: 'Bank Transfer' },
                    { id: 'CARD_GATEWAY', label: 'Card Payment' },
                    { id: 'CASH_ON_DELIVERY', label: 'Cash on Delivery' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setProvider(opt.id as any)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors ${
                        provider === opt.id
                          ? 'border-[#0B1F3A] bg-[#0B1F3A] text-white'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Smartphone className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{opt.label}</span>
                    </button>
                  ))}
                </div>
                {provider !== 'CASH_ON_DELIVERY' && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      {provider === 'MTN_MOMO' || provider === 'AIRTEL_MONEY'
                        ? 'Mobile Money Number (Last 4 digits stored only)'
                        : 'Reference / Account Hint'}
                    </label>
                    <input
                      type="text"
                      value={accountHint}
                      onChange={(e) => setAccountHint(e.target.value)}
                      placeholder={
                        provider === 'BANK_TRANSFER'
                          ? 'BK-4821'
                          : '0788 123 456'
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>
                )}
                <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Raw card numbers and mobile money PINs are never stored.
                </p>
              </div>
            </form>
          )}

          {step === 'success' && placedOrder && (
            <div className="space-y-4 py-6 text-center">
              <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
              <h3 className="font-display text-xl font-bold text-[#0B1F3A]">
                Order #{placedOrder.orderNumber} Confirmed
              </h3>
              <p className="text-sm text-slate-600">
                Inventory has been reserved and your delivery is scheduled.
                Tracking code:{' '}
                <span className="font-mono font-bold text-[#0B1F3A]">
                  {placedOrder.trackingCode}
                </span>
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-xs">
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Total Amount</span>
                  <span className="font-mono font-bold text-[#0B1F3A] tabular-nums">
                    {formatRwf(placedOrder.totalRwf)}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Payment Status</span>
                  <span className="font-semibold text-emerald-700">
                    {placedOrder.paymentStatus}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => downloadOrderInvoicePdf(placedOrder)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0B1F3A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#13325C]"
              >
                <FileDown className="h-4 w-4" />
                Download Invoice PDF
              </button>
            </div>
          )}
        </div>

        {items.length > 0 && step !== 'success' && (
          <div className="border-t border-slate-200 bg-slate-50 p-6">
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">
                  {formatRwf(subtotal)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>VAT (18%)</span>
                <span className="font-mono tabular-nums">{formatRwf(tax)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Delivery Fee</span>
                <span className="font-mono tabular-nums">
                  {deliveryFee === 0 ? 'Free' : formatRwf(deliveryFee)}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-[#0B1F3A]">
                <span>Total</span>
                <span className="font-mono tabular-nums">
                  {formatRwf(total)}
                </span>
              </div>
            </div>

            {step === 'cart' ? (
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    onRequireAuth();
                    return;
                  }
                  setStep('checkout');
                }}
                className="mt-4 w-full rounded-lg bg-[#F97316] py-3 text-sm font-bold text-white transition-colors hover:bg-[#EA580C]"
              >
                {user ? 'Proceed to Checkout' : 'Sign In to Checkout'}
              </button>
            ) : (
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('cart')}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Back
                </button>
                <button
                  type="submit"
                  form="checkout-form"
                  disabled={busy}
                  className="flex-1 rounded-lg bg-[#0B1F3A] py-3 text-sm font-bold text-white transition-colors hover:bg-[#13325C] disabled:opacity-60"
                >
                  {busy ? 'Processing Order...' : 'Place & Confirm Order'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
