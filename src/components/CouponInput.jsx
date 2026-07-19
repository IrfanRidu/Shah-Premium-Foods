"use client";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { FaTag, FaTimes, FaCheck } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { setAppliedCoupon, clearAppliedCoupon } from "@/store/couponSlice";
import { displayPrice, priceWithDiscount } from "@/lib/utils";
import toast from "react-hot-toast";

export default function CouponInput({ orderAmount }) {
  const dispatch      = useDispatch();
  const applied       = useSelector((s) => s.coupon.appliedCoupon);
  const discount      = useSelector((s) => s.coupon.discount);
  const userId        = useSelector((s) => s.user._id);
  const cart           = useSelector((s) => s.cartItem.cart);
  const currency       = useSelector((s) => s.currency.selected);
  const rates          = useSelector((s) => s.currency.rates);

  const [code,    setCode]    = useState(applied?.code || "");
  const [loading, setLoading] = useState(false);

  // Item 1/3: coupons can now be scoped to specific products by the admin,
  // so the server needs to see what's actually in the cart (not just a
  // total) to work out which lines qualify and compute the right discount.
  const buildCartItems = () =>
    cart
      .filter((i) => i.productId)
      .map((i) => ({
        productId: i.productId._id || i.productId,
        price: priceWithDiscount(i.productId.price, i.productId.discount),
        quantity: i.quantity,
      }));

  const apply = async (codeOverride) => {
    const c = (codeOverride || code).trim();
    if (!c) return;
    try {
      setLoading(true);
      const r = await Axios({
        ...api.validateCoupon,
        data: { code: c.toUpperCase(), orderAmount, userId, items: buildCartItems() },
      });
      if (r.data?.success) {
        dispatch(setAppliedCoupon(r.data.data));
        toast.success(r.data.message || "Coupon applied!");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Invalid coupon");
    } finally {
      setLoading(false);
    }
  };

  const remove = () => {
    setCode("");
    dispatch(clearAppliedCoupon());
    toast.success("Coupon removed");
  };

  return (
    <div className="space-y-3">
      {/* Input row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <FaTag className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted text-sm" />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
            placeholder="Enter coupon code"
            disabled={!!applied}
            className="input-field pl-9 pr-4 uppercase tracking-wider disabled:opacity-60"
          />
        </div>
        {applied ? (
          <button onClick={remove} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold bg-red-50 text-red-500 border border-red-200 hover:bg-red-100 transition-colors">
            <FaTimes size={12} /> Remove
          </button>
        ) : (
          <button onClick={() => apply()} disabled={loading || !code.trim()} className="btn-primary px-5 py-2 text-sm disabled:opacity-60">
            {loading ? "…" : "Apply"}
          </button>
        )}
      </div>

      {/* Applied confirmation */}
      {applied && discount > 0 && (
        <div className="flex items-center gap-2 text-green-600 bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-sm font-medium">
          <FaCheck size={12} />
          <span>"{applied.code}" applied — saving {displayPrice(discount, currency, rates)}</span>
        </div>
      )}
    </div>
  );
}
