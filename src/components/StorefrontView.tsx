import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Blocks,
  Hammer,
  HardHat,
  Heart,
  Mail,
  MapPin,
  Phone,
  Scale,
  Search,
  Settings,
  ShoppingCart,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { formatRwf } from '../services/api.ts';
import type { Category, Product } from '../types/index.ts';

interface StorefrontViewProps {
  mode: 'home' | 'catalog';
  categories: Category[];
  products: Product[];
  selectedCategory: string;
  onSelectCategory: (slug: string) => void;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  onAddToCart: (product: Product, qty?: number) => void;
  onOpenProduct: (product: Product) => void;
  onNavigate: (view: 'home' | 'catalog' | 'b2b' | 'track') => void;
  wishlistIds: number[];
  onToggleWishlist: (productId: number) => void;
  compareList: Product[];
  onToggleCompare: (product: Product) => void;
  onClearCompare: () => void;
}

const CATEGORY_ICON_MAP: Record<string, React.ReactNode> = {
  hammer: <Hammer className="h-6 w-6 text-[#0B1F3A]" />,
  wrench: <Wrench className="h-6 w-6 text-[#0B1F3A]" />,
  zap: <Zap className="h-6 w-6 text-[#F97316]" />,
  bricks: <Blocks className="h-6 w-6 text-[#C2410C]" />,
  'hard-hat': <HardHat className="h-6 w-6 text-[#D97706]" />,
  settings: <Settings className="h-6 w-6 text-[#0B1F3A]" />,
};

