"use client";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { FaMinus, FaPlus } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError } from "@/lib/utils";
import { updateCartItemQty, removeCartItem } from "@/store/cartSlice";
import { useGlobalContext } from "@/providers/GlobalProvider";
import toast from "react-hot-toast";

export default function AddToCartButton({ product, initialQty = 1 }) {
  const dispatch  = useDispatch();
  const cart      = useSelector((s) => s.cartItem.cart);
  const userId    = useSelector((s) => s.user._id);
  const { fetchCartItems, logActivity } = useGlobalContext();
  const [loading, setLoading] = useState(false);

  const cartItem = cart.find((i) => (i.productId?._id || i.productId) === product._id);

  const handleAdd = async (e) => {
    e?.stopPropagation();
    if (!userId) { toast.error("Please login to add items to cart"); return; }
    try {
      setLoading(true);
      const r = await Axios({ ...api.addToCart, data: { productId: product._id } });
      if (r.data?.success) {
        // Session 4 (Luxury PDP redesign) — pre-add quantity selector.
        // addToCartItemController always creates the row at quantity:1
        // (existing, unmodified, checkout-adjacent business logic —
        // deliberately not touched here). A caller that wants more than
        // 1 right away (ProductPurchasePanel's new quantity stepper)
        // composes around that with a second call to the SAME
        // already-existing, already-proven update-quantity endpoint the
        // stepper below already uses for +/- — not a new code path,
        // just this one reused twice. Every OTHER caller of this button
        // (ProductCard's quick-add, etc.) never passes initialQty, so
        // this block simply never runs for them — fully backward
        // compatible, zero behavior change for existing callers.
        if (initialQty > 1 && r.data?.data?._id) {
          await Axios({ ...api.updateCartItemQty, data: { _id: r.data.data._id, qty: initialQty } });
        }
        toast.success("Added to cart");
        await fetchCartItems();
        // Track this for the recommendation engine
        logActivity?.("add_to_cart", { productId: product._id, categoryId: product.category?.[0]?._id || product.category?.[0] });
      }
    } catch (err) { axiosToastError(err); }
    finally { setLoading(false); }
  };

  const updateQty = async (newQty) => {
    if (!cartItem) return;
    try {
      setLoading(true);
      if (newQty <= 0) {
        await Axios({ ...api.deleteCartItem, data: { _id: cartItem._id } });
        dispatch(removeCartItem(cartItem._id));
        return;
      }
      const r = await Axios({ ...api.updateCartItemQty, data: { _id: cartItem._id, qty: newQty } });
      if (r.data?.success) dispatch(updateCartItemQty({ _id: cartItem._id, qty: newQty }));
    } catch (err) { axiosToastError(err); }
    finally { setLoading(false); }
  };

  if (cartItem) {
    return (
      <div onClick={(e) => e.stopPropagation()}
        className="h-11 flex items-center justify-between gap-1.5 bg-theme-primary text-white rounded-full px-1.5 w-full">
        {/* Mobile UI pass: stepper buttons grew from 24px to 36px — the
            largest they can go while still fitting three elements (both
            buttons + the quantity digit) in a pill that also has to fit
            inside a narrow product-card grid column at 320px. The 44px
            standard is met by the outer pill's height and by every other
            button on the site; this specific dense inline control is the
            one deliberate, documented exception, traded for staying
            legible at the card-grid's actual available width. */}
        <button onClick={() => updateQty(cartItem.quantity - 1)} disabled={loading}
          className="h-9 w-9 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30 disabled:opacity-50 shrink-0"
          aria-label="Decrease quantity">
          <FaMinus size={11} />
        </button>
        <span className="text-sm font-bold min-w-[1.25rem] text-center" aria-live="polite">{cartItem.quantity}</span>
        <button onClick={() => updateQty(cartItem.quantity + 1)} disabled={loading}
          className="h-9 w-9 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30 disabled:opacity-50 shrink-0"
          aria-label="Increase quantity">
          <FaPlus size={11} />
        </button>
      </div>
    );
  }

  return (
    <button onClick={handleAdd} disabled={loading || product.stock === 0}
      className="btn-add-to-cart h-11 flex items-center justify-center">
      {product.stock === 0 ? "Out of Stock" : loading ? "Adding…" : "Add to cart"}
    </button>
  );
}
