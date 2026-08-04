"use client";
import { memo } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { displayPrice, priceWithDiscount, validURLConvert } from "@/lib/utils";
import { getCampaignIcon } from "@/lib/campaignIcons";
import { selectCampaignByProductIdMap } from "@/store/campaignSelectors";
import SafeImage from "./SafeImage";
import AddToCartButton from "./AddToCartButton";

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

          {/* Rating: this codebase has no review/rating system yet (no
              model, no data anywhere) — deliberately NOT showing fabricated
              stars, since that would misrepresent real product quality to
              a shopper. This renders only if product.rating is ever
              actually populated by a future backend feature, so the card
              is ready for it without any further layout change. */}
          {typeof product.rating === "number" && product.rating > 0 && (
            <div className="flex items-center gap-1 pt-0.5">
              <span className="flex items-center gap-0.5 text-amber-400 text-xs">
                {"★".repeat(Math.round(product.rating))}
                <span className="text-[var(--color-border)]">{"★".repeat(5 - Math.round(product.rating))}</span>
              </span>
              {typeof product.numReviews === "number" && (
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
    </div>
  );
}

export default memo(ProductCard);
