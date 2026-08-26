"use client";
import { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FaTimes } from "react-icons/fa";
import { closeDrawer } from "@/store/uiSlice";
import { displayPrice, priceWithDiscount } from "@/lib/utils";
import AddToCartButton from "./AddToCartButton";
import CouponInput from "./CouponInput";
import NoData from "./NoData";
import SafeImage from "./SafeImage";

// Session 5 (user-reported: "the cart and wishlist should appear with a
// slide from the right side so that user can perform all the functions of
// cart and wishlist page without navigating away"). Mirrors cart/page.jsx
// closely on purpose — same totals math, same CouponInput, same
// AddToCartButton per line (already fully wired to the real cart/API, so
// this is pure composition, no new business logic) — just re-flowed into
// a single-column drawer layout (header / scrollable item list / sticky
// footer with summary+checkout) instead of the full page's 2-column
// layout, which wouldn't fit the drawer's ~416px max width. The full
// /cart page is left working, unchanged, for direct/bookmarked links —
// this is an additional, faster path to the same functionality, not a
// replacement for it (see the "View full cart page" link in the footer).
export default function CartDrawer() {
  const dispatch = useDispatch();
  const router = useRouter();
  const activeDrawer = useSelector((s) => s.ui.activeDrawer);
  const cart = useSelector((s) => s.cartItem.cart);
  const userId = useSelector((s) => s.user._id);
  const currency = useSelector((s) => s.currency.selected);
  const rates = useSelector((s) => s.currency.rates);
  const discount = useSelector((s) => s.coupon.discount);
  const isOpen = activeDrawer === "cart";

  // Session 7 (user-reported: "appearing so fast without any smooth
  // sliding animation" — fixed the ENTRANCE timing in globals.css, but a
  // drawer that slides in smoothly and then instantly vanishes on close
  // would itself feel inconsistent with "smooth"). `rendered` controls
  // whether this component's JSX exists at all; `closing` controls which
  // animation class it wears while `rendered` is still true. Redux going
  // isOpen:true→false doesn't unmount immediately anymore — it flips
  // `closing` on, the CSS exit animation plays, and `onAnimationEnd`
  // below (not a setTimeout guessing the CSS duration — that's a classic
  // way for JS and CSS timings to silently drift apart the next time
  // either one changes) is what actually unmounts once the animation
  // genuinely finishes.
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

  // Lock background scroll while the drawer is open OR closing — kept on
  // `rendered` (true for the whole open+closing window), not `isOpen`
  // (true only while fully open): releasing the lock the instant close
  // is triggered would let the page start scrolling underneath while the
  // panel is still visibly sliding away, which would look broken rather
  // than smooth. No existing modal in this codebase does this (checked:
  // QuickView, InvoiceModal, the mobile nav drawer all leave the page
  // scrollable underneath), but a right-side panel meant to stand in for
  // a whole page benefits from it more than a small centered modal does,
  // so it's added here rather than retrofitted onto the older, lower
  // -risk-to-leave-alone modals.
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

  if (!rendered) return null;

  const close = () => dispatch(closeDrawer());
  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
  const totalAmt = cart.reduce((s, i) => {
    const p = i.productId;
    if (!p) return s;
    return s + priceWithDiscount(p.price, p.discount) * i.quantity;
  }, 0);
  const grandTotal = Math.max(0, totalAmt - discount);

  const goCheckout = () => { close(); router.push("/checkout"); };

  return (
    <div className={`drawer-overlay ${closing ? "drawer-overlay-closing" : ""}`} onClick={close}>
      <div
        className={`drawer-panel ${closing ? "drawer-panel-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={handlePanelAnimationEnd}
        role="dialog" aria-modal="true" aria-label="Cart"
      >
        <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-theme shrink-0">
          <h2 className="font-display text-lg font-bold">Your Cart{cart.length > 0 ? ` (${totalQty})` : ""}</h2>
          <button onClick={close} aria-label="Close" className="h-9 w-9 flex items-center justify-center rounded-lg active:bg-[var(--color-border)] transition-colors">
            <FaTimes size={16} />
          </button>
        </div>

        {!userId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-theme-muted">Please login to view your cart</p>
            <Link href="/login" onClick={close} className="btn-primary">Login</Link>
          </div>
        ) : cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <NoData message="Your cart is empty" description="Add some products to get started" />
            <Link href="/" onClick={close} className="btn-primary">Shop Now</Link>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3">
              {cart.map((item) => {
                const p = item.productId;
                if (!p) return null;
                const disc = priceWithDiscount(p.price, p.discount);
                return (
                  <div key={item._id} className="flex gap-3 pb-3 border-b border-theme last:border-0 last:pb-0">
                    <Link href={`/product/${p._id}`} onClick={close} className="shrink-0">
                      <SafeImage src={p.image?.[0]} alt={p.name} width={64} height={64} className="h-16 w-16 rounded-xl object-cover" />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link href={`/product/${p._id}`} onClick={close} className="font-semibold text-sm line-clamp-2 hover:text-theme-primary">{p.name}</Link>
                      {p.unit && <p className="text-xs text-theme-muted mt-0.5">{p.unit}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-bold text-theme-primary text-sm">{displayPrice(disc, currency, rates)}</span>
                        {p.discount > 0 && <span className="text-xs text-theme-muted line-through">{displayPrice(p.price, currency, rates)}</span>}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <div className="w-28"><AddToCartButton product={p} /></div>
                        <p className="text-xs text-theme-muted shrink-0">{displayPrice(disc * item.quantity, currency, rates)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-theme p-4 sm:p-5 space-y-3 shrink-0">
              <CouponInput orderAmount={totalAmt} />
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-theme-muted">Subtotal ({totalQty} items)</span><span>{displayPrice(totalAmt, currency, rates)}</span></div>
                {discount > 0 && (
                  <div className="flex justify-between text-green-600 font-semibold">
                    <span>Coupon discount</span><span>- {displayPrice(discount, currency, rates)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-1.5 border-t border-theme">
                  <span>Total</span><span className="text-theme-primary">{displayPrice(grandTotal, currency, rates)}</span>
                </div>
              </div>
              <button onClick={goCheckout} className="btn-primary w-full py-3">Proceed to Checkout</button>
              <Link href="/cart" onClick={close} className="block text-center text-sm text-theme-muted hover:text-theme-primary transition-colors">
                View full cart page
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
