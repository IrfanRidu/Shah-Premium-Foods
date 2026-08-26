"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError } from "@/lib/utils";
import { useGlobalContext } from "@/providers/GlobalProvider";

// Session 6 — extracted for WishlistDrawer.jsx, the 3rd place needing
// "add to cart if it isn't already there, then go straight to checkout"
// logic (ProductPurchasePanel.jsx and QuickView.jsx each already have
// their own inline copy of this exact same sequence). 3 call sites is
// where duplicating it a 4th time stops being the safer choice — this
// hook is a byte-for-byte port of ProductPurchasePanel's own
// `handleBuyNow`, not a rewrite, so behavior doesn't shift underneath
// either of the two places that already worked.
//
// Deliberately NOT retrofitted onto ProductPurchasePanel.jsx or
// QuickView.jsx — both are already correct and already verified working;
// refactoring already-correct code purely for DRY-ness carries real
// regression risk for zero behavior change, which isn't worth it right
// now. This hook exists for NEW call sites going forward, starting with
// WishlistDrawer.jsx.
//
// One hook instance = one in-flight "buying" state, so each product row
// that calls this independently gets its own `buying` flag rather than
// all rows sharing one (matters for WishlistDrawer, which renders one
// row per wishlist item and needs each row's Buy Now button to disable
// independently while ITS OWN request is in flight).
export function useBuyNow() {
  const router = useRouter();
  const userId = useSelector((s) => s.user._id);
  const cart = useSelector((s) => s.cartItem.cart);
  const { fetchCartItems } = useGlobalContext();
  const [buying, setBuying] = useState(false);

  const buyNow = async (product, qty = 1, { onDone } = {}) => {
    if (!userId) { toast.error("Please login first"); router.push("/login"); onDone?.(); return; }
    const cartItem = cart.find((i) => (i.productId?._id || i.productId) === product._id);
    try {
      setBuying(true);
      if (!cartItem) {
        const r = await Axios({ ...api.addToCart, data: { productId: product._id } });
        if (r.data?.success) {
          // Same "add then bump quantity" composition ProductPurchasePanel/
          // QuickView/AddToCartButton's own initialQty handling all use —
          // reusing the same already-existing endpoint, not a new code path.
          if (qty > 1 && r.data?.data?._id) {
            await Axios({ ...api.updateCartItemQty, data: { _id: r.data.data._id, qty } });
          }
          await fetchCartItems();
        }
      }
      // Already in the cart → proceed with whatever quantity is already
      // there (same reasoning ProductPurchasePanel's own comment gives).
      onDone?.();
      router.push("/checkout");
    } catch (err) { axiosToastError(err); }
    finally { setBuying(false); }
  };

  return { buying, buyNow };
}