export const StorefrontView: React.FC<StorefrontViewProps> = ({
  mode,
  categories,
  products,
  selectedCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  onAddToCart,
  onOpenProduct,
  onNavigate,
  wishlistIds,
  onToggleWishlist,
  compareList,
  onToggleCompare,
  onClearCompare,
}) => {
  const [sortBy, setSortBy] = useState<'popular' | 'price_asc' | 'price_desc'>('popular');
  const [maxPrice, setMaxPrice] = useState<number>(1000000);
  const [showCompareModal, setShowCompareModal] = useState(false);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = products.filter((p) => {
      const catOk =
        selectedCategory === 'all' || p.categorySlug === selectedCategory;
      const priceOk = p.retailPriceRwf <= maxPrice;
      const searchOk =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q);
      return catOk && priceOk && searchOk;
    });

    if (sortBy === 'price_asc') {
      return [...list].sort((a, b) => a.retailPriceRwf - b.retailPriceRwf);
    }
    if (sortBy === 'price_desc') {
      return [...list].sort((a, b) => b.retailPriceRwf - a.retailPriceRwf);
    }
    return [...list].sort(
      (a, b) => Number(b.isBestSeller) - Number(a.isBestSeller)
    );
  }, [products, selectedCategory, searchQuery, maxPrice, sortBy]);

  const featuredProducts = useMemo(() => {
    const featured = products.filter((p) => p.isFeatured);
    return (featured.length >= 6 ? featured : products).slice(0, 6);
  }, [products]);

  const renderProductCard = (product: Product) => {
    const outOfStock = product.availableStock <= 0;
    const lowStock =
      product.availableStock > 0 &&
      product.availableStock <= product.minStockLevel;
    const isSaved = wishlistIds.includes(product.id);
    const isCompared = compareList.some((c) => c.id === product.id);

    return (
      <article
        key={product.id}
        className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
      >
        <div
          onClick={() => onOpenProduct(product)}
          className="relative flex h-44 cursor-pointer items-center justify-center bg-white p-4"
        >
          <img
            src={product.imageUrl}
            alt={product.name}
            referrerPolicy="no-referrer"
            className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
          />
          <div className="absolute right-2.5 top-2.5 flex gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleWishlist(product.id);
              }}
              aria-label={`Save ${product.name} to wishlist`}
              className={`rounded-lg border p-1.5 transition-colors ${
                isSaved
                  ? 'border-rose-200 bg-rose-50 text-rose-600'
                  : 'border-slate-200 bg-white/90 text-slate-400 hover:text-rose-600'
              }`}
            >
              <Heart className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCompare(product);
              }}
              aria-label={`Compare ${product.name}`}
              className={`rounded-lg border p-1.5 transition-colors ${
                isCompared
                  ? 'border-[#0B1F3A] bg-[#0B1F3A] text-white'
                  : 'border-slate-200 bg-white/90 text-slate-400 hover:text-[#0B1F3A]'
              }`}
            >
              <Scale className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-between border-t border-slate-100 p-3.5">
          <div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <span className="truncate font-medium">
                {product.categoryName || product.brand}
              </span>
              <span
                className={`shrink-0 font-semibold ${
                  outOfStock
                    ? 'text-red-600'
                    : lowStock
                      ? 'text-amber-600'
                      : 'text-emerald-700'
                }`}
              >
                {outOfStock
                  ? 'Out of Stock'
                  : lowStock
                    ? `Low (${product.availableStock})`
                    : `${product.availableStock} In Stock`}
              </span>
            </div>

            <h3
              onClick={() => onOpenProduct(product)}
              className="mt-1 line-clamp-2 cursor-pointer text-sm font-semibold text-slate-900 hover:text-[#F97316]"
            >
              {product.name}
            </h3>
          </div>

          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-base font-bold text-[#0B1F3A] tabular-nums">
                {formatRwf(product.retailPriceRwf)}
              </span>
              <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                B2B {formatRwf(product.wholesalePriceRwf)}
              </span>
            </div>

            <button
              type="button"
              disabled={outOfStock}
              onClick={() => onAddToCart(product, 1)}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0B1F3A] py-2 text-xs font-semibold text-white transition-colors hover:bg-[#153563] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              {outOfStock ? 'Restocking Soon' : 'Add to Cart'}
            </button>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-8">
      {/* Search Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3.5">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.target.value);
              if (mode === 'home' && e.target.value.trim()) {
                onNavigate('catalog');
              }
            }}
            placeholder="Search tools, plumbing, electrical cables, cement, SKUs..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0B1F3A] focus:bg-white focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
          <span>6 Industrial Categories</span>
          <span aria-hidden="true">·</span>
          <span>Free Delivery Over Rwf 500,000</span>
          {compareList.length > 0 && (
            <button
              type="button"
              onClick={() => setShowCompareModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#F97316] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#EA580C]"
            >
              <Scale className="h-3.5 w-3.5" />
              Compare ({compareList.length})
            </button>
          )}
        </div>
      </div>

      {mode === 'home' && (
        <>
          {/* Hero Section */}
          <section className="relative overflow-hidden rounded-2xl bg-[#0B1F3A] shadow-lg">
            <img
              src="/src/assets/images/hero_construction_supply_1795165787244.jpg"
              alt="Naceni's Business construction supply engineer and building site"
              referrerPolicy="no-referrer"
              className="h-[380px] w-full object-cover object-center md:h-[420px]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#07162B]/95 via-[#0B1F3A]/80 to-[#0B1F3A]/20" />

            <div className="absolute inset-0 flex flex-col justify-center px-8 py-10 md:px-14">
              <div className="max-w-xl">
                <p className="font-display text-2xl font-bold text-[#F97316] md:text-3xl">
                  Naceni&apos;s Business
                </p>
                <h1 className="mt-1 font-display text-3xl font-extrabold leading-tight tracking-tight text-white md:text-5xl text-balance">
                  Your Trusted Partner in Construction Supply
                </h1>
                <p className="mt-3 text-sm font-medium text-slate-200 md:text-base">
                  Building Tools · Plumbing Supplies · Electrical Equipment ·
                  Site Materials &amp; B2B Logistics
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => onNavigate('catalog')}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#F97316] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#EA580C] whitespace-nowrap shrink-0"
                  >
                    Shop Now
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('b2b')}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/40 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-xs transition-colors hover:bg-white/20 whitespace-nowrap shrink-0"
                  >
                    Request Quotation
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* 6 Category Strip */}
          <section>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    onSelectCategory(cat.slug);
                    onNavigate('catalog');
                  }}
                  className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white p-4 text-center transition-all hover:-translate-y-0.5 hover:border-[#F97316] hover:shadow-sm"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
                    {CATEGORY_ICON_MAP[cat.icon] || (
                      <Hammer className="h-6 w-6 text-[#0B1F3A]" />
                    )}
                  </div>
                  <span className="text-xs font-bold text-[#0B1F3A] leading-snug">
                    {cat.name}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Featured Products + Bulk Procurement Side Card */}
          <section className="grid gap-6 lg:grid-cols-12 items-stretch">
            <div className="lg:col-span-9">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-xl font-bold text-[#0B1F3A]">
                  Featured Products
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    onSelectCategory('all');
                    onNavigate('catalog');
                  }}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[#0B1F3A] hover:text-[#F97316]"
                >
                  View All <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {featuredProducts.map(renderProductCard)}
              </div>
            </div>

            <aside className="lg:col-span-3 flex flex-col justify-between overflow-hidden rounded-2xl bg-[#0B1F3A] text-white">
              <div className="p-6">
                <p className="text-xs font-semibold text-orange-400">
                  B2B Contractor Program
                </p>
                <h3 className="mt-2 font-display text-2xl font-bold leading-tight text-[#F97316]">
                  Bulk Orders
                </h3>
                <p className="mt-1.5 text-lg font-semibold text-white">
                  Get Special Discounts for B2B Clients
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-300">
                  Request custom contractor quotations, tiered volume pricing,
                  and scheduled fleet deliveries directly to your site.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('b2b')}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#F97316] px-5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#EA580C]"
                >
                  Contact Sales &amp; RFQ
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <img
                src="/src/assets/images/promo_bulk_warehouse_1795165786437.jpg"
                alt="Palletized bulk construction materials in Naceni warehouse"
                referrerPolicy="no-referrer"
                className="h-48 w-full object-cover"
              />
            </aside>
          </section>

          {/* Company & Contact Footer */}
          <footer className="rounded-2xl border border-slate-200 bg-white p-8">
            <div className="grid gap-8 md:grid-cols-4">
              <div className="md:col-span-2">
                <h3 className="font-display text-lg font-bold text-[#0B1F3A]">
                  Naceni&apos;s Business Ltd
                </h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">
                  Rwanda&apos;s integrated construction hardware, plumbing,
                  electrical, and structural materials distributor serving civil
                  contractors, engineers, and individual builders with live
                  warehouse inventory.
                </p>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Kigali Headquarters
                </h4>
                <ul className="mt-2.5 space-y-2 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-[#F97316]" />
                    Masoro SEZ &amp; Nyabugogo Depot, Kigali
                  </li>
                  <li className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-[#F97316]" />
                    +250 788 000 101
                  </li>
                  <li className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-[#F97316]" />
                    sales@nacenisbusiness.rw
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Quick Links
                </h4>
                <ul className="mt-2.5 space-y-2 text-xs text-slate-600">
                  <li>
                    <button
                      type="button"
                      onClick={() => onNavigate('catalog')}
                      className="hover:text-[#F97316]"
                    >
                      Product Catalog
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => onNavigate('b2b')}
                      className="hover:text-[#F97316]"
                    >
                      B2B Procurement Portal
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => onNavigate('track')}
                      className="hover:text-[#F97316]"
                    >
                      Track Delivery
                    </button>
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5 text-xs text-slate-500">
              <span>
                © {new Date().getFullYear()} Naceni&apos;s Business. All rights
                reserved.
              </span>
              <div className="flex gap-4 font-medium">
                <a href="#linkedin" onClick={(e) => e.preventDefault()} className="hover:text-[#0B1F3A]">
                  LinkedIn
                </a>
                <a href="#instagram" onClick={(e) => e.preventDefault()} className="hover:text-[#0B1F3A]">
                  Instagram
                </a>
                <a href="#x" onClick={(e) => e.preventDefault()} className="hover:text-[#0B1F3A]">
                  X / Twitter
                </a>
              </div>
            </div>
          </footer>
        </>
      )}

      {mode === 'catalog' && (
        <section className="grid gap-6 lg:grid-cols-12">
          {/* Left Category & Promo Sidebar */}
          <aside className="space-y-4 lg:col-span-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="font-display text-base font-bold text-[#0B1F3A]">
                Categories
              </h2>
              <div className="mt-3 space-y-1">
                <button
                  type="button"
                  onClick={() => onSelectCategory('all')}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    selectedCategory === 'all'
                      ? 'bg-[#F97316] text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>All Categories</span>
                  <span className="font-mono">{products.length}</span>
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => onSelectCategory(cat.slug)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                      selectedCategory === cat.slug
                        ? 'bg-[#F97316] text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="truncate">{cat.name}</span>
                  </button>
                ))}
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Max Price</span>
                  <span className="font-mono text-[#0B1F3A] tabular-nums">
                    {formatRwf(maxPrice)}
                  </span>
                </div>
                <input
                  type="range"
                  min={30000}
                  max={1000000}
                  step={10000}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                  className="mt-2 w-full accent-[#F97316]"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-xl bg-[#0B1F3A] text-white">
              <div className="p-4">
                <p className="font-display text-base font-bold leading-snug">
                  Free Delivery for Orders Above{' '}
                  <span className="text-[#F97316]">Rwf 500,000</span>
                </p>
                <p className="mt-1 text-xs text-slate-300">
                  Same-day dispatch across Kigali sites.
                </p>
              </div>
              <img
                src="/src/assets/images/promo_delivery_truck_1795165787247.jpg"
                alt="Naceni's Business delivery fleet truck"
                referrerPolicy="no-referrer"
                className="h-32 w-full object-cover"
              />
            </div>
          </aside>

          {/* Product Catalog Grid */}
          <div className="lg:col-span-9">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
                  Product Catalog
                </h1>
                <p className="text-xs text-slate-500">
                  Showing {filteredProducts.length} construction supplies with
                  live stock counts
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600">
                  Sort by:
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="popular">Popular</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                </select>
              </div>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
                <p className="font-display text-base font-semibold text-slate-800">
                  No matching products found
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Try resetting your search filter or maximum price range.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onSelectCategory('all');
                    onSearchChange('');
                    setMaxPrice(1000000);
                  }}
                  className="mt-4 rounded-lg bg-[#0B1F3A] px-4 py-2 text-xs font-semibold text-white"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map(renderProductCard)}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Product Comparison Modal */}
      {showCompareModal && compareList.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1F3A]/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="font-display text-lg font-bold text-[#0B1F3A]">
                Side-by-Side Product Comparison
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClearCompare();
                    setShowCompareModal(false);
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-red-600"
                >
                  Clear All
                </button>
                <button
                  type="button"
                  onClick={() => setShowCompareModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="py-2 pr-4 font-semibold text-slate-500">
                      Specification
                    </th>
                    {compareList.map((p) => (
                      <th key={p.id} className="min-w-[180px] py-2 px-3">
                        <div className="font-bold text-[#0B1F3A]">{p.name}</div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {p.sku}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-2.5 font-semibold text-slate-600">
                      Brand
                    </td>
                    {compareList.map((p) => (
                      <td key={p.id} className="px-3 py-2.5">
                        {p.brand}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 font-semibold text-slate-600">
                      Retail Price
                    </td>
                    {compareList.map((p) => (
                      <td
                        key={p.id}
                        className="px-3 py-2.5 font-mono font-bold text-[#0B1F3A] tabular-nums"
                      >
                        {formatRwf(p.retailPriceRwf)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 font-semibold text-slate-600">
                      B2B Wholesale
                    </td>
                    {compareList.map((p) => (
                      <td
                        key={p.id}
                        className="px-3 py-2.5 font-mono font-bold text-emerald-700 tabular-nums"
                      >
                        {formatRwf(p.wholesalePriceRwf)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 font-semibold text-slate-600">
                      Stock Available
                    </td>
                    {compareList.map((p) => (
                      <td key={p.id} className="px-3 py-2.5 font-mono">
                        {p.availableStock} {p.unitOfMeasure}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 font-semibold text-slate-600">
                      Supplier
                    </td>
                    {compareList.map((p) => (
                      <td key={p.id} className="px-3 py-2.5">
                        {p.supplierName || 'Direct'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
