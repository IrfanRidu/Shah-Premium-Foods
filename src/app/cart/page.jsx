"use client";
import { useSelector } from "react-redux";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { displayPrice, priceWithDiscount } from "@/lib/utils";
import AddToCartButton from "@/components/AddToCartButton";
import NoData from "@/components/NoData";
import CouponInput from "@/components/CouponInput";
import SafeImage from "@/components/SafeImage";

export default function CartPage() {
  const cart     = useSelector((s) => s.cartItem.cart);
  const userId   = useSelector((s) => s.user._id);
  const currency = useSelector((s) => s.currency.selected);
  const rates    = useSelector((s) => s.currency.rates);
  const discount = useSelector((s) => s.coupon.discount);
  const router   = useRouter();

  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
  const totalAmt = cart.reduce((s, i) => {
    const p = i.productId;
    if (!p) return s;
    return s + priceWithDiscount(p.price, p.discount) * i.quantity;
  }, 0);
  const grandTotal = Math.max(0, totalAmt - discount);

  if (!userId) {
    return (
      <div className="container mx-auto px-3 sm:px-4 py-10 lg:py-20 text-center">
        <h1 className="section-heading text-2xl sm:text-3xl mb-3">Your Cart</h1>
        <p className="text-theme-muted mb-6">Please login to view your cart</p>
        <Link href="/login" className="btn-primary">Login</Link>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="container mx-auto px-3 sm:px-4 py-4 lg:py-8 text-center">
        <h1 className="section-heading text-2xl sm:text-3xl mb-3">Your Cart</h1>
        <NoData message="Your cart is empty" description="Add some products to get started" />
        <Link href="/" className="btn-primary mt-4 inline-block">Shop Now</Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 lg:py-8 pb-28 lg:pb-8">
      <h1 className="section-heading text-2xl sm:text-3xl mb-4 sm:mb-6">Your Cart ({totalQty} items)</h1>
      <div className="grid lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Cart items */}
        <div className="lg:col-span-2 space-y-3">
          {cart.map((item) => {
            const p = item.productId;
            if (!p) return null;
            const disc = priceWithDiscount(p.price, p.discount);
            return (
              <div key={item._id} className="bg-[var(--color-surface)] border border-theme rounded-2xl p-3 sm:p-4">
                {/* Mobile UI pass: this used to be one 3-column row (image +
                    text + button-column) — at a 320px viewport that left
                    the text column only ~36px wide once the image and the
                    button/line-total column both took their share, which
                    would make the product name nearly unreadable even
                    though flex's min-w-0 kept it from actually overflowing
                    the page. Restructured so the quantity controls sit in
                    their own full-width row below the text on mobile
                    (plenty of room for both the name and the stepper),
                    reverting to the original single-row layout from sm:
                    up where there's enough width for it to work well. */}
                <div className="flex gap-3 sm:gap-4 sm:items-center">
                  <Link href={`/product/${p._id}`} className="shrink-0">
                    <SafeImage src={p.image?.[0]} alt={p.name} width={80} height={80} className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl object-cover" />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link href={`/product/${p._id}`} className="font-semibold text-[13px] sm:text-sm line-clamp-2 hover:text-theme-primary">{p.name}</Link>
                    {p.unit && <p className="text-[11px] sm:text-xs text-theme-muted mt-0.5">{p.unit}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-bold text-theme-primary text-[13px] sm:text-sm">{displayPrice(disc, currency, rates)}</span>
                      {p.discount > 0 && <span className="text-[11px] sm:text-xs text-theme-muted line-through">{displayPrice(p.price, currency, rates)}</span>}
                    </div>
                    {/* Mobile-only controls row — full width, own line */}
                    <div className="flex items-center justify-between gap-3 mt-2.5 sm:hidden">
                      <div className="w-32"><AddToCartButton product={p} /></div>
                      <p className="text-[11px] text-theme-muted shrink-0">Line: {displayPrice(disc * item.quantity, currency, rates)}</p>
                    </div>
                  </div>
                  {/* sm+ only — original inline 3rd column, where there's room for it */}
                  <div className="hidden sm:flex shrink-0 flex-col items-center gap-2 w-28">
                    <AddToCartButton product={p} />
                    <p className="text-xs text-theme-muted">Line: {displayPrice(disc * item.quantity, currency, rates)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Order summary — sticky only from lg: up, where a real 2-column
            layout with a taller left column makes sticky meaningful. On
            mobile this stacks normally; the sticky CHECKOUT BUTTON below
            (a fixed bottom bar) is what covers "keep checkout reachable
            while scrolling" on small screens instead. */}
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-4 sm:p-5 h-fit lg:sticky lg:top-24">
          <h2 className="font-display text-lg font-semibold mb-4">Order Summary</h2>
          <div className="space-y-2 text-sm mb-4">
            <div className="flex justify-between"><span className="text-theme-muted">Subtotal ({totalQty} items)</span><span>{displayPrice(totalAmt, currency, rates)}</span></div>
            {discount > 0 && (
              <div className="flex justify-between text-green-600 font-semibold">
                <span>Coupon discount</span><span>- {displayPrice(discount, currency, rates)}</span>
              </div>
            )}
          </div>

          {/* Coupon entry lives here (not on the checkout page — see CouponInput
              for the "view available coupons" list this pulls from) */}
          <div className="mb-4 pb-4 border-b border-theme">
            <CouponInput orderAmount={totalAmt} />
          </div>

          <div className="pt-1 mb-4 flex justify-between font-bold text-lg">
            <span>Total</span><span className="text-theme-primary">{displayPrice(grandTotal, currency, rates)}</span>
          </div>
          <p className="text-xs text-theme-muted mb-4 -mt-3">Delivery charge (if any) is calculated at checkout based on your address.</p>
          {/* Hidden on mobile — the fixed bottom bar below is the mobile
              checkout action, so this would otherwise be a redundant
              second "Proceed to Checkout" button one scroll away from it. */}
          <button onClick={() => router.push("/checkout")} className="hidden lg:block btn-primary w-full py-3 text-base">
            Proceed to Checkout
          </button>
        </div>
      </div>

      {/* Mobile sticky checkout bar — requirement: "Sticky checkout button".
          Fixed to the viewport bottom so it's reachable with one thumb
          regardless of scroll position; the page's own pb-28 above keeps
          the last cart item / order summary from ending up hidden behind
          it. Not shown at lg: up, where the in-summary button (above) is
          already always visible without scrolling past it. */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--color-header-bg)] border-t border-theme px-3 py-2.5 flex items-center gap-3"
        style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-theme-muted leading-tight">Total</p>
          <p className="font-bold text-theme-primary text-base leading-tight truncate">{displayPrice(grandTotal, currency, rates)}</p>
        </div>
        <button onClick={() => router.push("/checkout")} className="btn-primary px-6 shrink-0">
          Checkout
        </button>
      </div>
    </div>
  );
}
