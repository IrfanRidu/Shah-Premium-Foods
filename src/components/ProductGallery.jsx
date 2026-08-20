"use client";
import { useState, useRef } from "react";
import { useSelector } from "react-redux";
import { FaChevronLeft, FaChevronRight, FaSearch } from "react-icons/fa";
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
  const touchStartX = useRef(null);

  // Session 4 (Luxury PDP redesign) — desktop hover-zoom. Cursor-position
  // -driven CSS transform (scale + transform-origin tracking the pointer)
  // rather than a separate magnified panel: this gallery only has half
  // the viewport width to work with (md:grid-cols-2 on the product page),
  // so a same-box zoom that needs no extra horizontal space is the more
  // robust choice across the actual range of screen widths this has to
  // support, vs. a classic side-by-side magnifier panel that would fight
  // the info column for room on anything narrower than a large desktop.
  // Mouse-driven on purpose (not touch) — phones already get pinch-zoom
  // natively from the browser and the swipe gesture above is the primary
  // mobile interaction; a hover effect keyed off mousemove essentially
  // never fires from a touch-only interaction in modern mobile browsers,
  // so this needs no explicit device branching.
  const [zoom, setZoom] = useState({ active: false, x: 50, y: 50 });
  const imgWrapRef = useRef(null);

  const handleMouseMove = (e) => {
    if (!imgWrapRef.current) return;
    const rect = imgWrapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoom({ active: true, x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
  };
  const handleMouseLeave = () => setZoom((z) => ({ ...z, active: false }));

  const campaignMap = useSelector(selectCampaignByProductIdMap);
  const match = campaignMap.get(productId?.toString());
  const activeCampaign = match?.campaign;
  const campaignEntry  = match?.entry;
  const isCampaign     = !!activeCampaign;
  const CampaignIcon   = getCampaignIcon(activeCampaign?.icon);
  const campaignLabel  = activeCampaign?.name || "Flash Sale";
  const campaignDiscount = campaignEntry?.specialDiscount || 0;

  const prev = () => setImgIdx((p) => (p - 1 + images.length) % images.length);
  const next = () => setImgIdx((p) => (p + 1) % images.length);

  // Mobile UI pass: swipe-to-browse — the standard expected interaction
  // for a mobile image gallery, and the only way to reach prev/next at
  // all before the visibility fix below (see that comment for the bug
  // this was paired with). A 40px threshold avoids triggering on an
  // ordinary tap or minor scroll jitter.
  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current === null || images.length <= 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) (dx > 0 ? prev() : next());
    touchStartX.current = null;
  };

  return (
    <div>
      <div
        ref={imgWrapRef}
        className="relative rounded-2xl overflow-hidden bg-[var(--color-surface)] aspect-square mb-3 group md:cursor-zoom-in"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {images[imgIdx] && (
          <div
            className="absolute inset-0 transition-transform duration-150 ease-out"
            style={{
              transform: zoom.active ? "scale(2)" : "scale(1)",
              transformOrigin: `${zoom.x}% ${zoom.y}%`,
            }}
          >
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
          </div>
        )}
        {/* Desktop-only discoverability hint for the hover-zoom — hidden
            once zoom is actually active so it doesn't sit on top of the
            magnified image. */}
        {images[imgIdx] && !zoom.active && (
          <span className="hidden md:flex absolute top-3 right-3 items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-black/55 text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <FaSearch size={9} /> Hover to zoom
          </span>
        )}
        {isCampaign && (
          <span className="absolute top-3 left-3 flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold text-white shadow"
            style={{ backgroundColor: activeCampaign?.badgeColor || "#ef4444" }}>
            <CampaignIcon size={12} /> {campaignLabel} — {campaignDiscount}% OFF
          </span>
        )}
        {images.length > 1 && (<>
          {/* Mobile UI pass: these were opacity-0 group-hover:opacity-100 —
              invisible by default, only appearing on :hover. Touch devices
              have no hover state, so on every phone/tablet these buttons
              were completely invisible AND effectively undiscoverable —
              swipe (added above) and the thumbnail strip below were the
              only ways to change images. Now visible by default; the
              md:opacity-0 md:group-hover:opacity-100 pair restores the
              original clean hover-reveal look on desktop, where hovering
              is a real, available gesture. Also grew 36px->44px. */}
          <button onClick={prev}
            aria-label="Previous image"
            className="absolute left-2 top-1/2 -translate-y-1/2 h-11 w-11 bg-white/85 rounded-full flex items-center justify-center shadow opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity active:scale-95">
            <FaChevronLeft size={16} />
          </button>
          <button onClick={next}
            aria-label="Next image"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-11 w-11 bg-white/85 rounded-full flex items-center justify-center shadow opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity active:scale-95">
            <FaChevronRight size={16} />
          </button>
          {/* Mobile-only position dots — thumbnail strip below still works
              as the precise picker, but a lightweight "1 of 4" style
              indicator directly on the image is the more standard mobile
              gallery pattern and needs no horizontal scroll to read. */}
          <div className="sm:hidden absolute bottom-2 inset-x-0 flex items-center justify-center gap-1.5">
            {images.map((_, i) => (
              <span key={i} className={`carousel-dot ${i === imgIdx ? "active" : ""}`} />
            ))}
          </div>
        </>)}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button key={i} onClick={() => setImgIdx(i)}
              aria-label={`View image ${i + 1}`}
              className={`relative h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-xl overflow-hidden border-2 transition-all ${i === imgIdx ? "border-theme-primary" : "border-transparent opacity-60"}`}>
              <SafeImage src={img} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
