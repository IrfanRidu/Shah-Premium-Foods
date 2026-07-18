"use client";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { displayPrice, priceWithDiscount, validURLConvert } from "@/lib/utils";
import { getCampaignIcon } from "@/lib/campaignIcons";
import AddToCartButton from "./AddToCartButton";

// Fix 29: Show short description (truncated)
// Fix 32: Uniform card heights via flex layout
// Fix 33: "Running Out" badge

export default function ProductCard({ product }) {
  const router    = useRouter();
  const currency  = useSelector((s) => s.currency.selected);
  const rates     = useSelector((s) => s.currency.rates);
  const campaigns = useSelector((s) => s.campaign.campaigns);

  const activeCampaign = campaigns.find((c) =>
    c.products?.some((p) => (p.productId?._id || p.productId)?.toString() === product._id?.toString())
  );
  const campaignEntry = activeCampaign?.products?.find(
    (p) => (p.productId?._id || p.productId)?.toString() === product._id?.toString()
  );
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
        <img
          src={product.image?.[0]}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
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
          <span className="absolute top-2 left-2 bg-[var(--color-secondary)] text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow">
            {effectiveDiscount}% OFF
          </span>
        )}
        {/* Out of stock overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
            <span className="bg-white/90 text-xs font-bold px-3 py-1 rounded-full text-gray-700 backdrop-blur-sm">Out of Stock</span>
          </div>
        )}
        {/* Fix 33: Low stock badge */}
        {isLowStock && (
          <span className="absolute bottom-2 left-1 right-1 mx-auto w-fit flex items-center gap-1 bg-orange-500/90 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full shadow">
            🔥 Running Out Quickly — Only {product.stock} Left
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
          propagation through any wrapping grid/flex container. */}
      <div className="card-info p-3">
        <div className="space-y-1 mb-2 min-h-[6.5rem]">
          <h3 className="text-sm font-semibold line-clamp-2 leading-snug">{product.name}</h3>

          {/* Fix 29: Short description, truncated to 2 lines */}
          {product.shortDescription && (
            <p className="text-xs text-theme-muted line-clamp-2 leading-relaxed">{product.shortDescription}</p>
          )}
          {product.unit && <p className="text-xs text-theme-muted">{product.unit}</p>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-bold text-sm ${isCampaign ? "text-red-500" : "text-theme-primary"}`}>
              {displayPrice(discounted, currency, rates)}
            </span>
            {hasDiscount && (
              <span className="text-xs text-theme-muted line-through">
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
