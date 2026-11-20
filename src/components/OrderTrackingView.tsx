import React, { useEffect, useState } from 'react';
import {
  Check,
  Clock,
  FileDown,
  Package,
  Search,
  Truck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch, formatRwf } from '../services/api.ts';
import { downloadOrderInvoicePdf } from '../services/exportUtils.ts';
import type { Order } from '../types/index.ts';

interface OrderTrackingViewProps {
  initialOrderNumber?: string;
}

const PROGRESS_STEPS = [
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PROCESSING', label: 'Processing' },
  { key: 'DISPATCHED', label: 'Dispatched' },
  { key: 'IN_TRANSIT', label: 'In Transit' },
  { key: 'DELIVERED', label: 'Delivered' },
];

function getStepIndex(status: string): number {
  if (status === 'DELIVERED') return 4;
  if (status === 'IN_TRANSIT') return 3;
  if (status === 'DISPATCHED' || status === 'READY_FOR_DISPATCH') return 2;
  if (['PROCESSING', 'PICKING', 'PACKING'].includes(status)) return 1;
  if (['CONFIRMED', 'PENDING', 'PAYMENT_PENDING'].includes(status)) return 0;
  return 0;
}

export const OrderTrackingView: React.FC<OrderTrackingViewProps> = ({
  initialOrderNumber = 'ORD-2026-1048',
}) => {
  const { user, socket } = useAuth();
  const [query, setQuery] = useState(initialOrderNumber);
  const [tracked, setTracked] = useState<Order | null>(null);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const lookupOrder = async (orderNumber: string) => {
    const clean = orderNumber.trim().replace(/^#/, '');
    if (!clean) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ order: Order }>(
        `/api/orders/track/${encodeURIComponent(clean)}`
      );
      setTracked(res.order);
    } catch (err: any) {
      setError(err?.message || 'Order not found.');
      setTracked(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void lookupOrder(initialOrderNumber);
  }, [initialOrderNumber]);

  useEffect(() => {
    if (!user) {
      setMyOrders([]);
      return;
    }
    apiFetch<{ orders: Order[] }>('/api/orders')
      .then((res) => setMyOrders(res.orders))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: { orderNumber?: string }) => {
      if (
        payload?.orderNumber &&
        tracked?.orderNumber === payload.orderNumber
      ) {
        void lookupOrder(payload.orderNumber);
      }
    };
    socket.on('order:updated', handler);
    return () => {
      socket.off('order:updated', handler);
    };
  }, [socket, tracked]);

  const activeStep = tracked ? getStepIndex(tracked.status) : 0;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
        <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
          Track Your Order
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Real-time order fulfillment &amp; fleet delivery status
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void lookupOrder(query);
          }}
          className="mt-5 flex flex-wrap gap-3"
        >
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter Order Number (e.g. ORD-2026-1048)..."
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-4 font-mono text-sm focus:border-[#0B1F3A] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-[#F97316] px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#EA580C] whitespace-nowrap shrink-0"
          >
            {loading ? 'Searching...' : 'Track Order'}
          </button>
        </form>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        {tracked && (
          <div className="mt-8 space-y-6">
            {/* 5-step visual progress bar matching mockup */}
            <div className="relative grid grid-cols-5 gap-2">
              <div className="absolute left-[10%] right-[10%] top-4 h-1 bg-slate-200">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300"
                  style={{ width: `${(activeStep / 4) * 100}%` }}
                />
              </div>
              {PROGRESS_STEPS.map((step, idx) => {
                const done = idx <= activeStep && tracked.status !== 'CANCELLED';
                return (
                  <div
                    key={step.key}
                    className="relative z-10 flex flex-col items-center text-center"
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                        done
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-300 bg-white text-slate-400'
                      }`}
                    >
                      {done ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Clock className="h-4 w-4" />
                      )}
                    </div>
                    <span
                      className={`mt-2 text-xs font-bold ${
                        done ? 'text-emerald-700' : 'text-slate-400'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Delivery Fleet Banner */}
            <div className="grid overflow-hidden rounded-xl border border-slate-200 bg-slate-50 md:grid-cols-12 items-stretch">
              <div className="flex flex-col justify-center p-5 md:col-span-7">
                <div className="flex items-center gap-2.5">
                  <Truck className="h-6 w-6 text-[#0B1F3A]" />
                  <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
                    {tracked.status === 'DELIVERED'
                      ? 'Order Delivered to Site'
                      : tracked.status === 'CANCELLED'
                        ? 'Order Cancelled'
                        : 'Your order is on the way!'}
                  </h2>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600">
                  <div>
                    <span className="block text-slate-400">Order Number</span>
                    <span className="font-mono font-bold text-[#0B1F3A]">
                      #{tracked.orderNumber}
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-400">Scheduled Date</span>
                    <span className="font-semibold text-slate-800">
                      {tracked.scheduledDate || 'Confirmed'} ({tracked.timeSlot || 'Standard'})
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-400">Assigned Driver</span>
                    <span className="font-semibold text-slate-800">
                      {tracked.driverName || 'Dispatch Queue'}{' '}
                      {tracked.vehiclePlate ? `· ${tracked.vehiclePlate}` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-400">Total Amount</span>
                    <span className="font-mono font-bold text-[#0B1F3A] tabular-nums">
                      {formatRwf(tracked.totalRwf)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="md:col-span-5">
                <img
                  src="/src/assets/images/promo_delivery_truck_1795165787247.jpg"
                  alt="Naceni's Business delivery vehicle"
                  referrerPolicy="no-referrer"
                  className="h-44 w-full object-cover md:h-full"
                />
              </div>
            </div>

            {/* Items & Timeline */}
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="flex items-center gap-2 text-sm font-bold text-[#0B1F3A]">
                  <Package className="h-4 w-4 text-[#F97316]" />
                  Order Items
                </h3>
                <div className="mt-3 divide-y divide-slate-100 text-xs">
                  {tracked.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-2.5"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">
                          {item.productName}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {item.sku} · Qty: {item.quantity}
                        </div>
                      </div>
                      <div className="font-mono font-bold text-[#0B1F3A] tabular-nums">
                        {formatRwf(item.lineTotalRwf)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-bold text-[#0B1F3A]">
                  Status Timeline
                </h3>
                <div className="mt-3 space-y-3">
                  {(tracked.statusTimeline || []).map((entry, idx) => (
                    <div key={idx} className="flex gap-3 text-xs">
                      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#F97316]" />
                      <div>
                        <div className="font-bold text-slate-800">
                          {entry.status.replace(/_/g, ' ')}
                        </div>
                        <div className="text-slate-600">{entry.note}</div>
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          {new Date(entry.timestamp).toLocaleString()} ·{' '}
                          {entry.actor}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {user && myOrders.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
            Your Order History
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5">Order #</th>
                  <th className="py-2.5">Date</th>
                  <th className="py-2.5">Status</th>
                  <th className="py-2.5">Payment</th>
                  <th className="py-2.5 text-right">Total</th>
                  <th className="py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="py-3 font-mono font-bold text-[#0B1F3A]">
                      #{o.orderNumber}
                    </td>
                    <td className="py-3 text-slate-600">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 font-semibold text-slate-800">
                      {o.status.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 text-emerald-700 font-semibold">
                      {o.paymentStatus}
                    </td>
                    <td className="py-3 text-right font-mono font-bold tabular-nums">
                      {formatRwf(o.totalRwf)}
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setQuery(o.orderNumber);
                            void lookupOrder(o.orderNumber);
                          }}
                          className="rounded-md border border-slate-200 px-2.5 py-1 font-semibold text-[#0B1F3A] hover:bg-slate-100"
                        >
                          Track
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadOrderInvoicePdf(o)}
                          className="inline-flex items-center gap-1 rounded-md bg-[#0B1F3A] px-2.5 py-1 font-semibold text-white hover:bg-[#13325C]"
                        >
                          <FileDown className="h-3 w-3" />
                          Invoice
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
