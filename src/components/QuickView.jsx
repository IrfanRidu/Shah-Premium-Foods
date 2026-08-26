"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { FaTimes, FaMinus, FaPlus, FaShoppingCart } from "react-icons/fa";
import ProductGallery from "./ProductGallery";
import AddToCartButton from "./AddToCartButton";
import WishlistButton from "./WishlistButton";
import ReturnsQualityInfo from "./ReturnsQualityInfo";
import StarRating from "./StarRating";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { displayPrice, priceWithDiscount, validURLConvert, axiosToastError } from "@/lib/utils";
import { selectCampaignByProductIdMap } from "@/store/campaignSelectors";
import { useGlobalContext } from "@/providers/GlobalProvider";
import toast from "react-hot-toast";

// Session 4 (Luxury redesign) — Quick View modal, opened from
// ProductCard without leaving the current grid/listing page. Follows
// the exact `.modal-overlay` / `.modal-box` pattern InvoiceModal.jsx
// already established (overlay-click + explicit close button), plus an
// Escape-key handler (a real accessibility gap in that existing
// pattern — added here rather than left unaddressed, since the brief
// explicitly calls for keyboard navigation throughout).
//
// Phase 8 (user-reported, real bug): rendered via createPortal into
// document.body rather than in place. `.product-card`'s own CSS (see
// globals.css) sets `backdrop-filter` unconditionally and `transform`
// on hover — per spec, EITHER property makes that element the
// containing block for any `position: fixed` descendant instead of the
// viewport. Since this modal was being mounted as a DOM child of the
// card that opened it, `.modal-overlay`'s `position: fixed; inset: 0`
// was being constrained to the CARD's own small bounding box instead of
// covering the screen — exactly what the reported screenshot showed
// (modal content squeezed into card width). This is the standard React
// fix for exactly this class of problem: portal the modal to
// document.body so its position is never affected by ANY ancestor's
// CSS, regardless of what that ancestor does. `mounted` guards the
// portal itself — `document` doesn't exist during server rendering, so
// the portal only renders after this component has actually mounted in
// the browser.
//
// Reuses ProductGallery as-is — genuinely safe, nothing in it assumes
// it's the only instance mounted on the page. Deliberately does NOT
// reuse the full ProductPurchasePanel: tracing through what that
// component actually renders (not just assuming it's safe because it
// "does the purchase panel job") showed it renders its OWN viewport
// -level `fixed bottom-0` mobile action bar — correct for a real page,
// but it would break out of this modal and stick to the actual screen
// bottom on mobile, behind/underneath the modal itself. This builds a
// compact, modal-scoped purchase row instead, from the same lower
// -level pieces (AddToCartButton, WishlistButton, the same price/
// discount helpers) ProductPurchasePanel itself is built from.
//
// Session 5 (user-reported, with screenshot of the full PDP): "Quick
// View should display all the information given in the [PDP] except
// the delivery section, so a user can add to cart, modify quantity,
// buy directly, and see all necessary product info/specs without
// navigating to the product details page." Expanded to match the PDP's
// info column field-for-field — category badges, SKU, stock badge, a
// pre-add quantity stepper, Buy Now, the FULL (not line-clamped)
// description, the Specifications list, and Returns+Quality Assurance
// (via the shared ReturnsQualityInfo.jsx also used by DeliveryInfo.jsx
// — same copy, one source). Delivery is deliberately excluded, per the
// user's own explicit instruction. The quantity stepper + handleBuyNow
// below are a small, deliberate duplication of ProductPurchasePanel's
// same logic rather than a shared hook: it's ~15 lines, has exactly 2
// call sites, and keeping QuickView fully self-contained matches this
// file's own established reasoning above for not reusing that panel
// wholesale in the first place. Unlike ProductPurchasePanel's own
// stepper (hidden below lg: because the PDP has a separate mobile
// sticky bar instead), QuickView has no alternate mobile layout — the
// modal IS the only UI here at every width — so nothing here is
// viewport-gated.
export default function QuickView({ product, onClose }) {
  const router = useRouter();
  const currency = useSelector((s) => s.currency.selected);
  const rates = useSelector((s) => s.currency.rates);
  const campaignMap = useSelector(selectCampaignByProductIdMap);
  const cart = useSelector((s) => s.cartItem.cart);
  const userId = useSelector((s) => s.user._id);
  const { fetchCartItems } = useGlobalContext();
  const [mounted, setMounted] = useState(false);
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!product || !mounted) return null;

  const match = campaignMap.get(product._id?.toString());
  const activeCampaign = match?.campaign;
  const campaignDiscount = match?.entry?.specialDiscount || 0;
  const activeDiscount = campaignDiscount || product.discount || 0;
  const discounted = priceWithDiscount(product.price, activeDiscount);
  const cartItem = cart.find((i) => (i.productId?._id || i.productId) === product._id);
  const maxQty = Math.max(1, product.stock || 1);

  const handleBuyNow = async () => {
    if (!userId) { toast.error("Please login first"); router.push("/login"); onClose(); return; }
    try {
      setBuying(true);
      if (!cartItem) {
        const r = await Axios({ ...api.addToCart, data: { productId: product._id } });
        if (r.data?.success) {
          if (qty > 1 && r.data?.data?._id) {
            await Axios({ ...api.updateCartItemQty, data: { _id: r.data.data._id, qty } });
          }
          await fetchCartItems();
        }
      }
      onClose();
      router.push("/checkout");
    } catch (err) { axiosToastError(err); }
    finally { setBuying(false); }
  };

  return createPortal(
    <div
      className="modal-overlay"
      onClick={(e) => {
        // Session 4 note: unlike InvoiceModal.jsx (this app's other user of
        // .modal-overlay), this component can be mounted INSIDE another
        // element that has its own onClick (ProductCard's whole-card
        // "navigate to product" handler) — without stopPropagation here, a
        // backdrop click to close this modal would also bubble up and
        // trigger that ancestor's click handler. Stopping it explicitly
        // makes this safe to embed anywhere, not just contexts that
        // happen not to have a clickable ancestor.
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="modal-box max-w-3xl lg:max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-theme-muted">Quick View</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-9 w-9 flex items-center justify-center rounded-lg active:bg-[var(--color-border)] transition-colors"
          >
            <FaTimes size={16} />
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-5 lg:gap-8 sm:items-start">
          <ProductGallery images={product.image || []} productId={product._id} productName={product.name} />

          <div className="space-y-3.5 min-w-0">
            {product.category?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {product.category.map((c) => <span key={c._id} className="badge">{c.name}</span>)}
              </div>
            )}

            <h2 className="font-display text-lg sm:text-xl font-bold leading-snug">{product.name}</h2>

            {typeof product.rating === "number" && product.rating > 0 && (
              <div className="flex items-center gap-1.5">
                <StarRating value={product.rating} size={13} />
                <span className="text-xs text-theme-muted">({product.numReviews})</span>
              </div>
            )}

            {product.unit && <p className="text-sm text-theme-muted">Unit: {product.unit}</p>}
            {product.sku && <p className="text-xs text-theme-muted font-mono">SKU: {product.sku}</p>}

            <div className="flex items-baseline gap-2 flex-wrap pt-1">
              <span className={`text-2xl font-bold ${activeCampaign ? "text-red-500" : "text-theme-primary"}`}>
                {displayPrice(discounted, currency, rates)}
              </span>
              {activeDiscount > 0 && (
                <>
                  <span className="text-sm text-theme-muted line-through">{displayPrice(product.price, currency, rates)}</span>
                  <span className="badge">{activeDiscount}% off</span>
                </>
              )}
            </div>

            {product.stock === 0
              ? <span className="badge-danger">Out of Stock</span>
              : product.stock <= (product.lowStockThreshold || 10)
                ? <span className="badge-warning">Only {product.stock} left!</span>
                : <span className="badge-success">In Stock</span>
            }

            {/* Quantity + Wishlist share a row, same layout ProductPurchasePanel
                settled on (see that file's Phase 11 comment) after a side-by-side
                CTA row proved too cramped in a similarly narrow column — this
                modal's info column is at least as narrow, so the same fix applies
                here from the start rather than re-discovering it. */}
            {product.stock > 0 && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-3">
                  {!cartItem && (
                    <>
                      <span className="text-sm font-medium text-theme-muted">Quantity</span>
                      <div className="inline-flex items-center border border-theme rounded-full">
                        <button
                          type="button"
                          onClick={() => setQty((q) => Math.max(1, q - 1))}
                          disabled={qty <= 1}
                          className="h-9 w-9 flex items-center justify-center disabled:opacity-40 transition-opacity"
                          aria-label="Decrease quantity"
                        >
                          <FaMinus size={11} />
                        </button>
                        <span className="w-8 text-center text-sm font-semibold" aria-live="polite">{qty}</span>
                        <button
                          type="button"
                          onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                          disabled={qty >= maxQty}
                          className="h-9 w-9 flex items-center justify-center disabled:opacity-40 transition-opacity"
                          aria-label="Increase quantity"
                        >
                          <FaPlus size={11} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <WishlistButton productId={product._id} variant="inline" size={16} className="border border-theme shrink-0" />
              </div>
            )}

            <div className="flex flex-col gap-2.5 pt-1">
              <AddToCartButton product={product} initialQty={qty} />
              {product.stock > 0 && (
                <button
                  onClick={handleBuyNow}
                  disabled={buying}
                  className="w-full flex items-center justify-center gap-2 btn-primary py-2.5 text-sm disabled:opacity-60"
                >
                  <FaShoppingCart size={14} />
                  {buying ? "Adding…" : "Buy Now"}
                </button>
              )}
            </div>

            {product.description && (
              <div className="border-t border-theme pt-3.5">
                <h3 className="font-semibold text-sm mb-1.5">Description</h3>
                <p className="text-sm text-theme-muted leading-relaxed whitespace-pre-line">{product.description}</p>
              </div>
            )}

            {(product.category?.length > 0 ||
              product.subCategory?.length > 0 ||
              Object.keys(product.more_details || {}).length > 0) && (
              <div className="border-t border-theme pt-3.5">
                <h3 className="font-semibold text-sm mb-2">Specifications</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {product.category?.length > 0 && (
                    <div>
                      <dt className="text-theme-muted text-xs">Category</dt>
                      <dd className="font-medium">{product.category.map((c) => c.name).filter(Boolean).join(", ")}</dd>
                    </div>
                  )}
                  {product.subCategory?.length > 0 && (
                    <div>
                      <dt className="text-theme-muted text-xs">Sub-category</dt>
                      <dd className="font-medium">{product.subCategory.map((c) => c.name).filter(Boolean).join(", ")}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-theme-muted text-xs">Availability</dt>
                    <dd className="font-medium">{product.stock > 0 ? "In Stock" : "Out of Stock"}</dd>
                  </div>
                  {Object.entries(product.more_details || {}).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-theme-muted text-xs capitalize">{k}</dt>
                      <dd className="font-medium">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* Returns + Quality Assurance — Delivery deliberately excluded
                per the user's own explicit instruction. Shared copy/markup
                with DeliveryInfo.jsx via ReturnsQualityInfo.jsx, so the two
                surfaces can never drift out of sync with each other. */}
            <div className="border-t border-theme divide-y divide-[var(--color-border)]">
              <ReturnsQualityInfo variant="compact" />
            </div>

            <Link
              href={`/product/${validURLConvert(product.name, product._id)}`}
              onClick={onClose}
              className="inline-block text-sm font-semibold text-theme-primary hover:underline pt-1"
            >
              View full details →
            </Link>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
