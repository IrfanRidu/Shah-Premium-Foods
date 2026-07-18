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

export default function AddToCartButton({ product }) {
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
        className="h-9 flex items-center justify-between gap-2 bg-theme-primary text-white rounded-full px-1.5 w-full">
        <button onClick={() => updateQty(cartItem.quantity - 1)} disabled={loading}
          className="h-6 w-6 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 disabled:opacity-50 shrink-0"
          aria-label="Decrease">
          <FaMinus size={10} />
        </button>
        <span className="text-sm font-bold">{cartItem.quantity}</span>
        <button onClick={() => updateQty(cartItem.quantity + 1)} disabled={loading}
          className="h-6 w-6 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 disabled:opacity-50 shrink-0"
          aria-label="Increase">
          <FaPlus size={10} />
        </button>
      </div>
    );
  }

  return (
    <button onClick={handleAdd} disabled={loading || product.stock === 0}
      className="btn-add-to-cart h-9 flex items-center justify-center">
      {product.stock === 0 ? "Out of Stock" : loading ? "Adding…" : "Add to cart"}
    </button>
  );
}
