import React, { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Banknote,
  Calendar,
  Package,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { apiFetch, formatRwf } from '../../services/api.ts';

interface DashboardPayload {
  kpis: {
    totalOrders: number;
    totalRevenueRwf: number;
    totalProducts: number;
    totalCustomers: number;
    totalB2BClients: number;
    inventoryValueRwf: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    inStockProducts: number;
    stockHealthPct: number;
    pendingOrdersCount: number;
    activeDeliveriesCount: number;
    outstandingPaymentsRwf: number;
    procurementExpensesRwf: number;
  };
  salesSeries: { label: string; revenue: number; orders: number }[];
  categoryBreakdown: { name: string; revenue: number; units: number }[];
  topProducts: {
    productId: number;
    productName: string;
    sku: string;
    totalQty: number;
    totalRevenue: number;
  }[];
  recentOrders: {
    id: number;
    orderNumber: string;
    status: string;
    totalRwf: number;
    createdAt: string;
  }[];
}

const CHART_COLORS = ['#1D4ED8', '#F97316', '#059669', '#6366F1', '#D97706', '#0891B2'];

export const AdminDashboardOverview: React.FC<{
  onNavigateTab: (tab: string) => void;
}> = ({ onNavigateTab }) => {
  const { socket } = useAuth();
  const [range, setRange] = useState<'7d' | '30d' | '90d' | '1y'>('1y');
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    try {
      const res = await apiFetch<DashboardPayload>(
        `/api/analytics/dashboard?range=${range}`
      );
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, [range]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => void loadDashboard();
    socket.on('inventory:updated', refresh);
    socket.on('order:updated', refresh);
    socket.on('delivery:updated', refresh);
    return () => {
      socket.off('inventory:updated', refresh);
      socket.off('order:updated', refresh);
      socket.off('delivery:updated', refresh);
    };
  }, [socket, range]);

  if (loading && !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl bg-slate-200"
          />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const stockGaugeData = [
    { name: 'In Stock', value: Math.max(0, data.kpis.inStockProducts), color: '#16A34A' },
    { name: 'Low Stock', value: Math.max(0, data.kpis.lowStockProducts), color: '#F59E0B' },
    { name: 'Out of Stock', value: Math.max(0, data.kpis.outOfStockProducts), color: '#DC2626' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
            Admin Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            Real-time business overview from PostgreSQL records
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
          <Calendar className="h-4 w-4 text-slate-400" />
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as any)}
            className="bg-transparent focus:outline-none"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="1y">Last 12 Months</option>
          </select>
        </div>
      </div>

      {/* 4 Vivid KPI Cards matching reference image */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-gradient-to-br from-[#1D4ED8] to-[#1E40AF] p-5 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <ShoppingBag className="h-6 w-6 opacity-90" />
            <span className="text-xs font-medium text-blue-100">
              {data.kpis.pendingOrdersCount} pending
            </span>
          </div>
          <div className="mt-3 text-xs font-semibold text-blue-100">
            Total Orders
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums">
            {data.kpis.totalOrders.toLocaleString()}
          </div>
        </div>

        <div className="rounded-xl bg-gradient-to-br from-[#059669] to-[#047857] p-5 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <Banknote className="h-6 w-6 opacity-90" />
            <span className="text-xs font-medium text-emerald-100">
              Outstanding: {formatRwf(data.kpis.outstandingPaymentsRwf)}
            </span>
          </div>
          <div className="mt-3 text-xs font-semibold text-emerald-100">
            Total Revenue
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums">
            {formatRwf(data.kpis.totalRevenueRwf)}
          </div>
        </div>

        <div className="rounded-xl bg-gradient-to-br from-[#6366F1] to-[#4F46E5] p-5 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <Package className="h-6 w-6 opacity-90" />
            <span className="text-xs font-medium text-indigo-100">
              Val: {formatRwf(data.kpis.inventoryValueRwf)}
            </span>
          </div>
          <div className="mt-3 text-xs font-semibold text-indigo-100">
            Active Products
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums">
            {data.kpis.totalProducts.toLocaleString()}
          </div>
        </div>

        <div className="rounded-xl bg-gradient-to-br from-[#F97316] to-[#EA580C] p-5 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <Users className="h-6 w-6 opacity-90" />
            <span className="text-xs font-medium text-orange-100">
              {data.kpis.totalB2BClients} B2B Clients
            </span>
          </div>
          <div className="mt-3 text-xs font-semibold text-orange-100">
            Customers
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums">
            {data.kpis.totalCustomers.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Operational Health Strip */}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <div>
          <div className="text-xs text-slate-500">Inventory Value</div>
          <div className="mt-0.5 font-mono text-base font-bold text-[#0B1F3A] tabular-nums">
            {formatRwf(data.kpis.inventoryValueRwf)}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Active Deliveries</div>
          <div className="mt-0.5 font-mono text-base font-bold text-[#0B1F3A] tabular-nums">
            {data.kpis.activeDeliveriesCount} Scheduled
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Procurement Spend</div>
          <div className="mt-0.5 font-mono text-base font-bold text-[#0B1F3A] tabular-nums">
            {formatRwf(data.kpis.procurementExpensesRwf)}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Stock Alerts</div>
          <div className="mt-0.5 font-mono text-base font-bold text-amber-600 tabular-nums">
            {data.kpis.lowStockProducts} Low · {data.kpis.outOfStockProducts} Out
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7">
          <h2 className="font-display text-base font-bold text-[#0B1F3A]">
            Sales Overview
          </h2>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.salesSeries}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1D4ED8" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#1D4ED8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickFormatter={(v) =>
                    v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${Math.round(v / 1000)}k`
                  }
                />
                <Tooltip
                  formatter={(value: any) => [
                    formatRwf(Number(value)),
                    'Revenue',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#1D4ED8"
                  strokeWidth={2.5}
                  fill="url(#salesFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5">
          <h2 className="font-display text-base font-bold text-[#0B1F3A]">
            Sales by Category
          </h2>
          <div className="mt-4 grid grid-cols-2 items-center gap-2">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.categoryBreakdown}
                    dataKey="revenue"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {data.categoryBreakdown.map((_, idx) => (
                      <Cell
                        key={idx}
                        fill={CHART_COLORS[idx % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => formatRwf(Number(value))}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 text-xs">
              {data.categoryBreakdown.map((cat, idx) => (
                <div
                  key={cat.name}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate font-medium text-slate-700">
                    <span
                      className="mr-1.5 inline-block h-2.5 w-2.5 rounded-xs"
                      style={{
                        backgroundColor:
                          CHART_COLORS[idx % CHART_COLORS.length],
                      }}
                    />
                    {cat.name}
                  </span>
                  <span className="font-mono font-semibold text-[#0B1F3A] tabular-nums">
                    {cat.units}u
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Stock Status & Recent Orders */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-[#0B1F3A]">
              Stock Status
            </h2>
            <button
              type="button"
              onClick={() => onNavigateTab('inventory')}
              className="text-xs font-semibold text-[#1D4ED8] hover:underline"
            >
              Manage Stock
            </button>
          </div>
          <div className="mt-4 flex items-center gap-6">
            <div className="relative h-36 w-36 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stockGaugeData}
                    dataKey="value"
                    innerRadius={42}
                    outerRadius={62}
                    startAngle={90}
                    endAngle={-270}
                  >
                    {stockGaugeData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="font-mono text-xl font-bold text-[#0B1F3A] tabular-nums">
                  {data.kpis.stockHealthPct}%
                </span>
              </div>
            </div>
            <div className="flex-1 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="font-medium text-emerald-700">In Stock</span>
                <span className="font-mono font-bold tabular-nums">
                  {data.kpis.inStockProducts}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-amber-600">Low Stock</span>
                <span className="font-mono font-bold tabular-nums">
                  {data.kpis.lowStockProducts}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-red-600">Out of Stock</span>
                <span className="font-mono font-bold tabular-nums">
                  {data.kpis.outOfStockProducts}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-[#0B1F3A]">
              Recent Orders
            </h2>
            <button
              type="button"
              onClick={() => onNavigateTab('orders')}
              className="text-xs font-semibold text-[#1D4ED8] hover:underline"
            >
              View All
            </button>
          </div>
          <div className="mt-3 divide-y divide-slate-100">
            {data.recentOrders.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between py-2.5 text-xs"
              >
                <div>
                  <span className="font-mono font-bold text-[#0B1F3A]">
                    #{o.orderNumber}
                  </span>
                  <span className="ml-2 text-slate-400">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono font-semibold text-slate-800 tabular-nums">
                    {formatRwf(o.totalRwf)}
                  </span>
                  <span
                    className={`font-semibold ${
                      o.status === 'DELIVERED'
                        ? 'text-emerald-700'
                        : o.status === 'CANCELLED'
                          ? 'text-red-600'
                          : 'text-[#1D4ED8]'
                    }`}
                  >
                    {o.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
