"use client";
import { useEffect, useMemo, useState, memo } from "react";
import { useSelector } from "react-redux";
import Link from "next/link";
import Carousel from "@/components/Carousel";
import ProductCard from "@/components/ProductCard";
import CampaignSection from "@/components/CampaignSection";
import HorizontalScroll from "@/components/HorizontalScroll";
import ProductGridOrScroll from "@/components/ProductGridOrScroll";
import SafeImage from "@/components/SafeImage";
import { CardSkeleton } from "@/components/Loading";
import { validURLConvert } from "@/lib/utils";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { MIN_HOMEPAGE_ROW_SIZE } from "@/lib/recommendationConfig";
import { FaListUl, FaChevronDown, FaChevronUp, FaShoppingBasket } from "react-icons/fa";

// Product row section.
// Section 9 (Performance): memoized — the homepage renders several of
// these (trending/bestselling/new-arrivals/etc, see HomePage below), each
// backed by its OWN independent fetch/state. Without memo, every row
// re-renders whenever ANY of them updates (they're all children of the
// same HomePage component), even though only one row's `products`/`loading`
// actually changed.
//
// Session 5 (user-reported, with screenshots: "Currently Trending" /
// "Best Selling" / "All-Time Favourites" showing only 2-4 products with a
// large empty gap where a full row should be). THIS is the component
// those screenshots actually show — a prior round fixed the same visual
// bug in CampaignSection.jsx/ProductSuggestions.jsx/RecentlyViewed.jsx/
// FrequentlyBoughtTogether.jsx but never reached this one, since it lives
// directly in page.jsx under a different name. Now routed through the
// same shared `ProductGridOrScroll` those use, so a short list renders as
// a full-looking adaptive grid instead of a few fixed-width cards
// stranded in an otherwise-empty scroll row. Loading skeletons are left
// on the original HorizontalScroll pattern deliberately — the eventual
// item count isn't known yet while loading, and these rows are fetched
// with limit:20 (see HomePage below) so a scroll row is the more common
// steady state to skeleton-match against.
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
      {loading ? (
        <HorizontalScroll>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shrink-0 w-44 sm:w-52"><CardSkeleton /></div>
          ))}
        </HorizontalScroll>
      ) : (
        <ProductGridOrScroll
          items={products}
          renderItem={(p) => <ProductCard product={p} />}
        />
      )}
    </section>
  );
}
const MemoProductRow = memo(ProductRow);

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
  const [showAll, setShowAll] = useState(false);
  if (!faqs || faqs.length === 0) return null;
  const sorted = [...faqs].sort((a, b) => (a.order || 0) - (b.order || 0));
  const hiddenCount = Math.max(0, sorted.length - 2);
  return (
    <section className="py-6 sm:py-8">
      <div className="mb-4 sm:mb-6 text-center">
        <h2 className="section-heading text-xl sm:text-2xl mb-1">{t("faq.title")}</h2>
        <p className="text-sm text-theme-muted">{t("faq.subtitle")}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted.map((faq, i) => (
          // Requirement: only 2 questions visible by default on mobile, rest
          // expandable manually. `hidden sm:block` keeps every FAQ in the DOM
          // (so search engines still index the full content — matters given
          // the SEO work already done elsewhere in this project) while only
          // hiding items 3+ visually below the sm breakpoint, and only until
          // showAll is toggled. Desktop (sm+) always shows everything,
          // regardless of showAll — this is a mobile-only restriction.
          <div key={faq._id || faq.question} className={i >= 2 && !showAll ? "hidden sm:block" : ""}>
            <FaqItem question={faq.question} answer={faq.answer} />
          </div>
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="sm:hidden mx-auto mt-3 flex items-center justify-center gap-1.5 min-h-11 px-4 text-sm font-semibold text-theme-primary active:opacity-70 w-full"
          aria-expanded={showAll}
        >
          {showAll ? "Show less" : `Show ${hiddenCount} more question${hiddenCount > 1 ? "s" : ""}`}
          <FaChevronDown className={`text-xs transition-transform duration-200 ${showAll ? "rotate-180" : ""}`} />
        </button>
      )}
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
  const sessionId  = useSelector((s) => s.activity.sessionId);

  // Session 8, Phase 9-10 (new personalized recommendation system).
  // Section keys renamed to match the new backend's own naming
  // (lowSelling→clearance, neverSold→newArrivals, allTimeBest→
  // allTimeFavourites — spec Section 29's exact naming) plus 6 new
  // personalized/promotional sections.
  const EMPTY_SECTIONS = {
    trending: [], forYou: [], becauseYouViewed: [], hotDeals: [], bestSelling: [],
    basedOnSearch: [], clearance: [], newArrivals: [], flashSale: [], allTimeFavourites: [], continueShopping: [],
  };
  const [sections, setSections] = useState(() => {
    const init = {};
    for (const key of Object.keys(EMPTY_SECTIONS)) init[key] = { data: [], loading: true };
    return init;
  });
  // [ADDED] Backend-supplied leftover candidate pool (see
  // backfillHomepageSections/backfillHomepageRows on the server, and
  // MIN_HOMEPAGE_ROW_SIZE's own comment in recommendationConfig.js) used
  // below for this component's OWN top-up pass — the one exclusion only
  // the frontend can see is which products are in a currently-shown
  // homepage campaign (`usedProductIds`, computed further down), so the
  // backend's own backfill can't fully guarantee 7 on its own.
  const [reservePool, setReservePool] = useState([]);

  // Spec Section 36 (error handling) — this exact fallback list ("If the
  // recommendation API fails, fallback to: Trending, Best Selling, New
  // Arrivals, Hot Deals... the homepage should still load normally...
  // do not display a large error message") is also, not coincidentally,
  // the single most effective risk mitigation available for wiring a
  // brand-new backend pipeline (Phases 3-8, verified only against mocked
  // data in this sandbox — never a real database) into the live
  // homepage: if anything in that pipeline breaks in a way this sandbox
  // couldn't catch, the page degrades to EXACTLY what it already was
  // before this session (the proven Session 6-7 path), not to a broken
  // one. Tried first, not "tried, and if the shape looks odd also fall
  // back" — any thrown error OR a response that doesn't parse as
  // expected takes the same fallback path, since a malformed-but-200
  // response is just as unusable as a real network failure here.
  useEffect(() => {
    (async () => {
      try {
        const r = await Axios({ ...api.getHomepageRecommendations, params: { sessionId } });
        const d = r.data?.data;
        if (!d || typeof d !== "object") throw new Error("malformed recommendation response");
        const next = {};
        for (const key of Object.keys(EMPTY_SECTIONS)) next[key] = { data: d[key] || [], loading: false };
        setSections(next);
        setReservePool(d.reservePool || []);
      } catch {
        try {
          const r2 = await Axios({ ...api.getHomepageRows, params: { limit: 40 } });
          const d2 = r2.data?.data || {};
          setSections({
            trending:          { data: d2.trending    || [], loading: false },
            bestSelling:       { data: d2.bestSelling || [], loading: false },
            clearance:         { data: d2.lowSelling  || [], loading: false },
            newArrivals:       { data: d2.neverSold   || [], loading: false },
            allTimeFavourites: { data: d2.allTimeBest || [], loading: false },
            hotDeals:          { data: d2.hotDeals    || [], loading: false },
            // The 5 genuinely personalized/promotional sections have no
            // equivalent in this older endpoint — left empty, correctly
            // hidden by ProductRow's own existing empty-state handling
            // (spec Section 37), not shown as broken/errored.
            forYou: { data: [], loading: false }, becauseYouViewed: { data: [], loading: false },
            basedOnSearch: { data: [], loading: false }, flashSale: { data: [], loading: false },
            continueShopping: { data: [], loading: false },
          });
          setReservePool(d2.reservePool || []);
        } catch {
          // Both the new pipeline AND the old, previously-rock-solid
          // fallback failed (e.g. a genuine DB outage) — clear every
          // loading flag so ProductRow stops showing skeletons forever,
          // without fabricating an error banner (Section 36: "do not
          // display a large error message to customers").
          const cleared = {};
          for (const key of Object.keys(EMPTY_SECTIONS)) cleared[key] = { data: [], loading: false };
          setSections(cleared);
          setReservePool([]);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Session 7 (user-reported correction to Session 6's own approach):
  // "i asked for no duplicate products in a single page but i can see
  // single product displaying more than once — no products should be
  // displayed twice in a single page." Session 6 added `fillToMinimum`
  // right here, which explicitly reused a product an earlier row had
  // already claimed when a later row fell short of the target — exactly
  // the behavior now being reported as a bug. That was a deliberate
  // tradeoff at the time (full rows > strict uniqueness), but the user
  // has now made the priority explicit the other way: no duplicate
  // ANYWHERE on the page is the hard rule; a full row is the goal to
  // reach WITHOUT breaking that rule, not a reason to bend it.
  // `fillToMinimum` is gone — `dedup` below is the only pass now, and it
  // structurally cannot produce a duplicate (every id it accepts goes
  // into `seenInRows`, and nothing already in that set is ever accepted
  // again). The real fix for "rows still too empty" is above: a much
  // bigger real candidate pool (limit 20→40) for this strict dedup to
  // draw genuine, never-shown-elsewhere uniques from, rather than
  // relaxing the uniqueness rule to compensate for too small a pool. A
  // row legitimately shows fewer than 5 only when the catalog itself
  // doesn't contain 5 more unique, not-yet-shown products for that
  // specific row's own criteria — which is the honest, correct outcome
  // once "never duplicate" is a hard constraint, not a bug to paper over.
  // Session 8, Phase 9-10: `dedup` extended with an `exempt` flag for
  // continueShopping — spec Section 26's own named exception ("allow the
  // same product in a highly relevant section such as Continue
  // Shopping"), mirroring the identical exemption
  // homepageRecommendationService.js already applies server-side
  // (DIVERSITY_EXEMPT_SECTIONS). Every other row keeps the exact same
  // strict, structurally-duplicate-proof behavior from Session 7.
  const dedup = (products, seen, exempt = false) => {
    const result = [];
    for (const p of products) {
      const id = p._id?.toString();
      if (!exempt && (seen.has(id) || usedProductIds.has(id))) continue;
      result.push(p);
      if (!exempt) seen.add(id);
    }
    return result;
  };

  const seenInRows = new Set();
  // Same order homepageRecommendationService.js processes sections in
  // server-side (spec Section 29's own response-key order) — kept
  // consistent between the two paths so which row "wins" a
  // contested product doesn't depend on which path happened to serve a
  // given request. Titles/icons for the 6 new sections are plain
  // English, deliberately NOT routed through the existing `t()` i18n
  // system yet — a documented scope boundary (see PROGRESS_TRACKER.md),
  // not an oversight; the 5 original sections' i18n calls are
  // untouched either way.
  const rowDefs = [
    { id: "trending",          title: t("home.trending"),         icon: "🔥", subtitle: "What customers are buzzing about this week", section: sections.trending          },
    { id: "forYou",             title: "Recommended For You",      icon: "✨", subtitle: "Picked based on your activity",              section: sections.forYou            },
    { id: "becauseYouViewed",   title: "Because You Viewed",       icon: "👀", subtitle: "More like what you've been looking at",       section: sections.becauseYouViewed  },
    { id: "hotDeals",           title: "Hot Deals",                icon: "🏷️", subtitle: "Deep discounts, while they last",             section: sections.hotDeals          },
    { id: "bestSelling",        title: t("home.bestSelling"),      icon: "⭐", subtitle: "Top movers in the last 30 days",              section: sections.bestSelling       },
    { id: "basedOnSearch",      title: "Based on Your Searches",   icon: "🔍", subtitle: "Related to what you've searched for",         section: sections.basedOnSearch     },
    { id: "clearance",          title: t("home.clearance"),        icon: "📉", subtitle: "Slow-moving stock — great deals available",   section: sections.clearance         },
    { id: "newArrivals",        title: t("home.newArrivals"),      icon: "🆕", subtitle: "Be the first to try these!",                  section: sections.newArrivals       },
    { id: "flashSale",          title: "Flash Sale",               icon: "⚡", subtitle: "Limited-time offers",                         section: sections.flashSale         },
    { id: "allTimeFavourites",  title: t("home.allTimeFavourites"),icon: "🏆", subtitle: "Consistently our best sellers",               section: sections.allTimeFavourites },
    { id: "continueShopping",   title: "Continue Shopping",        icon: "🛒", subtitle: "Pick up where you left off",                  section: sections.continueShopping  },
  ];
  const rows = rowDefs.map((r) => ({
    id: r.id, title: r.title, icon: r.icon, subtitle: r.subtitle,
    products: dedup(r.section.data, seenInRows, r.id === "continueShopping"),
    loading: r.section.loading,
  }));

  // [ADDED] User-reported: "some product rows have only one or two
  // products — every row must have at least 7." Root cause and the main
  // fix are server-side (see MIN_HOMEPAGE_ROW_SIZE's comment in
  // recommendationConfig.js) — both API paths already backfill a thin
  // section before this data ever reaches the browser. This pass exists
  // for the one thing only the frontend can see: `usedProductIds` right
  // above (homepage-campaign exclusion) can still trim an
  // already-backfilled row back down, since neither backend path knows
  // which campaigns are currently flagged to show on THIS homepage load.
  // Draws only from `reservePool` — the leftover the backend already
  // excluded every shown product from — and still runs every candidate
  // through the exact same two exclusion checks `dedup` above uses, so
  // this can't introduce a duplicate any more than dedup itself can.
  // A row that is genuinely empty (0 products) is left alone: that's
  // correct, existing behaviour (e.g. a guest with no browsing history
  // for a personalized section), not the bug being fixed. continueShopping
  // is skipped for the same reason `dedup` exempts it differently — it's
  // literal cart contents, not a recommendation, so padding it with
  // unrelated products would misrepresent what's actually in the cart.
  let reserveIdx = 0;
  for (const row of rows) {
    if (row.id === "continueShopping") continue;
    if (row.products.length === 0 || row.products.length >= MIN_HOMEPAGE_ROW_SIZE) continue;
    while (row.products.length < MIN_HOMEPAGE_ROW_SIZE && reserveIdx < reservePool.length) {
      const candidate = reservePool[reserveIdx];
      reserveIdx++;
      const id = candidate?._id?.toString();
      if (!id || seenInRows.has(id) || usedProductIds.has(id)) continue;
      row.products.push(candidate);
      seenInRows.add(id);
    }
  }

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
    <div className="container mx-auto px-3 sm:px-4 py-4 lg:py-6 space-y-4 lg:space-y-6">
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
                <div className="relative h-16 w-16 rounded-2xl overflow-hidden bg-[var(--color-surface)] border border-theme shadow-sm group-hover:shadow-md group-hover:-translate-y-1 transition-all">
                  {cat.image
                    ? <SafeImage src={cat.image} alt={cat.name} fill sizes="64px" className="object-cover" />
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
          return <MemoProductRow key={id} {...rowProps} />;
        })}
      </div>

      {/* Submit Shopping List Banner */}
      <ShoppingListBanner settings={settings} t={t} />

      {/* FAQ Section */}
      <FaqSection faqs={settings.faq} t={t} />
    </div>
  );
}
