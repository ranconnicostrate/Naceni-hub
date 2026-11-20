import React, { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch, formatRwf } from '../services/api.ts';
import { downloadQuotationPdf } from '../services/exportUtils.ts';
import type { Order, Product } from '../types/index.ts';

interface Quotation {
  id: number;
  quoteNumber: string;
  customerName: string;
  companyName: string | null;
  status: string;
  subtotalRwf: number;
  discountRwf: number;
  totalRwf: number;
  customerNotes: string;
  internalNotes: string;
  createdAt: string;
  items: {
    id: number;
    productId: number;
    productName: string;
    sku: string;
    quantity: number;
    requestedPriceRwf: number;
    quotedPriceRwf: number;
    lineTotalRwf: number;
  }[];
}

interface B2BPortalViewProps {
  products: Product[];
  onAddMultipleToCart: (items: { product: Product; quantity: number }[]) => void;
  onRequireAuth: () => void;
}

export const B2BPortalView: React.FC<B2BPortalViewProps> = ({
  products,
  onAddMultipleToCart,
  onRequireAuth,
}) => {
  const { user, refreshUser } = useAuth();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [rfqRows, setRfqRows] = useState<
    { productId: number; quantity: number; requestedPriceRwf: number }[]
  >([]);
  const [notes, setNotes] = useState('');
  const [companyName, setCompanyName] = useState(
    user?.businessAccount?.companyName || ''
  );
  const [tinNumber, setTinNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (products.length > 0 && rfqRows.length === 0) {
      setRfqRows([
        {
          productId: products[0].id,
          quantity: 25,
          requestedPriceRwf: products[0].wholesalePriceRwf,
        },
      ]);
    }
  }, [products]);

  const loadData = async () => {
    if (!user) return;
    try {
      const [qRes, oRes] = await Promise.all([
        apiFetch<{ quotations: Quotation[] }>('/api/quotations'),
        apiFetch<{ orders: Order[] }>('/api/orders'),
      ]);
      setQuotations(qRes.quotations);
      setOrders(oRes.orders);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    setCompanyName(user?.businessAccount?.companyName || '');
    void loadData();
  }, [user]);

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return onRequireAuth();
    setBusy(true);
    try {
      await apiFetch('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ companyName, tinNumber }),
      });
      await refreshUser();
      setFeedback('Business profile and encrypted TIN saved.');
      setTinNumber('');
    } catch (err: any) {
      setFeedback(err?.message || 'Could not update business profile.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitRfq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return onRequireAuth();
    setBusy(true);
    setFeedback('');
    try {
      await apiFetch('/api/quotations', {
        method: 'POST',
        body: JSON.stringify({
          customerNotes: notes,
          items: rfqRows,
        }),
      });
      setNotes('');
      setFeedback('Quotation request submitted to Naceni Sales Team.');
      await loadData();
    } catch (err: any) {
      setFeedback(err?.message || 'Failed to submit RFQ.');
    } finally {
      setBusy(false);
    }
  };

  const handleAcceptQuote = async (quote: Quotation) => {
    try {
      await apiFetch(`/api/quotations/${quote.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACCEPTED' }),
      });
      const cartItems = quote.items
        .map((qi) => {
          const p = products.find((prod) => prod.id === qi.productId);
          return p ? { product: p, quantity: qi.quantity } : null;
        })
        .filter(Boolean) as { product: Product; quantity: number }[];
      onAddMultipleToCart(cartItems);
    } catch (err: any) {
      setFeedback(err?.message || 'Could not accept quotation.');
    }
  };

  const handleRepeatOrder = (order: Order) => {
    const cartItems = order.items
      .map((oi) => {
        const p = products.find((prod) => prod.id === oi.productId);
        return p ? { product: p, quantity: oi.quantity } : null;
      })
      .filter(Boolean) as { product: Product; quantity: number }[];
    if (cartItems.length > 0) {
      onAddMultipleToCart(cartItems);
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-12">
        {/* RFQ Builder */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
                B2B Bulk Procurement &amp; RFQ Portal
              </h1>
              <p className="text-sm text-slate-500">
                Request volume quotations, negotiate contract pricing, and
                repeat site orders.
              </p>
            </div>
            {!user && (
              <button
                type="button"
                onClick={onRequireAuth}
                className="rounded-lg bg-[#F97316] px-4 py-2 text-xs font-bold text-white hover:bg-[#EA580C]"
              >
                Sign In / Register B2B
              </button>
            )}
          </div>

          {feedback && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
              {feedback}
            </div>
          )}

          <form onSubmit={handleSubmitRfq} className="mt-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#0B1F3A]">
                Build Quotation Request (RFQ)
              </h2>
              <button
                type="button"
                onClick={() => {
                  const first = products[0];
                  if (first) {
                    setRfqRows([
                      ...rfqRows,
                      {
                        productId: first.id,
                        quantity: 10,
                        requestedPriceRwf: first.wholesalePriceRwf,
                      },
                    ]);
                  }
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Line Item
              </button>
            </div>

            <div className="space-y-2.5">
              {rfqRows.map((row, idx) => (
                <div
                  key={idx}
                  className="grid gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-12 items-end"
                >
                  <div className="sm:col-span-6">
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Product
                    </label>
                    <select
                      value={row.productId}
                      onChange={(e) => {
                        const prodId = Number(e.target.value);
                        const prod = products.find((p) => p.id === prodId);
                        const copy = [...rfqRows];
                        copy[idx] = {
                          ...copy[idx],
                          productId: prodId,
                          requestedPriceRwf:
                            prod?.wholesalePriceRwf || copy[idx].requestedPriceRwf,
                        };
                        setRfqRows(copy);
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name} (Wholesale:{' '}
                          {formatRwf(p.wholesalePriceRwf)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={(e) => {
                        const copy = [...rfqRows];
                        copy[idx].quantity = Math.max(1, Number(e.target.value) || 1);
                        setRfqRows(copy);
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs tabular-nums"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Target Unit Price (Rwf)
                    </label>
                    <input
                      type="number"
                      min={100}
                      value={row.requestedPriceRwf}
                      onChange={(e) => {
                        const copy = [...rfqRows];
                        copy[idx].requestedPriceRwf = Math.max(
                          100,
                          Number(e.target.value) || 100
                        );
                        setRfqRows(copy);
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs tabular-nums"
                    />
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    {rfqRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setRfqRows(rfqRows.filter((_, i) => i !== idx))
                        }
                        className="rounded-lg p-2 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Project / Delivery Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Specify project site, phased delivery dates, or structural spec requirements..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-[#0B1F3A] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#13325C] disabled:opacity-60"
            >
              {busy ? 'Submitting...' : 'Submit Bulk Quotation Request'}
            </button>
          </form>
        </div>

        {/* Business Account Profile */}
        <aside className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[#0B1F3A]">
            <Building2 className="h-5 w-5 text-[#F97316]" />
            Company &amp; Tax Profile
          </h2>
          {user?.businessAccount && (
            <div className="mt-3 space-y-1.5 rounded-xl bg-slate-50 p-3.5 text-xs">
              <div className="font-bold text-[#0B1F3A]">
                {user.businessAccount.companyName}
              </div>
              <div className="text-slate-600">
                Encrypted TIN: *****{user.businessAccount.tinLastFour}
              </div>
              <div className="text-slate-600">
                Credit Limit:{' '}
                <span className="font-mono font-bold text-[#0B1F3A]">
                  {formatRwf(user.businessAccount.creditLimitRwf)}
                </span>
              </div>
              <div className="text-slate-600">
                Terms: {user.businessAccount.paymentTerms}
              </div>
            </div>
          )}

          <form onSubmit={handleSaveCompany} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Company Legal Name
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Horizon Builders Ltd"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                RRA Tax Identification Number (TIN)
              </label>
              <input
                type="text"
                value={tinNumber}
                onChange={(e) => setTinNumber(e.target.value)}
                placeholder="Encrypted at rest (AES-256-GCM)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg border border-[#0B1F3A] py-2 text-xs font-bold text-[#0B1F3A] hover:bg-slate-50"
            >
              Save Business Profile
            </button>
          </form>
        </aside>
      </section>

      {/* Active Quotations */}
      {user && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[#0B1F3A]">
            <FileSpreadsheet className="h-5 w-5 text-[#F97316]" />
            Your B2B Quotations
          </h2>
          {quotations.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No quotations submitted yet. Use the RFQ builder above to request
              custom bulk pricing.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5">Quote #</th>
                    <th className="py-2.5">Items</th>
                    <th className="py-2.5">Status</th>
                    <th className="py-2.5 text-right">Savings</th>
                    <th className="py-2.5 text-right">Quoted Total</th>
                    <th className="py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {quotations.map((q) => (
                    <tr key={q.id}>
                      <td className="py-3 font-mono font-bold text-[#0B1F3A]">
                        {q.quoteNumber}
                      </td>
                      <td className="py-3 text-slate-600">
                        {q.items.length} SKU(s)
                      </td>
                      <td className="py-3 font-semibold text-slate-800">
                        {q.status}
                      </td>
                      <td className="py-3 text-right font-mono text-emerald-700 tabular-nums">
                        {formatRwf(q.discountRwf)}
                      </td>
                      <td className="py-3 text-right font-mono font-bold tabular-nums">
                        {formatRwf(q.totalRwf)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => downloadQuotationPdf(q)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <FileDown className="h-3 w-3" />
                            PDF
                          </button>
                          {q.status === 'QUOTED' && (
                            <button
                              type="button"
                              onClick={() => handleAcceptQuote(q)}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-700"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Order Now
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Repeat Previous Bulk Orders */}
      {user && orders.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
            Repeat Previous Bulk Orders
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {orders.slice(0, 4).map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 p-4"
              >
                <div>
                  <div className="font-mono text-sm font-bold text-[#0B1F3A]">
                    #{o.orderNumber}
                  </div>
                  <div className="text-xs text-slate-500">
                    {o.items.length} items · {formatRwf(o.totalRwf)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRepeatOrder(o)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-3 py-2 text-xs font-semibold text-white hover:bg-[#13325C]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Repeat Order
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
