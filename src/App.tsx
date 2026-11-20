import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  ShoppingCart,
  User as UserIcon,
} from 'lucide-react';
import { AuthModal } from './components/AuthModal.tsx';
import { B2BPortalView } from './components/B2BPortalView.tsx';
import { BrandLogo } from './components/BrandLogo.tsx';
import { CartDrawer } from './components/CartDrawer.tsx';
import { OrderTrackingView } from './components/OrderTrackingView.tsx';
import { ProductModal } from './components/ProductModal.tsx';
import { StorefrontView } from './components/StorefrontView.tsx';
import { AdminWorkspace } from './components/admin/AdminWorkspace.tsx';
import { useAuth } from './context/AuthContext.tsx';
import { apiFetch } from './services/api.ts';
import type {
  CartItem,
  Category,
  NotificationItem,
  Product,
} from './types/index.ts';

type AppView = 'home' | 'catalog' | 'b2b' | 'track' | 'admin';

const CART_STORAGE_KEY = 'naceni_cart_items';

export function App() {
  const { user, isStaff, socket, logout } = useAuth();
  const [view, setView] = useState<AppView>('home');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [wishlistIds, setWishlistIds] = useState<number[]>([]);
  const [compareList, setCompareList] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [trackedOrderNumber, setTrackedOrderNumber] = useState('ORD-2026-1048');
  const [toast, setToast] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as CartItem[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Ignore storage quota errors
    }
  }, [cart]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => {
      setToast((prev) => (prev === message ? null : prev));
    }, 3500);
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      const [catRes, prodRes] = await Promise.all([
        apiFetch<{ categories: Category[] }>('/api/categories'),
        apiFetch<{ products: Product[] }>('/api/products'),
      ]);
      setCategories(catRes.categories);
      setProducts(prodRes.products);
    } catch {
      // Initial catalog load failed; handled gracefully
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      return;
    }
    try {
      const res = await apiFetch<{ notifications: NotificationItem[] }>(
        '/api/notifications'
      );
      setNotifications(res.notifications);
    } catch {
      // Ignore
    }
  }, [user]);

  const loadWishlist = useCallback(async () => {
    if (!user) {
      setWishlistIds([]);
      return;
    }
    try {
      const res = await apiFetch<{ productIds: number[] }>('/api/wishlist');
      setWishlistIds(res.productIds);
    } catch {
      // Ignore
    }
  }, [user]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadNotifications();
    void loadWishlist();
  }, [loadNotifications, loadWishlist]);

  useEffect(() => {
    if (!socket) return;
    const onInventoryUpdated = () => {
      void loadCatalog();
    };
    const onNotificationNew = () => {
      void loadNotifications();
    };
    const onOrderUpdated = (payload: {
      orderNumber?: string;
      status?: string;
    }) => {
      if (payload?.orderNumber && payload?.status) {
        showToast(
          `Order #${payload.orderNumber} updated to ${payload.status.replace(/_/g, ' ')}`
        );
      }
      void loadNotifications();
    };
    socket.on('inventory:updated', onInventoryUpdated);
    socket.on('notification:new', onNotificationNew);
    socket.on('order:updated', onOrderUpdated);
    return () => {
      socket.off('inventory:updated', onInventoryUpdated);
      socket.off('notification:new', onNotificationNew);
      socket.off('order:updated', onOrderUpdated);
    };
  }, [socket, loadCatalog, loadNotifications, showToast]);

  const handleAddToCart = (product: Product, qty = 1) => {
    if (product.availableStock <= 0) return;
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        const nextQty = Math.min(product.availableStock, existing.quantity + qty);
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: nextQty } : item
        );
      }
      return [
        ...prev,
        { product, quantity: Math.min(product.availableStock, qty) },
      ];
    });
    showToast(`Added ${product.name} to cart.`);
  };

  const handleAddMultipleToCart = (
    items: { product: Product; quantity: number }[]
  ) => {
    setCart((prev) => {
      const next = [...prev];
      for (const entry of items) {
        if (entry.product.availableStock <= 0) continue;
        const idx = next.findIndex((c) => c.product.id === entry.product.id);
        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            quantity: Math.min(
              entry.product.availableStock,
              next[idx].quantity + entry.quantity
            ),
          };
        } else {
          next.push({
            product: entry.product,
            quantity: Math.min(entry.product.availableStock, entry.quantity),
          });
        }
      }
      return next;
    });
    setCartOpen(true);
  };

  const handleToggleWishlist = async (productId: number) => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }
    try {
      const res = await apiFetch<{ saved: boolean }>(
        `/api/wishlist/${productId}`,
        { method: 'POST' }
      );
      setWishlistIds((prev) =>
        res.saved
          ? [...new Set([...prev, productId])]
          : prev.filter((id) => id !== productId)
      );
    } catch {
      // Ignore
    }
  };

  const handleToggleCompare = (product: Product) => {
    setCompareList((prev) => {
      if (prev.some((p) => p.id === product.id)) {
        return prev.filter((p) => p.id !== product.id);
      }
      if (prev.length >= 4) {
        showToast('You can compare up to 4 products at a time.');
        return prev;
      }
      return [...prev, product];
    });
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const unreadNotifs = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="min-h-screen bg-[#F4F6FA] text-slate-900">
      {/* Global 3-Zone Top Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setView('home')}
            className="shrink-0 text-left focus:outline-none"
          >
            <BrandLogo />
          </button>

          <nav className="hidden items-center gap-1 md:flex">
            {[
              { id: 'home', label: 'Home' },
              { id: 'catalog', label: 'Catalog' },
              { id: 'b2b', label: 'B2B Portal' },
              { id: 'track', label: 'Track Order' },
              ...(isStaff ? [{ id: 'admin', label: 'Dashboard' }] : []),
            ].map((item) => {
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id as AppView)}
                  className={`rounded-lg px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#F97316] text-white'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-[#0B1F3A]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {user && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowNotifMenu((s) => !s)}
                  aria-label="Notifications"
                  className="relative rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 hover:text-[#0B1F3A]"
                >
                  <Bell className="h-4 w-4" />
                  {unreadNotifs > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F97316] px-1 font-mono text-[10px] font-bold text-white">
                      {unreadNotifs}
                    </span>
                  )}
                </button>

                {showNotifMenu && (
                  <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs font-bold text-[#0B1F3A]">
                        Notifications
                      </span>
                      {unreadNotifs > 0 && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch('/api/notifications/read-all', {
                              method: 'PATCH',
                            });
                            await loadNotifications();
                          }}
                          className="text-[11px] font-semibold text-[#F97316] hover:underline"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <p className="py-4 text-center text-xs text-slate-400">
                          No notifications yet.
                        </p>
                      ) : (
                        notifications.slice(0, 6).map((n) => (
                          <div
                            key={n.id}
                            className={`rounded-lg p-2 text-xs ${
                              n.isRead ? 'bg-slate-50' : 'bg-orange-50'
                            }`}
                          >
                            <div className="font-bold text-[#0B1F3A]">
                              {n.title}
                            </div>
                            <div className="mt-0.5 text-slate-600">
                              {n.message}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setCartOpen(true)}
              aria-label="Open procurement cart"
              className="relative inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-[#0B1F3A] hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Cart</span>
              {cartCount > 0 && (
                <span className="rounded-full bg-[#F97316] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </button>

            {user ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAccountMenu((s) => !s)}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0B1F3A] px-3 py-2 text-xs font-bold text-white hover:bg-[#153563] whitespace-nowrap shrink-0"
                >
                  <UserIcon className="h-3.5 w-3.5" />
                  <span className="max-w-[110px] truncate">
                    {user.fullName}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>

                {showAccountMenu && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                    <div className="border-b border-slate-100 px-3 py-2">
                      <div className="truncate text-xs font-bold text-[#0B1F3A]">
                        {user.fullName}
                      </div>
                      <div className="truncate text-[11px] text-slate-500">
                        {user.email}
                      </div>
                      <div className="mt-0.5 text-[10px] font-bold text-[#F97316]">
                        {user.role.replace(/_/g, ' ')}
                      </div>
                    </div>
                    {isStaff && (
                      <button
                        type="button"
                        onClick={() => {
                          setView('admin');
                          setShowAccountMenu(false);
                        }}
                        className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <LayoutDashboard className="h-3.5 w-3.5 text-[#F97316]" />
                        Admin Workspace
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setView('track');
                        setShowAccountMenu(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      My Orders &amp; Tracking
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setShowAccountMenu(false);
                        await logout();
                        if (view === 'admin') setView('home');
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#153563] whitespace-nowrap shrink-0"
              >
                <UserIcon className="h-3.5 w-3.5" />
                Sign In
              </button>
            )}
          </div>
        </div>

        {/* Mobile navigation row */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden">
          {[
            { id: 'home', label: 'Home' },
            { id: 'catalog', label: 'Catalog' },
            { id: 'b2b', label: 'B2B Portal' },
            { id: 'track', label: 'Track Order' },
            ...(isStaff ? [{ id: 'admin', label: 'Dashboard' }] : []),
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id as AppView)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 ${
                view === item.id
                  ? 'bg-[#F97316] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {(view === 'home' || view === 'catalog') && (
          <StorefrontView
            mode={view}
            categories={categories}
            products={products}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onAddToCart={handleAddToCart}
            onOpenProduct={setSelectedProduct}
            onNavigate={(next) => setView(next)}
            wishlistIds={wishlistIds}
            onToggleWishlist={(id) => void handleToggleWishlist(id)}
            compareList={compareList}
            onToggleCompare={handleToggleCompare}
            onClearCompare={() => setCompareList([])}
          />
        )}

        {view === 'b2b' && (
          <B2BPortalView
            products={products}
            onAddMultipleToCart={handleAddMultipleToCart}
            onRequireAuth={() => setAuthModalOpen(true)}
          />
        )}

        {view === 'track' && (
          <OrderTrackingView initialOrderNumber={trackedOrderNumber} />
        )}

        {view === 'admin' &&
          (isStaff ? (
            <AdminWorkspace
              categories={categories}
              notifications={notifications}
              onRefreshCatalog={loadCatalog}
              onRefreshNotifications={loadNotifications}
              onExitToStore={() => setView('home')}
            />
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
              <h1 className="font-display text-xl font-bold text-[#0B1F3A]">
                Staff &amp; Administrator Access Required
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Sign in with an authorized Naceni&apos;s Business staff or
                administrator account to access inventory, procurement, and
                analytics.
              </p>
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="mt-5 rounded-lg bg-[#0B1F3A] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#153563]"
              >
                Sign In to Admin Workspace
              </button>
            </div>
          ))}
      </main>

      {/* Modals & Drawers */}
      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
        isWishlisted={
          selectedProduct ? wishlistIds.includes(selectedProduct.id) : false
        }
        onToggleWishlist={(id) => void handleToggleWishlist(id)}
        isCompared={
          selectedProduct
            ? compareList.some((p) => p.id === selectedProduct.id)
            : false
        }
        onToggleCompare={handleToggleCompare}
      />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart}
        onUpdateQty={(productId, quantity) =>
          setCart((prev) =>
            prev.map((item) =>
              item.product.id === productId ? { ...item, quantity } : item
            )
          )
        }
        onRemove={(productId) =>
          setCart((prev) => prev.filter((item) => item.product.id !== productId))
        }
        onClear={() => setCart([])}
        onRequireAuth={() => setAuthModalOpen(true)}
        onOrderPlaced={(orderNumber) => {
          setTrackedOrderNumber(orderNumber);
          void loadCatalog();
          void loadNotifications();
        }}
      />

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl border border-slate-700 bg-[#0B1F3A] px-4 py-3 text-xs font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
