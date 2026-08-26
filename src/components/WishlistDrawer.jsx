"use client";
import { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import Link from "next/link";
import { FaTimes, FaHeart, FaShoppingCart } from "react-icons/fa";
import { closeDrawer } from "@/store/uiSlice";
import { displayPrice, priceWithDiscount } from "@/lib/utils";
import { useGlobalContext } from "@/providers/GlobalProvider";
import { useBuyNow } from "@/hooks/useBuyNow";
import AddToCartButton from "./AddToCartButton";
import WishlistButton from "./WishlistButton";
import NoData from "./NoData";
import SafeImage from "./SafeImage";

// Session 6 (user-reported: "Add buy now button and it's function to the
// wishlist products") — one row per wishlist item, pulled out as its own
// component (rather than an inline .map() callback like before) so each
// row gets its OWN useBuyNow() call — and therefore its own independent
// `buying` state. Sharing one hook call across every row would mean
// clicking Buy Now on item #1 also visually disabled item #2's button
// while #1's request was in flight, which isn't what "add the function"
// should feel like with a list of several items.
function WishlistRow({ product: p, currency, rates, onClose }) {
  const disc = priceWithDiscount(p.price, p.discount);
  const { buying, buyNow } = useBuyNow();

  return (
    <div className="flex gap-3 pb-3 border-b border-theme last:border-0 last:pb-0">
      <Link href={`/product/${p._id}`} onClick={onClose} className="shrink-0">
        <SafeImage src={p.image?.[0]} alt={p.name} width={64} height={64} className="h-16 w-16 rounded-xl object-cover" />
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/product/${p._id}`} onClick={onClose} className="font-semibold text-sm line-clamp-2 hover:text-theme-primary">{p.name}</Link>
          <WishlistButton productId={p._id} variant="inline" size={14} className="border border-theme shrink-0" />
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="font-bold text-theme-primary text-sm">{displayPrice(disc, currency, rates)}</span>
          {p.discount > 0 && <span className="text-xs text-theme-muted line-through">{displayPrice(p.price, currency, rates)}</span>}
        </div>
        <div className="flex flex-col gap-1.5 mt-2">
          <AddToCartButton product={p} />
          {p.stock > 0 && (
            <button
              onClick={() => buyNow(p, 1, { onDone: onClose })}
              disabled={buying}
              className="w-full flex items-center justify-center gap-1.5 btn-primary py-1.5 text-xs disabled:opacity-60"
            >
              <FaShoppingCart size={11} />
              {buying ? "Adding…" : "Buy Now"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Session 5 — sibling of CartDrawer.jsx, same reasoning (see that file's
// header comment). The full /dashboard/wishlist page reuses ProductCard
// in a grid, which fits that page's width well but would be cramped at
// 2-per-row inside this drawer's ~416px — so this uses a single-column
// row layout instead (image / name+remove / price / add-to-cart /
// buy-now), matching the wishlist page's existing "reuses ProductCard's
// built-in heart to remove" reasoning: WishlistButton IS the remove
// control here, same component, same optimistic-toggle logic, no new
// removal code path.
// Session 6 (user-reported: "Add buy now button and it's function to the
// wishlist products"): Buy Now added per row via the new shared
// useBuyNow() hook (see that file). Scoped to this drawer specifically,
// not the full /dashboard/wishlist page — that page uses the site-wide
// generic ProductCard.jsx tile, the same component every other product
// grid uses, and none of those have Buy Now either; adding it there
// would ripple across every listing page site-wide, a much bigger change
// than what was reported here.
export default function WishlistDrawer() {
  const dispatch = useDispatch();
  const activeDrawer = useSelector((s) => s.ui.activeDrawer);
  const wishlistItems = useSelector((s) => s.wishlist.wishlistItems);
  const userId = useSelector((s) => s.user._id);
  const currency = useSelector((s) => s.currency.selected);
  const rates = useSelector((s) => s.currency.rates);
  const { fetchWishlist } = useGlobalContext();
  const [loading, setLoading] = useState(false);
  const isOpen = activeDrawer === "wishlist";

  // Session 7 — same closing-animation reasoning as CartDrawer.jsx (see
  // that file's comment for the full explanation): `rendered` keeps this
  // mounted through the CSS exit animation instead of vanishing the
  // instant Redux flips closed; `onAnimationEnd` (not a setTimeout) is
  // what actually unmounts once the animation genuinely finishes.
  const [rendered, setRendered] = useState(isOpen);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (isOpen) { setRendered(true); setClosing(false); }
    else if (rendered) { setClosing(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handlePanelAnimationEnd = () => {
    if (closing) { setRendered(false); setClosing(false); }
  };

  useEffect(() => {
    if (!rendered) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [rendered]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === "Escape") dispatch(closeDrawer()); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, dispatch]);

  // Same "pull the freshest copy on open" reasoning as the full wishlist
  // page — the boot-time fetch could be stale by the time someone opens
  // this. Only fires while the drawer is actually open, not on every
  // store subscription change.
  useEffect(() => {
    if (!isOpen || !userId) return;
    (async () => { setLoading(true); await fetchWishlist(); setLoading(false); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId]);

  if (!rendered) return null;

  const close = () => dispatch(closeDrawer());
  const products = wishlistItems.map((item) => item.productId).filter(Boolean);

  return (
    <div className={`drawer-overlay ${closing ? "drawer-overlay-closing" : ""}`} onClick={close}>
      <div
        className={`drawer-panel ${closing ? "drawer-panel-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={handlePanelAnimationEnd}
        role="dialog" aria-modal="true" aria-label="Wishlist"
      >
        <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-theme shrink-0">
          <h2 className="font-display text-lg font-bold flex items-center gap-2">
            <FaHeart className="text-red-500" size={17} /> Your Wishlist
          </h2>
          <button onClick={close} aria-label="Close" className="h-9 w-9 flex items-center justify-center rounded-lg active:bg-[var(--color-border)] transition-colors">
            <FaTimes size={16} />
          </button>
        </div>

        {!userId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-theme-muted">Please login to view your wishlist</p>
            <Link href="/login" onClick={close} className="btn-primary">Login</Link>
          </div>
        ) : loading ? (
          <div className="flex-1 px-4 sm:px-5 py-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="h-16 w-16 rounded-xl skeleton shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="skeleton h-3 w-3/4" />
                  <div className="skeleton h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <NoData message="Your wishlist is empty" description="Tap the heart icon on any product to save it here." />
            <Link href="/" onClick={close} className="btn-primary">Shop Now</Link>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3">
            {products.map((p) => (
              <WishlistRow key={p._id} product={p} currency={currency} rates={rates} onClose={close} />
            ))}
          </div>
        )}

        {userId && products.length > 0 && (
          <div className="border-t border-theme p-4 sm:p-5 shrink-0">
            <Link href="/dashboard/wishlist" onClick={close} className="block text-center text-sm text-theme-muted hover:text-theme-primary transition-colors">
              View full wishlist page
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
