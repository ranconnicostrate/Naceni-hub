import React, { useState } from 'react';
import {
  Bell,
  Boxes,
  FileBarChart2,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { BrandLogo } from '../BrandLogo.tsx';
import { AdminDashboardOverview } from './AdminDashboardOverview.tsx';
import { InventoryProcurementTab } from './InventoryProcurementTab.tsx';
import {
  AdminCustomersTab,
  AdminDeliveriesTab,
  AdminNotificationsTab,
  AdminOrdersTab,
  AdminProductsTab,
  AdminReportsTab,
  AdminSettingsSecurityTab,
} from './OperationsTabs.tsx';
import type { Category, NotificationItem } from '../../types/index.ts';

interface AdminWorkspaceProps {
  categories: Category[];
  notifications: NotificationItem[];
  onRefreshCatalog: () => Promise<void>;
  onRefreshNotifications: () => Promise<void>;
  onExitToStore: () => void;
}

export const AdminWorkspace: React.FC<AdminWorkspaceProps> = ({
  categories,
  notifications,
  onRefreshCatalog,
  onRefreshNotifications,
  onExitToStore,
}) => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'inventory', label: 'Inventory', icon: Warehouse },
    { id: 'orders', label: 'Orders', icon: ShoppingCart },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'procurement', label: 'Procurement', icon: Boxes },
    { id: 'deliveries', label: 'Deliveries', icon: Truck },
    { id: 'reports', label: 'Reports', icon: FileBarChart2 },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex min-h-[calc(100vh-4.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-[#F4F6FA] shadow-sm">
      {/* Dark Navy Sidebar matching reference mockup */}
      <aside className="flex w-60 shrink-0 flex-col justify-between bg-[#0B1F3A] p-4 text-slate-200 max-md:w-16 max-md:p-2">
        <div>
          <div className="mb-6 px-2 pt-1 max-md:hidden">
            <BrandLogo dark compact />
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-[#F97316] text-white'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate max-md:hidden">{item.label}</span>
                  </span>
                  {item.id === 'notifications' && unreadCount > 0 && (
                    <span className="rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10px] max-md:hidden">
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2 border-t border-white/10 pt-4">
          <div className="px-2 text-[11px] text-slate-400 max-md:hidden">
            <div className="truncate font-semibold text-white">
              {user?.fullName}
            </div>
            <div className="truncate">{user?.role}</div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await logout();
              onExitToStore();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="max-md:hidden">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Dashboard Viewport */}
      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        {activeTab === 'dashboard' && (
          <AdminDashboardOverview onNavigateTab={setActiveTab} />
        )}
        {activeTab === 'products' && (
          <AdminProductsTab
            categories={categories}
            onRefreshCatalog={onRefreshCatalog}
          />
        )}
        {activeTab === 'inventory' && (
          <InventoryProcurementTab mode="inventory" />
        )}
        {activeTab === 'procurement' && (
          <InventoryProcurementTab mode="procurement" />
        )}
        {activeTab === 'orders' && <AdminOrdersTab />}
        {activeTab === 'customers' && <AdminCustomersTab />}
        {activeTab === 'deliveries' && <AdminDeliveriesTab />}
        {activeTab === 'reports' && <AdminReportsTab />}
        {activeTab === 'notifications' && (
          <AdminNotificationsTab
            notifications={notifications}
            onRefresh={onRefreshNotifications}
          />
        )}
        {activeTab === 'settings' && <AdminSettingsSecurityTab />}
      </main>
    </div>
  );
};
