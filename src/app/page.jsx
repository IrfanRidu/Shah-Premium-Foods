"use client";
import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import Link from "next/link";
import Carousel from "@/components/Carousel";
import ProductCard from "@/components/ProductCard";
import CampaignSection from "@/components/CampaignSection";
import HorizontalScroll from "@/components/HorizontalScroll";
import { CardSkeleton } from "@/components/Loading";
import { validURLConvert } from "@/lib/utils";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { FaListUl, FaChevronDown, FaChevronUp, FaShoppingBasket } from "react-icons/fa";

// Product row section
function ProductRow({ title, icon, subtitle, products, loading }) {
  if (!loading && products.length === 0) return null;
  return (
    <section className="py-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{icon}</span>
          <div>
            <h2 className="section-heading text-xl">{title}</h2>
            {subtitle && <p className="text-xs text-theme-muted">{subtitle}</p>}
          </div>
        </div>
      </div>
      <HorizontalScroll>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="shrink-0 w-44 sm:w-52"><CardSkeleton /></div>
            ))
          : products.map((p) => (
              <div key={p._id} className="shrink-0 w-44 sm:w-52">
                <ProductCard product={p} />
              </div>
            ))
        }
      </HorizontalScroll>
    </section>
  );
}

// Interleave campaigns between product rows.
//
// Fix 47 root cause: the previous version spread campaigns across the first
// few row-gaps correctly, but once it ran out of rows it dumped every
// *remaining* campaign in one trailing `while` loop with nothing between
// them — so with more campaigns than rows, campaigns 6, 7, 8... all landed
// back-to-back. This rewrite buckets campaigns proportionally across every
// available gap (before row 0, between each pair of rows, after the last
// row — i.e. rows.length + 1 slots) and — critically — if more than one
// campaign ever lands in the *same* gap (only possible once campaigns
// outnumber gaps), a lightweight `spacer` block is inserted between them.
// That makes "no two campaigns back to back" a structural guarantee rather
// than something that only holds for small campaign counts.
function interleaveCampaigns(rows, campaigns) {
  if (!campaigns.length) return rows.map((row) => ({ type: "row", row }));

  const pushCampaignGroup = (result, group) => {
    group.forEach((c, i) => {
      if (i > 0) result.push({ type: "spacer" });
      result.push({ type: "campaign", campaign: c });
    });
  };

  if (!rows.length) {
    const result = [];
    pushCampaignGroup(result, campaigns);
    return result;
  }

  const numGaps = rows.length + 1; // slot 0 = before row 0 … slot N = after last row
  const gapBuckets = Array.from({ length: numGaps }, () => []);
  campaigns.forEach((c, i) => {
    const gapIndex = Math.min(numGaps - 1, Math.floor(((i + 0.5) * numGaps) / campaigns.length));
    gapBuckets[gapIndex].push(c);
  });

  const result = [];
  pushCampaignGroup(result, gapBuckets[0]);
  rows.forEach((row, idx) => {
    result.push({ type: "row", row });
    pushCampaignGroup(result, gapBuckets[idx + 1]);
  });
  return result;
}

// Minimal visual divider used only when two campaigns would otherwise be
// forced adjacent (more active campaigns than natural row-gaps).
function SectionSpacer() {
  return (
    <div className="flex items-center gap-3 py-1" aria-hidden="true">
      <span className="flex-1 h-px bg-[var(--color-border)]" />
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-border)]" />
      <span className="flex-1 h-px bg-[var(--color-border)]" />
    </div>
  );
}

// Fix 43: hover behavior removed entirely — click-only toggle now.
// (Previously hovering would preview the answer; per explicit request,
// answers only ever open/close by clicking, with no exceptions.)
function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false);
  const handleClick = () => setOpen((o) => !o);

  return (
    <div className="bg-[var(--color-surface)] border border-theme rounded-xl overflow-hidden transition-all">
      <button
        onClick={handleClick}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-[var(--color-border)] transition-colors"
      >
        <span className="leading-snug">{question}</span>
        <span className="shrink-0 text-theme-muted">
          {open ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 text-sm text-theme-muted leading-relaxed border-t border-theme">
          {answer}
        </div>
      )}
    </div>
  );
}

