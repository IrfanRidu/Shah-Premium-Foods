import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { getProductBySlug } from "@/server/data/product";
import { validURLConvert } from "@/lib/slug";
import ProductGallery from "@/components/ProductGallery";
import ProductPurchasePanel from "@/components/ProductPurchasePanel";
import ProductPageCampaigns from "@/components/ProductPageCampaigns";
import ProductSuggestions from "@/components/ProductSuggestions";
import ReviewsSection from "@/components/ReviewsSection";
import StarRating from "@/components/StarRating";
import ShareButton from "@/components/ShareButton";
import DeliveryInfo from "@/components/DeliveryInfo";
import RecentlyViewed from "@/components/RecentlyViewed";
import FrequentlyBoughtTogether from "@/components/FrequentlyBoughtTogether";

// Section 9 (Performance) — "ISR": this used to be a fully client-rendered
// page (data fetched in a useEffect after mount, with a loading skeleton
// shown until it resolved). Now it's a Server Component that fetches the
// product directly (see server/data/product.js) and is revalidated at
// most once a minute rather than computed fresh on every single request —
// real content on first paint, no fetch-after-mount waterfall, no
// skeleton flash, and a proper cacheable response instead of one always
// recomputed from scratch. 60s balances that against price/stock staying
// reasonably current; checkout still re-validates the live price/stock
// server-side regardless of what this page displays.
export const revalidate = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

// Section 10 (SEO) — the single biggest gap this pass found: every product
// page previously shared the exact same sitewide default title/description
// (the old page had no generateMetadata at all), so none of them were
// individually indexable/shareable with their own identity. This fixes
// that with real per-product title, description, canonical, Open Graph,
// and Twitter Card metadata, all built from the actual product.
export async function generateMetadata({ params }) {
  const product = await getProductBySlug(params.product);
  if (!product) return {}; // page body's own notFound() call below 404s; nothing product-specific to add here

  const rawDescription = product.description?.trim() || `Buy ${product.name} online at the best price.`;
  const description = rawDescription.length > 160
    ? `${rawDescription.slice(0, 157).replace(/\s+\S*$/, "")}…`
    : rawDescription;
  const canonicalPath = `/product/${validURLConvert(product.name, product._id)}`;
  const images = product.image?.length ? product.image : undefined;

  return {
    // Composed by the root layout's title.template into "ProductName | SiteName".
    title: product.name,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: product.name,
      description,
      url: canonicalPath,
      // "product" isn't one of next/dist's typed openGraph.type values
      // (website/article/book/profile/music.*/video.*) — "website" is the
      // safe, well-supported choice; the richer product-specific markup
      // (price, availability, SKU) lives in the Product JSON-LD below,
      // which has full, unambiguous schema.org support for exactly that.
      type: "website",
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description,
      ...(images ? { images } : {}),
    },
  };
}

