"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { FaShoppingCart, FaMinus, FaPlus } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { displayPrice, priceWithDiscount, axiosToastError } from "@/lib/utils";
import { selectCampaignByProductIdMap } from "@/store/campaignSelectors";
import { useGlobalContext } from "@/providers/GlobalProvider";
import AddToCartButton from "./AddToCartButton";
import WishlistButton from "./WishlistButton";
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
  const cartItem = cart.find((i) => (i.productId?._id || i.productId) === product._id);

  // Session 4 (Luxury PDP redesign) — pre-add quantity selector. Local,
  // UI-only state: only meaningful BEFORE the product is in the cart —
  // once it's added, AddToCartButton's own existing +/- stepper (driven
  // by the real cart's `cartItem.quantity`) is the single source of
  // truth for quantity, and this selector hides itself (see JSX below)
  // rather than becoming a second, competing control for the same line.
  const [qty, setQty] = useState(1);
  const maxQty = Math.max(1, product.stock || 1);

  // Session 9 (Performance) note: this used to fire from a useEffect keyed
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
      if (!cartItem) {
        const r = await Axios({ ...api.addToCart, data: { productId: product._id } });
        if (r.data?.success) {
          // Same "add then bump quantity" composition as
          // AddToCartButton's own initialQty handling — reusing the
          // same already-existing endpoint, not a new code path.
          if (qty > 1 && r.data?.data?._id) {
            await Axios({ ...api.updateCartItemQty, data: { _id: r.data.data._id, qty } });
          }
          await fetchCartItems();
        }
      }
      // If it's already in the cart, its quantity is whatever
      // AddToCartButton's own stepper last set it to — Buy Now just
      // proceeds with that, no selector shown/relevant at that point.
      router.push("/checkout");
    } catch (err) { axiosToastError(err); }
    finally { setBuying(false); }
  };

  return (
    <>
      {/* Phase 12 (user-reported: "quantity button has no space with add
          to cart button") — real root cause, not a one-off gap: this
          component was returning a bare Fragment, so Price, Stock badge,
          the Quantity+Wishlist row, and the CTA-button stack were all
          flush Fragment siblings with ZERO deliberate spacing between
          any of them — this has been true since this component existed,
          it just wasn't very noticeable when the CTA row was a single
          flex-wrap line. It became obvious once Phase 11 split things
          into more distinct blocks (a standalone Quantity+Wishlist row,
          then a taller vertical button stack) that all needed consistent
          breathing room between them, which nothing was actually
          providing. Wrapped everything from Price through the CTA
          buttons in one `space-y-4` container so every top-level section
          gets the same, deliberate gap — not just the buttons within the
          CTA stack (which already had their own internal `gap-3` and
          looked fine relative to EACH OTHER, just not relative to what
          came before them). The mobile sticky bar stays OUTSIDE this
          wrapper, as its own Fragment sibling — it's `position: fixed`
          (removed from normal flow) and semantically a separate,
          independent piece of UI, not part of this in-flow spacing
          group. */}
      <div className="space-y-4">
      {/* Price */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className={`text-2xl sm:text-3xl font-bold ${isCampaign ? "text-red-500" : "text-theme-primary"}`}>
          {displayPrice(discounted, currency, rates)}
        </span>
        {activeDiscount > 0 && <>
          <span className="text-base sm:text-lg text-theme-muted line-through">{displayPrice(product.price, currency, rates)}</span>
          <span className="badge">{activeDiscount}% off</span>
        </>}
      </div>

      {/* Stock info — Session 4: was hardcoded bg-red-100/orange-100/
          green-100 + matching -600 text, all light-mode-only with no
          dark/ocean/festive-theme awareness (same class of gap as the
          dashboard STATUS_COLOR objects — see globals.css's badge
          -variant comment). Now uses the new theme-aware badge variants. */}
      {product.stock === 0
        ? <span className="badge-danger">Out of Stock</span>
        : product.stock <= (product.lowStockThreshold || 10)
          ? <span className="badge-warning">Only {product.stock} left!</span>
          : <span className="badge-success">In Stock</span>
      }

      {/* Quantity selector + Wishlist share a row (Phase 11, user-
          reported: Add to Cart / Buy Now "very close... almost
          overlapping", asked for "more free with proper spaces").
          Wishlist moved out of the CTA button row below, which no
          longer has room for it: this column became meaningfully
          narrower once Phase 9 split Purchase Panel + Delivery Info
          into 2 side-by-side columns — at the breakpoints where this
          renders, the column's actual usable width works out to
          roughly 185-250px (halved by the outer Gallery|Info grid,
          then halved again by that split), while the old row (2
          buttons at min-w-[140px] each + a wishlist icon) needed
          roughly 350px minimum to lay out on one line. flex-wrap
          technically prevented literal overlap, but the result was
          visibly cramped — this is the actual fix, not a breakpoint
          tweak I couldn't verify without a browser. Quantity only
          shows before the item's in cart (unchanged); Wishlist stays
          in the same row position either way so it doesn't jump
          around based on cart state. */}
      {product.stock > 0 && (
        <div className="hidden lg:flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {!cartItem && (
              <>
                <span className="text-sm font-medium text-theme-muted">Quantity</span>
                <div className="inline-flex items-center border border-theme rounded-full">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                    className="h-9 w-9 flex items-center justify-center disabled:opacity-40 transition-opacity"
                    aria-label="Decrease quantity"
                  >
                    <FaMinus size={11} />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold" aria-live="polite">{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                    disabled={qty >= maxQty}
                    className="h-9 w-9 flex items-center justify-center disabled:opacity-40 transition-opacity"
                    aria-label="Increase quantity"
                  >
                    <FaPlus size={11} />
                  </button>
                </div>
              </>
            )}
          </div>
          <WishlistButton productId={product._id} variant="inline" size={16} className="border border-theme shrink-0" />
        </div>
      )}

      {/* CTA buttons — changed from a flex-wrap row to a clean vertical
          stack with generous gap. Both buttons already render at their
          container's full width on their own (AddToCartButton's
          .btn-add-to-cart class already has width:100%, and its post
          -add stepper already had w-full) — removing the old flex-1/
          min-w-[140px] wrapper and stacking them guarantees proper,
          uncrowded spacing regardless of this column's exact pixel
          width, rather than depending on wrap behavior that clearly
          didn't fit it well. */}
      {product.stock > 0 && (
        <div className="hidden lg:flex flex-col gap-3">
          <AddToCartButton product={product} initialQty={qty} />
          <button
            onClick={handleBuyNow}
            disabled={buying}
            className="w-full flex items-center justify-center gap-2 btn-primary py-2.5 text-sm disabled:opacity-60"
          >
            <FaShoppingCart size={14} />
            {buying ? "Adding…" : "Buy Now"}
          </button>
        </div>
      )}
      </div>

      {/* Mobile sticky Add to Cart + Buy Now bar — both requested
          explicitly. Fixed to the viewport bottom so they're reachable
          with one thumb from anywhere on what can be a long page once
          description/specs/campaigns/suggestions are scrolled through.
          The page itself (product/[product]/page.jsx) carries matching
          bottom padding so this never covers the last section's content.
          Kept OUTSIDE the space-y-4 wrapper above — see that wrapper's
          own comment for why. */}
      {product.stock > 0 && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--color-header-bg)] border-t border-theme px-3 py-2.5 flex gap-2.5"
          style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}>
          <div className="flex-1 min-w-0"><AddToCartButton product={product} /></div>
          <button onClick={handleBuyNow} disabled={buying}
            className="flex-1 min-w-0 flex items-center justify-center gap-2 btn-primary disabled:opacity-60">
            <FaShoppingCart size={14} className="shrink-0" />
            <span className="truncate">{buying ? "Adding…" : "Buy Now"}</span>
          </button>
          <WishlistButton productId={product._id} variant="inline" size={16} className="border border-theme shrink-0" />
        </div>
      )}
    </>
  );
}
