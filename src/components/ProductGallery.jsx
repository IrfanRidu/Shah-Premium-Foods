"use client";
import { useState } from "react";
import { useSelector } from "react-redux";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { getCampaignIcon } from "@/lib/campaignIcons";
import { selectCampaignByProductIdMap } from "@/store/campaignSelectors";
import SafeImage from "./SafeImage";

// Extracted unchanged from the old product/[product]/page.jsx (which was
// entirely "use client") as part of converting that page into a Server
// Component for real per-product metadata/SEO — see Section 10 notes on
// that page. This piece stays client-side because it's genuinely
// interactive (image switching) and its campaign-badge overlay depends on
// client Redux state; the product data itself now arrives as a prop from
// the server instead of being fetched here.
export default function ProductGallery({ images, productId, productName }) {
  const [imgIdx, setImgIdx] = useState(0);

  const campaignMap = useSelector(selectCampaignByProductIdMap);
  const match = campaignMap.get(productId?.toString());
  const activeCampaign = match?.campaign;
  const campaignEntry  = match?.entry;
  const isCampaign     = !!activeCampaign;
  const CampaignIcon   = getCampaignIcon(activeCampaign?.icon);
  const campaignLabel  = activeCampaign?.name || "Flash Sale";
  const campaignDiscount = campaignEntry?.specialDiscount || 0;

  return (
    <div>
      <div className="relative rounded-2xl overflow-hidden bg-[var(--color-surface)] aspect-square mb-3 group">
        {images[imgIdx] && (
          <SafeImage
            src={images[imgIdx]}
            alt={productName}
            fill
            // Section 9 (Performance) — "Optimize LCP": this is very
            // likely the Largest Contentful Paint element on a product
            // page — it's the single largest, most prominent piece of
            // content, server-rendered with the rest of the page shell
            // now instead of appearing after a client fetch.
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        )}
        {isCampaign && (
          <span className="absolute top-3 left-3 flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold text-white shadow"
            style={{ backgroundColor: activeCampaign?.badgeColor || "#ef4444" }}>
            <CampaignIcon size={12} /> {campaignLabel} — {campaignDiscount}% OFF
          </span>
        )}
        {images.length > 1 && (<>
          <button onClick={() => setImgIdx((p) => (p - 1 + images.length) % images.length)}
            className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 bg-white/80 rounded-full flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity">
            <FaChevronLeft size={14} />
          </button>
          <button onClick={() => setImgIdx((p) => (p + 1) % images.length)}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 bg-white/80 rounded-full flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity">
            <FaChevronRight size={14} />
          </button>
        </>)}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <button key={i} onClick={() => setImgIdx(i)}
              className={`relative h-16 w-16 shrink-0 rounded-xl overflow-hidden border-2 transition-all ${i === imgIdx ? "border-theme-primary" : "border-transparent opacity-60"}`}>
              <SafeImage src={img} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
