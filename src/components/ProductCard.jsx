"use client";
import { memo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { FaEye, FaCheck } from "react-icons/fa";
import { displayPrice, priceWithDiscount, validURLConvert } from "@/lib/utils";
import { getCampaignIcon } from "@/lib/campaignIcons";
import { selectCampaignByProductIdMap } from "@/store/campaignSelectors";
import { useCompare } from "@/hooks/useCompare";
import SafeImage from "./SafeImage";
import AddToCartButton from "./AddToCartButton";
import WishlistButton from "./WishlistButton";
import StarRating from "./StarRating";
import QuickView from "./QuickView";
import toast from "react-hot-toast";

// Fix 29: Show short description (truncated)
// Fix 32: Uniform card heights via flex layout
// Fix 33: "Running Out" badge
//
// Section 9 (Performance): wrapped in memo() — this renders many times per
// page (every product grid/row) and its own props (a single `product`
// object) only change when that specific product's data changes, so a
// re-render of some unrelated ancestor (e.g. the cart count updating in
// the header) no longer needlessly re-renders every card on the page.
function ProductCard({ product }) {
  const router    = useRouter();
  const currency  = useSelector((s) => s.currency.selected);
  const rates     = useSelector((s) => s.currency.rates);
  // Section 9 (Performance): O(1) lookup from a selector memoized against
  // the campaigns array (see store/campaignSelectors.js) instead of this
  // component scanning every campaign's product list on every render.
  const campaignMap = useSelector(selectCampaignByProductIdMap);
  const match = campaignMap.get(product._id?.toString());
  const activeCampaign = match?.campaign;
  const campaignEntry  = match?.entry;
  const isCampaign       = !!activeCampaign;
  const campaignDiscount = campaignEntry?.specialDiscount || 0;
  const effectiveDiscount = campaignDiscount || product.discount || 0;
  const discounted       = priceWithDiscount(product.price, effectiveDiscount);
  const hasDiscount      = effectiveDiscount > 0;
  const badgeColor       = activeCampaign?.badgeColor || "#ef4444";
  const CampaignIcon     = getCampaignIcon(activeCampaign?.icon);
  const campaignLabel    = activeCampaign?.name || "Flash Sale";

  const isOutOfStock = product.stock === 0;
  const threshold    = product.lowStockThreshold || 10;
  const isLowStock   = product.stock > 0 && product.stock <= threshold;

  // Session 4 (Luxury redesign) — Quick View + Compare, the two
  // remaining Highest-Priority card features. Local, per-card state:
  // each card owns its own Quick View modal independently (no global
  // "which card is open" state needed), matching the existing modal
  // convention elsewhere in this app of a component rendering its own
  // overlay rather than a portal/global modal manager.
  const [showQuickView, setShowQuickView] = useState(false);
  const { isComparing, toggle } = useCompare();
  const comparing = isComparing(product._id);

  const handleCompareToggle = (e) => {
    e.stopPropagation();
    const result = toggle(product._id);
    if (!result.ok && result.reason === "max") {
      toast.error("You can compare up to 4 products at a time");
    }
  };

  return (
    <div
      onClick={() => router.push(`/product/${validURLConvert(product.name, product._id)}`)}
      className="product-card cursor-pointer group h-full"
    >
      {/* ── Image ── */}
      <div className="relative overflow-hidden bg-[var(--color-bg)] aspect-square">
        <SafeImage
          src={product.image?.[0]}
          alt={product.name}
          fill
          // Section 9 (Performance): matches the actual rendered card width
          // across breakpoints closely enough for next/image to pick a
          // sensibly-sized generated variant instead of always serving the
          // largest one — cards run ~2/row on mobile, up to ~5/row on
          // desktop grids across this app.
          sizes="(max-width: 480px) 50vw, (max-width: 768px) 33vw, (max-width: 1200px) 25vw, 20vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Wishlist toggle — top-right, mirrors the badges' top-left placement.
            Quick View + Compare (Session 4) stack directly below it, but
            only from sm: up — this app's own existing comments note a
            2-column mobile grid produces ~136px-wide cards, and with the
            image at aspect-square (~136px tall too), 3 stacked 32px
            buttons (~108px) would consume nearly the whole image's
            height on the tightest screens, overwhelming a small product
            photo rather than complementing it. Wishlist alone at that
            size is the same footprint this card already shipped with
            before this session — zero regression there; Quick View and
            Compare are still one tap away via the full product page at
            every screen size, just not crowded onto the smallest grid
            cards specifically. This corner is also the only one of the
            four guaranteed collision-free against every OTHER floating
            element the image can show (campaign/discount badge top-left,
            low-stock badge bottom-center) at any card width, checked
            against each badge's actual positioning rather than assumed
            clear. */}
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1.5">
          <WishlistButton productId={product._id} variant="floating" size={13} />
          <div className="hidden sm:flex sm:flex-col gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); setShowQuickView(true); }}
              aria-label="Quick view"
              title="Quick View"
              className="h-8 w-8 rounded-full flex items-center justify-center bg-white/90 backdrop-blur-sm shadow hover:scale-110 transition-transform text-gray-500"
            >
              <FaEye size={13} />
            </button>
            <button
              onClick={handleCompareToggle}
              aria-label={comparing ? "Remove from compare" : "Add to compare"}
              aria-pressed={comparing}
              title="Compare"
              className={`h-8 w-8 rounded-full flex items-center justify-center backdrop-blur-sm shadow hover:scale-110 transition-transform ${
                comparing ? "bg-theme-primary text-white" : "bg-white/90 text-gray-500"
              }`}
            >
              {comparing ? <FaCheck size={12} /> : <span className="h-3 w-3 rounded-sm border-2 border-current" />}
            </button>
          </div>
        </div>

        {/* Campaign badge */}
        {isCampaign && (
          <span
            className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold text-white shadow-md max-w-[calc(100%-1rem)]"
            style={{ background: activeCampaign.badgeGradient || `linear-gradient(135deg, ${badgeColor}, ${badgeColor}cc)` }}
            title={campaignLabel}
          >
            <CampaignIcon size={9} className="shrink-0" style={{ color: activeCampaign.iconColor || "#fff" }} />
            <span className="truncate" style={{ color: activeCampaign.textColor || "#fff" }}>{campaignLabel}</span>
          </span>
        )}
        {/* Regular discount badge */}
        {!isCampaign && hasDiscount && (
          <span className="absolute top-2 left-2 bg-[var(--color-secondary-badge)] text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow">
            {effectiveDiscount}% OFF
          </span>
        )}
        {/* Out of stock overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
            <span className="bg-white/90 text-xs font-bold px-3 py-1 rounded-full text-gray-700 backdrop-blur-sm">Out of Stock</span>
          </div>
        )}
        {/* Fix 33: Low stock badge.
            Mobile UI pass: added max-w + truncate — this previously had no
            overflow safeguard (unlike the campaign badge above), and its
            text is long enough to genuinely push past the card's edge at
            the ~136px card width a 2-column mobile grid produces. Shorter
            copy on the smallest screens, fuller copy from sm: up, both
            still truncate as a safety net regardless of stock-count digits. */}
        {isLowStock && (
          <span className="absolute bottom-2 left-1.5 right-1.5 mx-auto w-fit max-w-[calc(100%-0.75rem)] flex items-center gap-1 bg-orange-500/90 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full shadow">
            <span className="shrink-0">🔥</span>
            <span className="truncate">
              <span className="sm:hidden">Only {product.stock} left</span>
              <span className="hidden sm:inline">Running Out — Only {product.stock} Left</span>
            </span>
          </span>
        )}
      </div>

      {/* Fix 32: card-info flex-grows so all cards in a row share the same height.
          Fix 5: the text block above the price/button also gets its own fixed
          min-height, sized to fit the worst case (2-line name + 2-line short
          description + a unit line). Products with a short name and no
          description just get empty space below their text instead of the
          button drifting up — the button's position is now guaranteed
          consistent card-to-card without relying on cross-card stretch
          propagation through any wrapping grid/flex container.
          Mobile UI pass: p-3 -> p-2.5 sm:p-3 (slightly tighter on the
          narrowest phones, where 2-column cards are only ~136px wide). */}
      <div className="card-info p-2.5 sm:p-3">
        <div className="space-y-1 mb-2 min-h-[6.5rem]">
          <h3 className="text-[13px] sm:text-sm font-semibold line-clamp-2 leading-snug">{product.name}</h3>

          {/* Fix 29: Short description, truncated to 2 lines */}
          {product.shortDescription && (
            <p className="text-[11px] sm:text-xs text-theme-muted line-clamp-2 leading-relaxed">{product.shortDescription}</p>
          )}
          {product.unit && <p className="text-[11px] sm:text-xs text-theme-muted">{product.unit}</p>}

          {/* Rating (Session 4): product.rating/numReviews are now real,
              denormalized fields kept in sync by every review
              create/update/moderate/delete (see server/utils/
              reviewAggregation.js) — no longer a stub waiting on future
              data. Still conditionally hidden for genuinely unreviewed
              products, same as before: a product with zero reviews has
              rating 0, and showing an empty/zero star row would look
              like a broken component rather than "no reviews yet". */}
          {typeof product.rating === "number" && product.rating > 0 && (
            <div className="flex items-center gap-1 pt-0.5">
              <StarRating value={product.rating} size={12} />
              {typeof product.numReviews === "number" && product.numReviews > 0 && (
                <span className="text-[11px] text-theme-muted">({product.numReviews})</span>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <span className={`font-bold text-[13px] sm:text-sm ${isCampaign ? "text-red-500" : "text-theme-primary"}`}>
              {displayPrice(discounted, currency, rates)}
            </span>
            {hasDiscount && (
              <span className="text-[11px] sm:text-xs text-theme-muted line-through">
                {displayPrice(product.price, currency, rates)}
              </span>
            )}
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <AddToCartButton product={product} />
          </div>
        </div>
      </div>

      {showQuickView && <QuickView product={product} onClose={() => setShowQuickView(false)} />}
    </div>
  );
}

export default memo(ProductCard);
