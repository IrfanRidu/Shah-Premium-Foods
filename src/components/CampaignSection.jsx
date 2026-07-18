"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { FaChevronRight } from "react-icons/fa";
import { displayPrice, priceWithDiscount, validURLConvert } from "@/lib/utils";
import { getCampaignIcon } from "@/lib/campaignIcons";
import AddToCartButton from "./AddToCartButton";
import HorizontalScroll from "./HorizontalScroll";

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

function CampaignProductCard({ item, badgeColor }) {
  const router   = useRouter();
  const currency = useSelector((s) => s.currency.selected);
  const rates    = useSelector((s) => s.currency.rates);
  const product  = item.productId;
  if (!product) return null;

  const originalPrice = product.price;
  const discount      = item.specialDiscount || product.discount || 0;
  const finalPrice    = item.specialPrice > 0 ? item.specialPrice : priceWithDiscount(originalPrice, discount);

  return (
    <div
      onClick={() => router.push(`/product/${validURLConvert(product.name, product._id)}`)}
      className="shrink-0 w-44 sm:w-52 cursor-pointer product-card group"
    >
      <div className="relative overflow-hidden bg-[var(--color-bg)] aspect-square">
        <img
          src={product.image?.[0]}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {discount > 0 && (
          <span
            className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold text-white shadow"
            style={{ backgroundColor: badgeColor || "#ef4444" }}
          >
            {discount}% OFF
          </span>
        )}
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
    </div>
  );
}

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

export default function CampaignSection({ campaign }) {
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
          <img
            src={campaign.badgeImage}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover"
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

      <div className="p-4 bg-[var(--color-bg)]">
        <HorizontalScroll autoScroll autoScrollSpeed={35}>
          {products.map((item, i) => (
            <CampaignProductCard key={i} item={item} badgeColor={campaign.badgeColor} />
          ))}
        </HorizontalScroll>
      </div>
    </section>
  );
}
