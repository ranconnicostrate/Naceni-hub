import React, { useState } from 'react';
import {
  Check,
  Heart,
  PackageCheck,
  Scale,
  ShoppingCart,
  Truck,
  X,
} from 'lucide-react';
import { formatRwf } from '../services/api.ts';
import type { Product } from '../types/index.ts';

interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (product: Product, qty: number) => void;
  isWishlisted: boolean;
  onToggleWishlist: (productId: number) => void;
  isCompared: boolean;
  onToggleCompare: (product: Product) => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  product,
  onClose,
  onAddToCart,
  isWishlisted,
  onToggleWishlist,
  isCompared,
  onToggleCompare,
}) => {
  const [qty, setQty] = useState(1);

  if (!product) return null;

  const outOfStock = product.availableStock <= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1F3A]/60 p-4 backdrop-blur-xs">
      <div className="relative grid w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl md:grid-cols-2">
        <button
          onClick={onClose}
          aria-label="Close product details"
          className="absolute right-4 top-4 z-10 rounded-lg bg-white/90 p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center justify-center bg-slate-50 p-8">
          <img
            src={product.imageUrl}
            alt={product.name}
            referrerPolicy="no-referrer"
            className="max-h-72 w-full rounded-lg object-contain"
          />
        </div>

        <div className="flex flex-col justify-between p-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span>{product.categoryName || 'Construction Supply'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{product.sku}</span>
              <span aria-hidden="true">·</span>
              <span>{product.brand}</span>
            </div>

            <h2 className="mt-2 font-display text-xl font-bold text-[#0B1F3A]">
              {product.name}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {product.description}
            </p>

            <div className="mt-4 flex items-baseline gap-4 border-y border-slate-100 py-3">
              <div>
                <div className="text-[11px] font-semibold text-slate-500">
                  Retail Price
                </div>
                <div className="font-mono text-2xl font-bold text-[#0B1F3A] tabular-nums">
                  {formatRwf(product.retailPriceRwf)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-emerald-700">
                  B2B Wholesale
                </div>
                <div className="font-mono text-lg font-bold text-emerald-700 tabular-nums">
                  {formatRwf(product.wholesalePriceRwf)}
                </div>
              </div>
            </div>

            {product.bulkTiers && product.bulkTiers.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-bold text-slate-700">
                  Bulk Quantity Tiers
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {product.bulkTiers.map((tier) => (
                    <div
                      key={tier.minQty}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-center"
                    >
                      <div className="text-[11px] font-semibold text-slate-500">
                        {tier.minQty}+ {product.unitOfMeasure}s
                      </div>
                      <div className="font-mono text-xs font-bold text-[#0B1F3A] tabular-nums">
                        {formatRwf(tier.unitPriceRwf)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 space-y-1.5 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <PackageCheck className="h-4 w-4 text-emerald-600" />
                <span>
                  {outOfStock
                    ? 'Currently out of stock (Auto-reorder initiated)'
                    : `${product.availableStock} ${product.unitOfMeasure}(s) available in warehouse`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-[#F97316]" />
                <span>
                  Supplier: {product.supplierName || 'Naceni Direct'} · Batch:{' '}
                  {product.batchNumber || '2026'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={Math.max(1, product.availableStock)}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                disabled={outOfStock}
                className="w-20 rounded-lg border border-slate-300 px-3 py-2.5 text-center font-mono text-sm font-semibold tabular-nums"
              />
              <button
                type="button"
                disabled={outOfStock}
                onClick={() => {
                  onAddToCart(product, qty);
                  onClose();
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#0B1F3A] py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#13325C] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <ShoppingCart className="h-4 w-4" />
                {outOfStock ? 'Out of Stock' : 'Add to Cart'}
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onToggleWishlist(product.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-colors ${
                  isWishlisted
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Heart className="h-3.5 w-3.5" />
                {isWishlisted ? 'Saved to Wishlist' : 'Save to Wishlist'}
              </button>
              <button
                type="button"
                onClick={() => onToggleCompare(product)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-colors ${
                  isCompared
                    ? 'border-[#0B1F3A] bg-slate-100 text-[#0B1F3A]'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {isCompared ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Scale className="h-3.5 w-3.5" />
                )}
                {isCompared ? 'In Comparison' : 'Compare Specs'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
