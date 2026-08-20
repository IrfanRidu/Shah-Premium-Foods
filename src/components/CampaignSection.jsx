"use client";
import { useEffect, useState, memo } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { FaChevronRight, FaEye, FaCheck } from "react-icons/fa";
import toast from "react-hot-toast";
import { displayPrice, priceWithDiscount, validURLConvert } from "@/lib/utils";
import { getCampaignIcon } from "@/lib/campaignIcons";
import { useCompare } from "@/hooks/useCompare";
import SafeImage from "./SafeImage";
import AddToCartButton from "./AddToCartButton";
import HorizontalScroll from "./HorizontalScroll";
import QuickView from "./QuickView";

// Countdown timer hook — includes days
function useCountdown(endTime) {
  const calc = () => {
    const diff = Math.max(0, new Date(endTime) - new Date());
    const totalSecs = Math.floor(diff / 1000);
    return {
      d: Math.floor(totalSecs / 86400),
      h: Math.floor((totalSecs % 86400) / 3600),
      m: Math.floor((totalSecs % 3600) / 60),
      s: totalSecs % 60,
      expired: diff === 0,
    };
  };
  const [time, setTime] = useState(calc);

  useEffect(() => {
    const id = setInterval(() => setTime(calc()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endTime]);

  return time;
}

function CountdownBlock({ value, label }) {
  return (
    <div className="flex flex-col items-center bg-white/20 backdrop-blur-sm rounded-lg px-2 py-1 min-w-[42px]">
      <span className="text-xl font-bold leading-none">{String(value).padStart(2, "0")}</span>
      <span className="text-[10px] uppercase tracking-wider opacity-80">{label}</span>
    </div>
  );
}

function CampaignProductCard({ item, badgeColor, gridMode = false }) {
  const router   = useRouter();
  const currency = useSelector((s) => s.currency.selected);
  const rates    = useSelector((s) => s.currency.rates);
  const product  = item.productId;

  // Phase 8 (user-reported: "no comparing and quick view option for
  // campaign products") — this card is a separate component from
  // ProductCard.jsx (different layout: fixed-width carousel item vs. a
  // grid tile), so it never automatically got ProductCard's Session-4
  // additions. Same pattern, adapted: this card is wider (w-44 sm:w-52
  // = 176-208px) than ProductCard's tightest ~136px mobile-grid case
  // and has no existing wishlist button competing for the corner, so
  // both buttons show always rather than needing the sm:-and-up gate
  // ProductCard uses for its 3-button stack.
  const [showQuickView, setShowQuickView] = useState(false);
  const { isComparing, toggle } = useCompare();

  if (!product) return null;
  const comparing = isComparing(product._id);

  const handleCompareToggle = (e) => {
    e.stopPropagation();
    const result = toggle(product._id);
    if (!result.ok && result.reason === "max") {
      toast.error("You can compare up to 4 products at a time");
    }
  };

  const originalPrice = product.price;
  const discount      = item.specialDiscount || product.discount || 0;
  const finalPrice    = item.specialPrice > 0 ? item.specialPrice : priceWithDiscount(originalPrice, discount);

  return (
    <div
      onClick={() => router.push(`/product/${validURLConvert(product.name, product._id)}`)}
      className={`cursor-pointer product-card group ${gridMode ? "w-full" : "shrink-0 w-44 sm:w-52"}`}
    >
      <div className="relative overflow-hidden bg-[var(--color-bg)] aspect-square">
        <SafeImage
          src={product.image?.[0]}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 176px, 208px"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {discount > 0 && (
          <span
            className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold text-white shadow"
            style={{ backgroundColor: badgeColor || "#ef4444" }}
          >
            {discount}% OFF
          </span>
        )}

        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1.5">
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
      <div className="p-3 space-y-1.5">
        <h3 className="text-sm font-semibold line-clamp-2 leading-snug">{product.name}</h3>
        {product.unit && <p className="text-xs text-theme-muted">{product.unit}</p>}
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-sm" style={{ color: badgeColor || "#ef4444" }}>
            {displayPrice(finalPrice, currency, rates)}
          </span>
          {discount > 0 && (
            <span className="text-xs text-theme-muted line-through">{displayPrice(originalPrice, currency, rates)}</span>
          )}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <AddToCartButton product={product} />
        </div>
      </div>

      {showQuickView && <QuickView product={product} onClose={() => setShowQuickView(false)} />}
    </div>
  );
}

// Section 9 (Performance): CampaignProductCard is a list item (rendered via
// .map() inside HorizontalScroll below) — same reasoning as ProductCard's
// own memo() wrap.
const MemoCampaignProductCard = memo(CampaignProductCard);

