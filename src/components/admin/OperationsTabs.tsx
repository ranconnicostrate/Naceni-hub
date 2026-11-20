import React, { useEffect, useState } from 'react';
import {
  Check,
  FileDown,
  FileSpreadsheet,
  Plus,
  Shield,
  Truck,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiFetch, formatRwf } from '../../services/api.ts';
import {
  downloadOrderInvoicePdf,
  exportReportToPdf,
  exportRowsToExcel,
} from '../../services/exportUtils.ts';
import {
  ORDER_STATUSES,
  USER_ROLES,
  type Category,
  type NotificationItem,
  type Order,
  type Product,
  type UserRole,
} from '../../types/index.ts';

export const AdminProductsTab: React.FC<{
  categories: Category[];
  onRefreshCatalog: () => Promise<void>;
}> = ({ categories, onRefreshCatalog }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({
    sku: '',
    name: '',
    description: '',
    categoryId: categories[0]?.id || 1,
    brand: 'Naceni Pro',
    unitOfMeasure: 'Piece',
    retailPriceRwf: 50000,
    wholesalePriceRwf: 42000,
    availableStock: 25,
    minStockLevel: 10,
    reorderPoint: 15,
    reorderQuantity: 30,
  });

  const load = async () => {
    const res = await apiFetch<{ products: Product[] }>(
      '/api/products?includeInactive=true'
    );
    setProducts(res.products);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    try {
      await apiFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setShowAdd(false);
      setForm({ ...form, sku: '', name: '', description: '' });
      setMsg('Product added to catalog and inventory.');
      await load();
      await onRefreshCatalog();
    } catch (err: any) {
      setMsg(err?.message || 'Failed to add product.');
    }
  };

  const handleArchive = async (id: number) => {
    try {
      await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
      await load();
      await onRefreshCatalog();
    } catch (err: any) {
      setMsg(err?.message || 'Failed to archive product.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
            Products Catalog Management
          </h1>
          <p className="text-sm text-slate-500">
            Configure SKUs, wholesale pricing, and reorder thresholds
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#F97316] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#EA580C]"
        >
          <Plus className="h-4 w-4" />
          Add Product
        </button>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
          {msg}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5">SKU</th>
                <th className="py-2.5">Product</th>
                <th className="py-2.5">Category</th>
                <th className="py-2.5 text-right">Retail</th>
                <th className="py-2.5 text-right">Wholesale</th>
                <th className="py-2.5 text-right">Stock</th>
                <th className="py-2.5">Status</th>
                <th className="py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 font-mono font-bold text-[#0B1F3A]">
                    {p.sku}
                  </td>
                  <td className="py-3 font-semibold">{p.name}</td>
                  <td className="py-3 text-slate-600">{p.categoryName}</td>
                  <td className="py-3 text-right font-mono tabular-nums">
                    {formatRwf(p.retailPriceRwf)}
                  </td>
                  <td className="py-3 text-right font-mono text-emerald-700 tabular-nums">
                    {formatRwf(p.wholesalePriceRwf)}
                  </td>
                  <td className="py-3 text-right font-mono font-bold tabular-nums">
                    {p.availableStock}
                  </td>
                  <td className="py-3 font-semibold">{p.status}</td>
                  <td className="py-3 text-right">
                    {p.status === 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={() => handleArchive(p.id)}
                        className="rounded-md border border-slate-200 px-2.5 py-1 font-semibold text-red-600 hover:bg-red-50"
                      >
                        Archive
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1F3A]/60 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3">
              <h3 className="font-display text-lg font-bold text-[#0B1F3A]">
                Add Construction Supply Product
              </h3>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold">SKU</label>
                  <input
                    required
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="CT-105"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold">Category</label>
                  <select
                    value={form.categoryId}
                    onChange={(e) =>
                      setForm({ ...form, categoryId: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block font-semibold">Product Name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold">Description</label>
                <textarea
                  required
                  rows={2}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block font-semibold">
                    Retail (Rwf)
                  </label>
                  <input
                    type="number"
                    required
                    value={form.retailPriceRwf}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        retailPriceRwf: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold">
                    Wholesale (Rwf)
                  </label>
                  <input
                    type="number"
                    required
                    value={form.wholesalePriceRwf}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        wholesalePriceRwf: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold">
                    Initial Stock
                  </label>
                  <input
                    type="number"
                    required
                    value={form.availableStock}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        availableStock: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-[#0B1F3A] py-2.5 font-bold text-white hover:bg-[#13325C]"
              >
                Save Product
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const AdminOrdersTab: React.FC = () => {
  const { socket } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const res = await apiFetch<{ orders: Order[] }>('/api/orders');
    setOrders(res.orders);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const h = () => void load();
    socket.on('order:updated', h);
    return () => {
      socket.off('order:updated', h);
    };
  }, [socket]);

  const handleStatusChange = async (orderId: number, status: string) => {
    try {
      await apiFetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setMsg(`Order status updated to ${status.replace(/_/g, ' ')}.`);
      await load();
    } catch (err: any) {
      setMsg(err?.message || 'Failed to update status.');
    }
  };

  const handleConfirmPayment = async (paymentId: number) => {
    try {
      await apiFetch(`/api/payments/${paymentId}/confirm`, { method: 'POST' });
      setMsg('Payment confirmed and invoice marked PAID.');
      await load();
    } catch (err: any) {
      setMsg(err?.message || 'Could not confirm payment.');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
          Orders &amp; Payment Fulfillment
        </h1>
        <p className="text-sm text-slate-500">
          Manage all 11 fulfillment stages, warehouse picking, and payment
          reconciliation
        </p>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
          {msg}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5">Order #</th>
                <th className="py-2.5">Customer</th>
                <th className="py-2.5">Payment</th>
                <th className="py-2.5 text-right">Total</th>
                <th className="py-2.5">Fulfillment Status</th>
                <th className="py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => {
                const pendingPayment = o.payments?.find(
                  (p) => p.status === 'PENDING'
                );
                return (
                  <tr key={o.id}>
                    <td className="py-3 font-mono font-bold text-[#0B1F3A]">
                      #{o.orderNumber}
                      <div className="text-[10px] font-normal text-slate-400">
                        {o.orderType}
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="font-semibold text-slate-900">
                        {o.customerName}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {o.items.length} SKU(s)
                      </div>
                    </td>
                    <td className="py-3">
                      <span
                        className={`font-semibold ${
                          o.paymentStatus === 'PAID'
                            ? 'text-emerald-700'
                            : 'text-amber-600'
                        }`}
                      >
                        {o.paymentStatus}
                      </span>
                      {pendingPayment && (
                        <button
                          type="button"
                          onClick={() => handleConfirmPayment(pendingPayment.id)}
                          className="ml-2 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white"
                        >
                          Confirm Pay
                        </button>
                      )}
                    </td>
                    <td className="py-3 text-right font-mono font-bold tabular-nums">
                      {formatRwf(o.totalRwf)}
                    </td>
                    <td className="py-3">
                      <select
                        value={o.status}
                        onChange={(e) =>
                          handleStatusChange(o.id, e.target.value)
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0B1F3A]"
                      >
                        {ORDER_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => downloadOrderInvoicePdf(o)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 font-semibold text-[#0B1F3A] hover:bg-slate-50"
                      >
                        <FileDown className="h-3 w-3" />
                        Invoice
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const AdminDeliveriesTab: React.FC = () => {
  const { socket } = useAuth();
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const res = await apiFetch<{ deliveries: any[] }>('/api/deliveries');
    setDeliveries(res.deliveries);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const h = () => void load();
    socket.on('delivery:updated', h);
    return () => {
      socket.off('delivery:updated', h);
    };
  }, [socket]);

  const handleUpdate = async (id: number, patch: Record<string, unknown>) => {
    setMsg('');
    setError('');
    try {
      await apiFetch(`/api/deliveries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setMsg('Delivery schedule updated.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to update delivery.');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
          Delivery Scheduling &amp; Fleet Dispatch
        </h1>
        <p className="text-sm text-slate-500">
          Assign drivers with automatic schedule-conflict prevention and capture
          proof of delivery
        </p>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
          {msg}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5">Tracking / Order</th>
                <th className="py-2.5">Date &amp; Slot</th>
                <th className="py-2.5">Destination</th>
                <th className="py-2.5">Driver</th>
                <th className="py-2.5">Status</th>
                <th className="py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td className="py-3">
                    <div className="font-mono font-bold text-[#0B1F3A]">
                      {d.trackingCode}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">
                      #{d.orderNumber}
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="font-semibold">{d.scheduledDate}</div>
                    <div className="text-[11px] text-slate-500">{d.timeSlot}</div>
                  </td>
                  <td className="py-3 text-slate-600">
                    {d.shippingAddress?.district}, {d.shippingAddress?.province}
                  </td>
                  <td className="py-3">
                    <select
                      value={d.driverName || 'Unassigned'}
                      onChange={(e) =>
                        handleUpdate(d.id, {
                          driverName: e.target.value,
                          vehiclePlate:
                            e.target.value === 'Emmanuel Habineza'
                              ? 'RAE 412 C'
                              : e.target.value === 'Claude Ndayisaba'
                                ? 'RAF 889 B'
                                : 'RAG 204 D',
                          status:
                            d.status === 'SCHEDULED' ? 'ASSIGNED' : d.status,
                        })
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      <option value="Unassigned">Unassigned</option>
                      <option value="Emmanuel Habineza">Emmanuel Habineza</option>
                      <option value="Claude Ndayisaba">Claude Ndayisaba</option>
                      <option value="Patrick Kamanzi">Patrick Kamanzi</option>
                    </select>
                  </td>
                  <td className="py-3 font-semibold text-[#0B1F3A]">
                    {d.status.replace(/_/g, ' ')}
                  </td>
                  <td className="py-3 text-right">
                    <div className="inline-flex gap-1.5">
                      {d.status !== 'IN_TRANSIT' && d.status !== 'DELIVERED' && (
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdate(d.id, { status: 'IN_TRANSIT' })
                          }
                          className="inline-flex items-center gap-1 rounded-md bg-[#1D4ED8] px-2.5 py-1 font-semibold text-white"
                        >
                          <Truck className="h-3 w-3" />
                          Dispatch
                        </button>
                      )}
                      {d.status !== 'DELIVERED' && (
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdate(d.id, {
                              status: 'DELIVERED',
                              signedBy: d.customerName,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 font-semibold text-white"
                        >
                          <Check className="h-3 w-3" />
                          Confirm POD
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const REPORT_TYPES = [
  { id: 'inventory', label: 'Inventory Valuation Report' },
  { id: 'stock-movements', label: 'Stock Movements Audit Report' },
  { id: 'sales', label: 'Sales Revenue Report' },
  { id: 'orders', label: 'Order Fulfillment Report' },
  { id: 'procurement', label: 'Procurement & PO Report' },
  { id: 'suppliers', label: 'Approved Suppliers Report' },
  { id: 'customers', label: 'Customers & B2B Accounts Report' },
  { id: 'deliveries', label: 'Delivery Schedule Report' },
  { id: 'financial', label: 'Financial & Payment Reconciliation' },
];

export const AdminReportsTab: React.FC = () => {
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleExport = async (
    reportId: string,
    format: 'pdf' | 'excel' | 'csv'
  ) => {
    setBusyId(`${reportId}-${format}`);
    try {
      if (format === 'csv') {
        window.open(`/api/reports/${reportId}?format=csv`, '_blank');
        return;
      }
      const res = await apiFetch<{
        title: string;
        generatedAt: string;
        rows: Record<string, unknown>[];
      }>(`/api/reports/${reportId}?format=json`);

      if (format === 'pdf') {
        exportReportToPdf(res.title, res.generatedAt, res.rows);
      } else {
        exportRowsToExcel(`nacenis-${reportId}-report`, res.title, res.rows);
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
          Real-Time Operational Reports
        </h1>
        <p className="text-sm text-slate-500">
          Export live PostgreSQL database records with generation timestamps in
          PDF, Excel, or CSV
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORT_TYPES.map((rep) => (
          <div
            key={rep.id}
            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5"
          >
            <div>
              <FileSpreadsheet className="h-6 w-6 text-[#F97316]" />
              <h2 className="mt-2.5 font-display text-base font-bold text-[#0B1F3A]">
                {rep.label}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Real-time snapshot directly from live Cloud SQL tables.
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => handleExport(rep.id, 'pdf')}
                className="flex-1 rounded-lg bg-[#0B1F3A] py-2 text-xs font-semibold text-white hover:bg-[#13325C]"
              >
                PDF
              </button>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => handleExport(rep.id, 'excel')}
                className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Excel
              </button>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => handleExport(rep.id, 'csv')}
                className="flex-1 rounded-lg border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                CSV
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const AdminCustomersTab: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const [uRes, qRes] = await Promise.all([
      apiFetch<any>('/api/users'),
      apiFetch<any>('/api/quotations'),
    ]);
    setUsers(uRes.users);
    setQuotes(qRes.quotations);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleQuoteApprove = async (id: number) => {
    await apiFetch(`/api/quotations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'QUOTED',
        internalNotes: 'Approved wholesale quotation by Sales Team.',
      }),
    });
    setMsg('B2B quotation issued to client.');
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
          Customers &amp; B2B Quotations
        </h1>
        <p className="text-sm text-slate-500">
          Review contractor RFQ requests and manage client accounts
        </p>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
          {msg}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-display text-base font-bold text-[#0B1F3A]">
          B2B Requests for Quotation (RFQ)
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2">Quote #</th>
                <th className="py-2">Client / Company</th>
                <th className="py-2">Status</th>
                <th className="py-2 text-right">Quoted Total</th>
                <th className="py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {quotes.map((q) => (
                <tr key={q.id}>
                  <td className="py-2.5 font-mono font-bold text-[#0B1F3A]">
                    {q.quoteNumber}
                  </td>
                  <td className="py-2.5">
                    {q.companyName || q.customerName}
                  </td>
                  <td className="py-2.5 font-semibold">{q.status}</td>
                  <td className="py-2.5 text-right font-mono font-bold tabular-nums">
                    {formatRwf(q.totalRwf)}
                  </td>
                  <td className="py-2.5 text-right">
                    {q.status === 'REQUESTED' && (
                      <button
                        type="button"
                        onClick={() => handleQuoteApprove(q.id)}
                        className="rounded-md bg-[#F97316] px-2.5 py-1 font-semibold text-white"
                      >
                        Approve &amp; Send Quote
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-display text-base font-bold text-[#0B1F3A]">
          Registered Accounts ({users.length})
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2">Name</th>
                <th className="py-2">Email</th>
                <th className="py-2">Role</th>
                <th className="py-2">Company</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 font-semibold">{u.fullName}</td>
                  <td className="py-2.5 text-slate-600">{u.email}</td>
                  <td className="py-2.5 font-mono text-[11px]">{u.role}</td>
                  <td className="py-2.5 text-slate-600">
                    {u.companyName || '-'}
                  </td>
                  <td className="py-2.5 font-semibold text-emerald-700">
                    {u.isActive ? 'Active' : 'Disabled'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const AdminNotificationsTab: React.FC<{
  notifications: NotificationItem[];
  onRefresh: () => Promise<void>;
}> = ({ notifications, onRefresh }) => {
  const handleMarkAll = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'PATCH' });
    await onRefresh();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
            Notifications Center
          </h1>
          <p className="text-sm text-slate-500">
            Real-time alerts for low stock, orders, payments, and deliveries
          </p>
        </div>
        <button
          type="button"
          onClick={handleMarkAll}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50"
        >
          Mark All Read
        </button>
      </div>

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No notifications yet.
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start justify-between gap-4 p-4 ${
                n.isRead ? 'bg-white' : 'bg-orange-50/40'
              }`}
            >
              <div>
                <div className="text-xs font-bold text-[#0B1F3A]">
                  {n.title}
                </div>
                <p className="mt-0.5 text-xs text-slate-600">{n.message}</p>
                <div className="mt-1 text-[11px] text-slate-400">
                  {new Date(n.createdAt).toLocaleString()} · {n.type}
                </div>
              </div>
              {!n.isRead && (
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/notifications/${n.id}/read`, {
                      method: 'PATCH',
                    });
                    await onRefresh();
                  }}
                  className="shrink-0 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                >
                  Dismiss
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const AdminSettingsSecurityTab: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    if (user?.role !== 'SUPER_ADMIN') return;
    try {
      const [uRes, aRes] = await Promise.all([
        apiFetch<any>('/api/users'),
        apiFetch<any>('/api/users/audit-logs'),
      ]);
      setUsers(uRes.users);
      setAuditLogs(aRes.logs);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    void load();
  }, [user]);

  const handleRoleChange = async (id: number, role: UserRole) => {
    setError('');
    setMsg('');
    try {
      await apiFetch(`/api/users/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      setMsg('User role updated.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to update role.');
    }
  };

  const handleToggleActive = async (id: number, isActive: boolean) => {
    setError('');
    setMsg('');
    try {
      await apiFetch(`/api/users/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });
      setMsg(`User ${isActive ? 'activated' : 'deactivated'}.`);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to update status.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
          Security, RBAC &amp; Audit Logs
        </h1>
        <p className="text-sm text-slate-500">
          Manage employee roles, account activation, and immutable security
          audit trails
        </p>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
          {msg}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      {user?.role !== 'SUPER_ADMIN' ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Role management and audit logs are restricted to Super
          Administrators.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-[#0B1F3A]">
              <Shield className="h-4 w-4 text-[#F97316]" />
              Role-Based Access Control (RBAC)
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2">User</th>
                    <th className="py-2">Email</th>
                    <th className="py-2">Assigned Role</th>
                    <th className="py-2 text-right">Account Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2.5 font-semibold">{u.fullName}</td>
                      <td className="py-2.5 text-slate-600">{u.email}</td>
                      <td className="py-2.5">
                        <select
                          value={u.role}
                          onChange={(e) =>
                            handleRoleChange(u.id, e.target.value as UserRole)
                          }
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold"
                        >
                          {USER_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(u.id, !u.isActive)}
                          className={`rounded-md px-2.5 py-1 font-semibold ${
                            u.isActive
                              ? 'border border-slate-200 text-slate-700 hover:bg-red-50 hover:text-red-600'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-display text-base font-bold text-[#0B1F3A]">
              System Audit Log
            </h2>
            <div className="mt-3 max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2">Timestamp</th>
                    <th className="py-2">Actor</th>
                    <th className="py-2">Action</th>
                    <th className="py-2">Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 text-slate-500">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 font-medium">{log.actorEmail}</td>
                      <td className="py-2 font-mono font-semibold text-[#0B1F3A]">
                        {log.action}
                      </td>
                      <td className="py-2 font-mono text-slate-600">
                        {log.entityType} #{log.entityId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
