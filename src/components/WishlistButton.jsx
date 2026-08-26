"use client";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import { FaHeart, FaRegHeart } from "react-icons/fa";
import toast from "react-hot-toast";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { addWishlistItem, removeWishlistItemByProductId } from "@/store/wishlistSlice";
import { axiosToastError } from "@/lib/utils";
import { useGlobalContext } from "@/providers/GlobalProvider";

// Shared by ProductCard.jsx (floating over the product image) and the PDP
// purchase panel (inline, next to Add to Cart) — one toggle button, one
// place the "is this already wishlisted" + API-call logic lives.
//
// Tracks its own optimistic state from what it just did on click, rather
// than trusting the API response's `data.wishlisted` field to always be
// present: a Demo Admin's toggle request is intercepted centrally (see
// apiHandler.js) and comes back as a generic simulated success that only
// echoes the request body, not this specific endpoint's `wishlisted`
// boolean — deriving the new state locally keeps the heart icon working
// identically in both real and demo-simulated cases, no special-casing
// needed here.
export default function WishlistButton({ productId, variant = "floating", size = 14, className = "" }) {
  const dispatch = useDispatch();
  const router = useRouter();
  const userId = useSelector((s) => s.user._id);
  const wishlistItems = useSelector((s) => s.wishlist.wishlistItems);
  const { logActivity } = useGlobalContext();
  const [pending, setPending] = useState(false);

  const isWishlisted = wishlistItems.some((w) => w.productId?._id === productId);

  const toggle = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!userId) {
      toast("Please log in to save items to your wishlist");
      router.push("/login");
      return;
    }
    if (pending) return;
    setPending(true);
    const wasWishlisted = isWishlisted;

    // Optimistic UI update
    if (wasWishlisted) dispatch(removeWishlistItemByProductId(productId));
    else dispatch(addWishlistItem({ _id: `optimistic-${productId}`, productId: { _id: productId } }));

    try {
      await Axios({ ...api.toggleWishlist, data: { productId } });
      toast.success(wasWishlisted ? "Removed from wishlist" : "Added to wishlist");
      // Session 8 (recommendation engine) — first real write path for
      // wishlist_add/wishlist_remove; the schema enum had a generic
      // `wishlist` value before this that no code anywhere ever actually
      // wrote (confirmed via grep). Split add vs. remove because they're
      // opposite-sign signals for preference purposes — logged only on
      // CONFIRMED success (after the API call, not the optimistic update
      // above), matching AddToCartButton.jsx's own same pattern, so a
      // failed/reverted toggle never gets counted as real signal. No
      // categoryId here — this component only receives a bare `productId`
      // prop, not the full product — acceptable since ActivityLogModel's
      // categoryId is optional by design; category-level affinity (Phase
      // 3+) can resolve it from productId at aggregation time instead of
      // requiring every event to carry a denormalized copy.
      logActivity?.(wasWishlisted ? "wishlist_remove" : "wishlist_add", { productId });
    } catch (err) {
      // Revert the optimistic update on a real failure
      if (wasWishlisted) dispatch(addWishlistItem({ _id: `optimistic-${productId}`, productId: { _id: productId } }));
      else dispatch(removeWishlistItemByProductId(productId));
      axiosToastError(err);
    } finally {
      setPending(false);
    }
  };

  const floatingClasses = "h-8 w-8 rounded-full flex items-center justify-center bg-white/90 backdrop-blur-sm shadow hover:scale-110 transition-transform disabled:opacity-50 disabled:hover:scale-100";
  const inlineClasses = "icon-btn";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={isWishlisted}
      className={`${variant === "floating" ? floatingClasses : inlineClasses} ${className}`}
    >
      {isWishlisted
        ? <FaHeart size={size} className="text-red-500" />
        : <FaRegHeart size={size} className={variant === "floating" ? "text-gray-500" : ""} />
      }
    </button>
  );
}