// Fix 21: the header bar's background now honors badgeStyle — "solid" (the
// Solid/gradient badges use a compact bar background; kept as its own
// helper since the "image" case now gets a structurally different,
// taller banner treatment instead of just a different background value.
function getBarBackground(campaign) {
  if (campaign.badgeStyle === "gradient" && campaign.badgeGradient) {
    return { background: campaign.badgeGradient };
  }
  const color = campaign.badgeColor || "#ef4444";
  return { background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)` };
}

// Shared countdown cluster, reused by both the compact-bar and banner headers.
function CountdownRow({ time, textColor }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end" style={{ color: textColor }}>
      <span className="text-sm opacity-80 mr-1">Ends in</span>
      {time.d > 0 && (
        <>
          <CountdownBlock value={time.d} label="day" />
          <span className="text-xl font-bold">:</span>
        </>
      )}
      <CountdownBlock value={time.h} label="hr" />
      <span className="text-xl font-bold">:</span>
      <CountdownBlock value={time.m} label="min" />
      <span className="text-xl font-bold">:</span>
      <CountdownBlock value={time.s} label="sec" />
    </div>
  );
}

// Section 9 (Performance): wrapped in memo() at export below — same
// reasoning as ProductCard (renders once per active campaign; shouldn't
// re-render just because some unrelated ancestor did).
function CampaignSection({ campaign }) {
  const time = useCountdown(campaign.endTime);
  const Icon = getCampaignIcon(campaign.icon);
  const name = campaign.name || "Flash Sale";
  const textColor = campaign.textColor || "#ffffff";
  const iconColor = campaign.iconColor || "#ffffff";
  const isImageBadge = campaign.badgeStyle === "image" && campaign.badgeImage;

  if (!campaign.isActive || time.expired) return null;
  if (!campaign.products || campaign.products.length === 0) return null;

  // Fix 46 (defensive): dedupe within a single campaign's own product list
  // too, in case the same product was accidentally added to it twice.
  const seen = new Set();
  const products = campaign.products.filter((item) => {
    const pid = (item.productId?._id || item.productId)?.toString();
    if (!pid || seen.has(pid)) return false;
    seen.add(pid);
    return true;
  });
  if (products.length === 0) return null;

  return (
    <section className="rounded-2xl overflow-hidden border border-theme">
      {/* Header — Fix #3: an uploaded badge *image* now renders as an actual
          full-size banner (real <img>, hero-style aspect ratio) instead of
          being squeezed into the same slim bar used for solid colors and CSS
          gradients, which is too short to do an uploaded image justice.
          Name/Icon/Description/Countdown are overlaid at the TOP of the
          banner (previously bottom) — the gradient darkens the top of the
          image for text contrast and fades out toward the bottom instead. */}
      {isImageBadge ? (
        <div className="relative w-full aspect-[21/6] min-h-[140px] sm:min-h-[180px]">
          <SafeImage
            src={campaign.badgeImage}
            alt={name}
            fill
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/10 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-start gap-2 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Icon className="text-2xl shrink-0" style={{ color: iconColor }} />
                <div className="min-w-0">
                  <h2 className="font-display text-xl sm:text-2xl font-bold truncate" style={{ color: textColor }}>{name}</h2>
                  {campaign.description && (
                    <p className="text-sm opacity-90 truncate" style={{ color: textColor }}>{campaign.description}</p>
                  )}
                </div>
              </div>
              <CountdownRow time={time} textColor={textColor} />
            </div>
          </div>
        </div>
      ) : (
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
          style={{ ...getBarBackground(campaign), color: textColor }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="text-xl shrink-0" style={{ color: iconColor }} />
            <h2 className="font-display text-xl font-bold truncate" style={{ color: textColor }}>{name}</h2>
            {campaign.description && <span className="hidden sm:inline text-sm opacity-80 truncate">— {campaign.description}</span>}
          </div>
          <CountdownRow time={time} textColor={textColor} />
        </div>
      )}

      {/* Phase 12 (user-reported, with screenshots: "Currently Trending",
          "Best Selling", "All-Time Favourites" showing only 2-4 products
          with a large empty gap where a full row should be — "every
          section must display minimum a full row of products"). Real,
          fixable layout issue, distinct from the PRIOR round's "Clearance
          Picks"/"Best Selling" report (that one really was a content
          question — campaign.products itself only had 2 entries, and
          this component has no slice/limit anywhere, confirmed by
          reading it directly). This time the products list can be
          small AND the fixed-width scroll-row card sizing (w-44/w-52)
          is exactly what leaves a large unfilled gap when there aren't
          enough items to need scrolling — that part IS a genuine layout
          bug, independent of how many products any given campaign
          actually has. Fix: below a small-enough count, render as a
          responsive GRID (cards naturally fill their cell — always
          "looks full" regardless of viewport width) instead of the
          fixed-width scroll row; only switch to the scroll pattern once
          there are genuinely more products than fit in one row, where
          horizontal scroll is the correct, expected way to reach the
          rest rather than a symptom of a layout gap. 5 is the grid's
          widest column count (lg:grid-cols-5) — chosen so the grid
          threshold and the grid's own max density line up, rather than
          picking two unrelated numbers. */}
      <div className="p-4 bg-[var(--color-bg)]">
        {products.length <= 5 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {products.map((item, i) => (
              <MemoCampaignProductCard key={i} item={item} badgeColor={campaign.badgeColor} gridMode />
            ))}
          </div>
        ) : (
          <HorizontalScroll autoScroll autoScrollSpeed={35}>
            {products.map((item, i) => (
              <MemoCampaignProductCard key={i} item={item} badgeColor={campaign.badgeColor} />
            ))}
          </HorizontalScroll>
        )}
      </div>
    </section>
  );
}

export default memo(CampaignSection);