export default async function ProductPage({ params }) {
  const product = await getProductBySlug(params.product);
  if (!product) notFound();

  const images = product.image || [];
  const category = product.category?.[0];
  const canonicalPath = `/product/${validURLConvert(product.name, product._id)}`;
  const nonce = (await headers()).get("x-csp-nonce") || "";

  // Section 10 (SEO) — Product structured data. Price/currency/availability
  // straight from the same data every visitor sees (BDT is this app's
  // base currency — see store/currencySlice.js's baseCurrency — structured
  // data describes the canonical listing, not a visitor's chosen display
  // currency, same as how every major e-commerce site's Product schema
  // works regardless of client-side currency switchers).
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(images.length ? { image: images } : {}),
    ...(product.description ? { description: product.description } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}${canonicalPath}`,
      priceCurrency: "BDT",
      price: product.price,
      availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  // Section 10 (SEO) — Breadcrumbs: both the visible UI (previously absent
  // on this page entirely — category/subcategory pages already had one)
  // and the matching BreadcrumbList JSON-LD.
  const breadcrumbItems = [
    { name: "Home", url: "/" },
    ...(category ? [{ name: category.name, url: `/category/${validURLConvert(category.name, category._id)}` }] : []),
    { name: product.name, url: canonicalPath },
  ];
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 lg:py-8 space-y-5 lg:space-y-10 pb-24 lg:pb-8">
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd).replace(/</g, "\\u003c") }}
      />
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c") }}
      />

      {/* Breadcrumb UI */}
      <nav aria-label="Breadcrumb" className="text-sm text-theme-muted flex items-center gap-1.5 flex-wrap -mb-4">
        {breadcrumbItems.map((item, i) => (
          <span key={item.url} className="flex items-center gap-1.5">
            {i > 0 && <span className="opacity-50">/</span>}
            {i === breadcrumbItems.length - 1
              ? <span className="text-theme font-medium">{item.name}</span>
              : <Link href={item.url} className="hover:text-theme-primary transition-colors">{item.name}</Link>
            }
          </span>
        ))}
      </nav>

      {/* Product detail grid */}
      <div className="grid md:grid-cols-2 gap-5 lg:gap-16 lg:items-start">
        <ProductGallery images={images} productId={product._id} productName={product.name} />

        {/* Info */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {product.category?.map((c) => <span key={c._id} className="badge">{c.name}</span>)}
            </div>
            {/* Session 4: Share — placed here (not inside
                ProductPurchasePanel's desktop-only CTA row) specifically
                so it's reachable at every screen size, not just lg: up. */}
            <ShareButton title={product.name} className="border border-theme shrink-0" />
          </div>

          <h1 className="font-display text-2xl md:text-3xl font-bold leading-snug">{product.name}</h1>

          {/* Session 4: rating summary link — only shown once the product
              has at least one real review, same "don't show a hollow
              zero-star row" reasoning as ProductCard.jsx's own rating
              block. Plain <a href="#reviews"> rather than an onClick
              handler — this is a Server Component, and an anchor link
              needs no client JS at all to work correctly here. */}
          {typeof product.rating === "number" && product.rating > 0 && (
            <a href="#reviews" className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity w-fit">
              <StarRating value={product.rating} size={15} />
              <span className="text-sm text-theme-muted underline underline-offset-2">
                {product.numReviews} review{product.numReviews !== 1 ? "s" : ""}
              </span>
            </a>
          )}

          {product.unit && <p className="text-sm text-theme-muted">Unit: {product.unit}</p>}
          {product.sku  && <p className="text-xs text-theme-muted font-mono">SKU: {product.sku}</p>}

          {/* Purchase panel + Delivery info — Phase 8 (user-reported:
              "these two sections take too much space, could be side by
              side"). Side-by-side from lg: up (1024px+) — enough width
              for two sub-columns even nested inside this already
              -halved info column; stacked below that, including on
              mobile, where two narrow columns would cramp the quantity
              selector + button row. `lg:space-y-0` cancels the mobile
              `space-y-4` stacking gap once grid's own `gap-6` takes
              over, so the two spacing mechanisms don't both apply at
              once. Phase 11 (user-reported: "very close... almost
              overlapping"): gap widened from gap-4 to gap-6 for more
              breathing room between the two cards — the flex-wrap CTA
              row mentioned in an earlier version of this comment turned
              out to wrap in a way that looked cramped rather than clean
              at this column's real width; see ProductPurchasePanel.jsx
              for the actual button-layout fix (stacked instead of
              wrapped). */}
          <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-4 lg:space-y-0">
            <div className="lg:bg-theme-surface lg:border lg:border-theme lg:rounded-2xl lg:p-5 lg:shadow-sm">
              <ProductPurchasePanel product={product} />
            </div>

            <DeliveryInfo />
          </div>

          {/* Description */}
          {product.description && (
            <div className="border-t border-theme pt-4">
              <h3 className="font-semibold mb-2">Description</h3>
              <p className="text-sm text-theme-muted leading-relaxed whitespace-pre-line">{product.description}</p>
            </div>
          )}

          {/* Specifications — Phase 8 (user-reported: "not enough product
              details shown"). The old "More Details" block only rendered
              when the admin had filled in custom more_details entries —
              a product with none of those showed almost nothing below
              its description. This consolidates every specification
              -type field the model actually has (category, sub-category
              — previously not shown ANYWHERE on this page at all —
              availability) with whatever more_details entries exist,
              into one section that shows whenever there's at least one
              real fact to display, not only when the free-form fields
              happen to be populated.
              Phase 9 (user-reported): Unit and SKU deliberately NOT
              repeated here — they already appear right under the product
              title above, and showing them a second time here was
              genuine, confirmed duplication, not two different pieces of
              information. */}
          {(product.category?.length > 0 ||
            product.subCategory?.length > 0 ||
            Object.keys(product.more_details || {}).length > 0) && (
            <div className="border-t border-theme pt-4">
              <h3 className="font-semibold mb-3">Specifications</h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 sm:gap-y-2 text-sm">
                {product.category?.length > 0 && (
                  <div>
                    <dt className="text-theme-muted">Category</dt>
                    <dd className="font-medium">{product.category.map((c) => c.name).filter(Boolean).join(", ")}</dd>
                  </div>
                )}
                {product.subCategory?.length > 0 && (
                  <div>
                    <dt className="text-theme-muted">Sub-category</dt>
                    <dd className="font-medium">{product.subCategory.map((c) => c.name).filter(Boolean).join(", ")}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-theme-muted">Availability</dt>
                  <dd className="font-medium">{product.stock > 0 ? "In Stock" : "Out of Stock"}</dd>
                </div>
                {Object.entries(product.more_details || {}).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-theme-muted capitalize">{k}</dt>
                    <dd className="font-medium">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* Ratings & Reviews (Session 4) — Phase 9 (user-reported): moved to
          appear immediately after the product details grid closes above,
          ahead of Campaigns — was previously sequenced after campaigns. */}
      <div className="border-t border-theme pt-6 lg:pt-10">
        <ReviewsSection productId={product._id} />
      </div>

      {/* Campaign sections relevant to this product page */}
      <ProductPageCampaigns />

      {/* Frequently Bought Together (Session 4) — real co-purchase data,
          still specific to THIS product, sequenced before the broader
          "Similar Products" discovery row below. */}
      <FrequentlyBoughtTogether productId={product._id} />

      {/* Similar Products */}
      <ProductSuggestions productId={product._id} />

      {/* Recently Viewed (Session 4) — personal browsing history, the
          most general/least product-specific section, sequenced last. */}
      <RecentlyViewed excludeProductId={product._id} />
    </div>
  );
}