// FAQ Section — 3-column grid to keep it compact
function FaqSection({ faqs, t }) {
  if (!faqs || faqs.length === 0) return null;
  const sorted = [...faqs].sort((a, b) => (a.order || 0) - (b.order || 0));
  return (
    <section className="py-8">
      <div className="mb-6 text-center">
        <h2 className="section-heading text-2xl mb-1">{t("faq.title")}</h2>
        <p className="text-sm text-theme-muted">{t("faq.subtitle")}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted.map((faq) => (
          <FaqItem key={faq._id || faq.question} question={faq.question} answer={faq.answer} />
        ))}
      </div>
    </section>
  );
}

// Submit Shopping List Banner
function ShoppingListBanner({ settings, t }) {
  const banner = settings?.shoppingListBanner;
  if (!banner?.enabled) return null;
  return (
    <section className="py-6">
      <div className="bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-h,var(--color-primary))] rounded-2xl p-8 text-white text-center flex flex-col sm:flex-row items-center justify-between gap-5 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-white/20 flex items-center justify-center text-3xl shrink-0">
            <FaShoppingBasket />
          </div>
          <div className="text-left">
            <h3 className="font-display text-2xl font-bold">{banner.title || t("shoppingList.defaultTitle")}</h3>
            <p className="text-white/80 text-sm mt-1">{banner.subtitle || "Can't find what you need? Send us your list!"}</p>
          </div>
        </div>
        <Link
          href="/dashboard/submit-list"
          className="shrink-0 bg-white text-[var(--color-primary)] font-bold px-6 py-3 rounded-xl hover:bg-white/90 transition-colors text-sm whitespace-nowrap shadow"
        >
          {banner.buttonText || t("shoppingList.defaultButton")}
        </Link>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { t }      = useTranslation();
  const settings   = useSelector((s) => s.siteSettings);
  const categories = useSelector((s) => s.product.allCategory);
  const catLoading = useSelector((s) => s.product.loadingCategory);
  const campaigns  = useSelector((s) => s.campaign.campaigns);

  const [sections, setSections] = useState({
    trending:    { data: [], loading: true },
    bestSelling: { data: [], loading: true },
    lowSelling:  { data: [], loading: true },
    neverSold:   { data: [], loading: true },
    allTimeBest: { data: [], loading: true },
  });

  useEffect(() => {
    const fetchers = [
      { key: "trending",    url: api.getTrending    },
      { key: "bestSelling", url: api.getBestSelling },
      { key: "lowSelling",  url: api.getLowSelling  },
      { key: "neverSold",   url: api.getNeverSold   },
      { key: "allTimeBest", url: api.getAllTimeBest  },
    ];
    fetchers.forEach(async ({ key, url }) => {
      try {
        const r = await Axios({ ...url, params: { limit: 20 } });
        setSections((prev) => ({ ...prev, [key]: { data: r.data?.data || [], loading: false } }));
      } catch {
        setSections((prev) => ({ ...prev, [key]: { data: [], loading: false } }));
      }
    });
  }, []);

  // De-duplicate: collect product IDs that have been shown to avoid repeating them.
  //
  // Fix 46 (hardened): ANY product featured in a homepage campaign is excluded
  // from the plain product rows — being in one campaign vs. several doesn't
  // change that, since a row is a *different* section from a campaign either
  // way. The "same product, different campaigns, different metrics" allowance
  // from the spec is about letting a product legitimately repeat *across
  // distinct campaign sections* (handled separately, inside each
  // CampaignSection — each campaign shows its own product list regardless of
  // what other campaigns show) — it was never meant to let a campaign product
  // slip back into a plain row too. The previous `size === 1` special case
  // accidentally allowed exactly that for any product in 2+ campaigns.
  const usedProductIds = useMemo(() => {
    const blockedFromRows = new Set();
    campaigns.forEach((c) => {
      if (!c.showOnHomepage) return;
      (c.products || []).forEach((item) => {
        const pid = item.productId?._id || item.productId;
        if (pid) blockedFromRows.add(pid.toString());
      });
    });
    return blockedFromRows;
  }, [campaigns]);

  const dedup = (products, seen) => {
    const result = [];
    for (const p of products) {
      const id = p._id?.toString();
      if (!seen.has(id) && !usedProductIds.has(id)) {
        result.push(p);
        seen.add(id);
      }
    }
    return result;
  };

  const seenInRows = new Set();
  const rows = [
    { id: "trending",    title: t("home.trending"),          icon: "🔥", subtitle: "What customers are buzzing about this week", products: dedup(sections.trending.data, seenInRows),    loading: sections.trending.loading },
    { id: "bestSelling", title: t("home.bestSelling"),        icon: "⭐", subtitle: "Top movers in the last 30 days",            products: dedup(sections.bestSelling.data, seenInRows), loading: sections.bestSelling.loading },
    { id: "lowSelling",  title: t("home.clearance"),          icon: "📉", subtitle: "Slow-moving stock — great deals available", products: dedup(sections.lowSelling.data, seenInRows),  loading: sections.lowSelling.loading },
    { id: "neverSold",   title: t("home.newArrivals"),        icon: "🆕", subtitle: "Be the first to try these!",                products: dedup(sections.neverSold.data, seenInRows),   loading: sections.neverSold.loading },
    { id: "allTimeBest", title: t("home.allTimeFavourites"),  icon: "🏆", subtitle: "Consistently our best sellers",              products: dedup(sections.allTimeBest.data, seenInRows), loading: sections.allTimeBest.loading },
  ];

  const homepageCampaigns = useMemo(
    () => campaigns.filter((c) => c.showOnHomepage).sort((a, b) => a.displayOrder - b.displayOrder),
    [campaigns]
  );

  const blocks = useMemo(
    () => interleaveCampaigns(rows, homepageCampaigns),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(rows.map((r) => [r.id, r.loading, r.products.length])), homepageCampaigns]
  );

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Hero Banner */}
      <Carousel banners={settings.banners || []} />

      {/* Category Chips */}
      {!catLoading && categories.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-heading text-xl">{t("category.shopByCategory")}</h2>
            <Link href="/category" className="text-sm font-semibold text-theme-primary hover:underline">{t("category.viewAll")}</Link>
          </div>
          <HorizontalScroll className="flex-wrap max-h-[160px] overflow-hidden content-start">
            {categories.map((cat) => (
              <Link
                key={cat._id}
                href={`/category/${validURLConvert(cat.name, cat._id)}`}
                className="shrink-0 flex flex-col items-center gap-2 group"
              >
                <div className="h-16 w-16 rounded-2xl overflow-hidden bg-[var(--color-surface)] border border-theme shadow-sm group-hover:shadow-md group-hover:-translate-y-1 transition-all">
                  {cat.image
                    ? <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-gradient-to-br from-sage-100 to-sage-200" />
                  }
                </div>
                <span className="text-xs font-medium text-center max-w-[68px] line-clamp-1">{cat.name}</span>
              </Link>
            ))}
          </HorizontalScroll>
        </div>
      )}

      {/* Item 10: previously this whole section (categories + every product
          row below) rendered as nothing at all if the category fetch ended
          up empty — indistinguishable from "still loading" or "there's just
          nothing here," for a guest and a logged-in shopper alike, since
          fetchCategories() only reaches this empty state after already
          retrying a few times. Giving it one visible, actionable message
          instead of silence closes that gap. */}
      {!catLoading && categories.length === 0 && (
        <div className="text-center py-10">
          <p className="text-theme-muted mb-3">We're having trouble loading the shop right now.</p>
          <button onClick={() => window.location.reload()} className="btn-outline px-4 py-2 text-sm">
            Refresh
          </button>
        </div>
      )}

      {/* Product rows with campaigns interleaved — Fix 47: spacer blocks
          guarantee two campaigns are never rendered back-to-back. */}
      <div className="space-y-2">
        {blocks.map((block, i) => {
          if (block.type === "campaign") {
            return <CampaignSection key={`campaign-${block.campaign._id}`} campaign={block.campaign} />;
          }
          if (block.type === "spacer") {
            return <SectionSpacer key={`spacer-${i}`} />;
          }
          const { id, ...rowProps } = block.row;
          return <ProductRow key={id} {...rowProps} />;
        })}
      </div>

      {/* Submit Shopping List Banner */}
      <ShoppingListBanner settings={settings} t={t} />

      {/* FAQ Section */}
      <FaqSection faqs={settings.faq} t={t} />
    </div>
  );
}
