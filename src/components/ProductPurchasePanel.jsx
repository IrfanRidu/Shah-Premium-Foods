"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { FaShoppingCart } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { displayPrice, priceWithDiscount } from "@/lib/utils";
import { selectCampaignByProductIdMap } from "@/store/campaignSelectors";
import { useGlobalContext } from "@/providers/GlobalProvider";
import AddToCartButton from "./AddToCartButton";
import toast from "react-hot-toast";

// Extracted from the old (fully client-rendered) product/[product]/page.jsx.
// Everything here is genuinely personalized/interactive — currency-aware
// pricing, campaign discounts, cart state, buy-now — so it stays a client
// component, but now receives the already-fetched `product` as a prop
// instead of fetching it itself. Also carries the product-view activity
// logging that used to live directly in the page component (it depends on
// useGlobalContext(), a client-only hook, so it has to live in a client
// component somewhere — this is the natural place since it fires once per
// product-page visit, same as before).
export default function ProductPurchasePanel({ product }) {
  const router   = useRouter();
  const { logActivity, fetchCartItems } = useGlobalContext();
  const currency = useSelector((s) => s.currency.selected);
  const rates    = useSelector((s) => s.currency.rates);
  const cart     = useSelector((s) => s.cartItem.cart);
  const userId   = useSelector((s) => s.user._id);
  const campaignMap = useSelector(selectCampaignByProductIdMap);

  const [buying, setBuying] = useState(false);

  // Section 9 (Performance) note: this used to fire from a useEffect keyed
  // on the page's own client-side product fetch resolving. The fetch is
  // gone (product arrives server-rendered), so this now just fires once on
  // mount — same one-view-per-page-visit behavior as before.
  useEffect(() => {
    if (!product?._id) return;
    logActivity("view", { productId: product._id, categoryId: product.category?.[0]?._id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?._id]);

  const match = campaignMap.get(product._id?.toString());
  const activeCampaign = match?.campaign;
  const campaignEntry  = match?.entry;
  const campaignDiscount = campaignEntry?.specialDiscount || 0;
  const activeDiscount   = campaignDiscount || product.discount || 0;
  const discounted       = priceWithDiscount(product.price, activeDiscount);
  const isCampaign       = !!activeCampaign;

  const handleBuyNow = async () => {
    if (!userId) { toast.error("Please login first"); router.push("/login"); return; }
    try {
      setBuying(true);
      const cartItem = cart.find((i) => (i.productId?._id || i.productId) === product._id);
      if (!cartItem) {
        const r = await Axios({ ...api.addToCart, data: { productId: product._id } });
        if (r.data?.success) await fetchCartItems();
      }
      router.push("/checkout");
    } catch { toast.error("Failed to add to cart"); }
    finally { setBuying(false); }
  };

  return (
    <>
      {/* Price */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className={`text-3xl font-bold ${isCampaign ? "text-red-500" : "text-theme-primary"}`}>
          {displayPrice(discounted, currency, rates)}
        </span>
        {activeDiscount > 0 && <>
          <span className="text-lg text-theme-muted line-through">{displayPrice(product.price, currency, rates)}</span>
          <span className="badge">{activeDiscount}% off</span>
        </>}
      </div>

      {/* Stock info */}
      {product.stock === 0
        ? <span className="inline-block bg-red-100 text-red-600 text-xs font-semibold px-3 py-1 rounded-full">Out of Stock</span>
        : product.stock <= (product.lowStockThreshold || 10)
          ? <span className="inline-block bg-orange-100 text-orange-600 text-xs font-semibold px-3 py-1 rounded-full">Only {product.stock} left!</span>
          : <span className="inline-block bg-green-100 text-green-600 text-xs font-semibold px-3 py-1 rounded-full">In Stock</span>
      }

      {/* CTA buttons */}
      {product.stock > 0 && (
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[140px]"><AddToCartButton product={product} /></div>
          <button onClick={handleBuyNow} disabled={buying}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 btn-primary py-2 text-sm disabled:opacity-60">
            <FaShoppingCart size={14} />
            {buying ? "Adding…" : "Buy Now"}
          </button>
        </div>
      )}
    </>
  );
}
