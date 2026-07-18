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
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="section-heading text-3xl mb-3">Your Cart</h1>
        <p className="text-theme-muted mb-6">Please login to view your cart</p>
        <Link href="/login" className="btn-primary">Login</Link>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="section-heading text-3xl mb-3">Your Cart</h1>
        <NoData message="Your cart is empty" description="Add some products to get started" />
        <Link href="/" className="btn-primary mt-4 inline-block">Shop Now</Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="section-heading text-3xl mb-6">Your Cart ({totalQty} items)</h1>
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Cart items */}
        <div className="lg:col-span-2 space-y-3">
          {cart.map((item) => {
            const p = item.productId;
            if (!p) return null;
            const disc = priceWithDiscount(p.price, p.discount);
            return (
              <div key={item._id} className="bg-[var(--color-surface)] border border-theme rounded-2xl p-4 flex gap-4 items-center">
                <Link href={`/product/${p._id}`} className="shrink-0">
                  <img src={p.image?.[0]} alt={p.name} className="h-20 w-20 rounded-xl object-cover" />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/product/${p._id}`} className="font-semibold text-sm line-clamp-2 hover:text-theme-primary">{p.name}</Link>
                  {p.unit && <p className="text-xs text-theme-muted mt-0.5">{p.unit}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-bold text-theme-primary text-sm">{displayPrice(disc, currency, rates)}</span>
                    {p.discount > 0 && <span className="text-xs text-theme-muted line-through">{displayPrice(p.price, currency, rates)}</span>}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-center gap-2">
                  <AddToCartButton product={p} />
                  <p className="text-xs text-theme-muted">Line: {displayPrice(disc * item.quantity, currency, rates)}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Order summary */}
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 h-fit sticky top-24">
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
          <button onClick={() => router.push("/checkout")} className="btn-primary w-full py-3 text-base">
            Proceed to Checkout
          </button>
        </div>
      </div>
    </div>
  );
}
