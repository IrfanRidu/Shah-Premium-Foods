import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { getCategoryPageData } from "@/server/data/category";
import { validURLConvert } from "@/lib/slug";
import SafeImage from "@/components/SafeImage";
import ProductCard from "@/components/ProductCard";
import NoData from "@/components/NoData";
import CategorySortControl from "@/components/CategorySortControl";

// Section 9 (Performance) — "ISR". Listing pages care less about
// per-second freshness than a single product's own price/stock, so this
// gets a wider window than the product page's 60s.
export const revalidate = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

export async function generateMetadata({ params }) {
  const data = await getCategoryPageData(params.slug);
  if (!data) return {};
  const { category } = data;
  const description = `Shop ${category.name} online at the best prices — fresh, quality products delivered to your door.`;
  const canonicalPath = `/category/${validURLConvert(category.name, category._id)}`;

  return {
    title: category.name, // composed into "CategoryName | SiteName" via the root layout's title template
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: category.name,
      description,
      url: canonicalPath,
      type: "website",
      ...(category.image ? { images: [category.image] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: category.name,
      description,
      ...(category.image ? { images: [category.image] } : {}),
    },
  };
}

export default async function CategorySlugPage({ params, searchParams }) {
  // Section 11 — validate against the same whitelist the backend uses
  // rather than trusting the raw query string, consistent with why
  // product.controller.js's own sortBy is whitelist-mapped rather than
  // accepted as-is (a stray/malicious query param should just silently
  // fall back to the default, not do anything unexpected).
  const VALID_SORTS = new Set(["newest", "price_asc", "price_desc", "name_asc", "name_desc"]);
  const sortBy = VALID_SORTS.has(searchParams?.sort) ? searchParams.sort : "newest";
  const data = await getCategoryPageData(params.slug, sortBy);
  if (!data) notFound();
  const { category, subCategories, products } = data;
  const nonce = (await headers()).get("x-csp-nonce") || "";
  const canonicalPath = `/category/${validURLConvert(category.name, category._id)}`;

  // Section 10 (SEO) — BreadcrumbList JSON-LD, matching the visible
  // breadcrumb UI below (which already existed on this page, unchanged).
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { name: "Home", url: "/" },
      { name: "Categories", url: "/category" },
      { name: category.name, url: canonicalPath },
    ].map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };
  // ItemList JSON-LD for the visible product grid — standard structured
  // data for a category/collection page.
  const itemListJsonLd = products.length
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: products.map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `${SITE_URL}/product/${validURLConvert(p.name, p._id)}`,
        })),
      }
    : null;

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 lg:py-8">
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c") }}
      />
      {itemListJsonLd && (
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd).replace(/</g, "\\u003c") }}
        />
      )}

      {/* Breadcrumb */}
      <div className="text-xs text-theme-muted mb-6 flex items-center gap-1.5">
        <Link href="/" className="hover:text-theme-primary">Home</Link>
        <span>/</span>
        <Link href="/category" className="hover:text-theme-primary">Categories</Link>
        <span>/</span>
        <span className="text-theme">{category.name}</span>
      </div>

      <div className="sticky top-[150px] md:top-24 z-20 -mx-3 sm:-mx-4 px-3 sm:px-4 py-2.5 mb-4 sm:mb-6 bg-[var(--color-header-bg)]/95 backdrop-blur-sm border-b border-theme flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {category.image && (
            <SafeImage src={category.image} alt={category.name} width={48} height={48} className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl object-cover shrink-0" />
          )}
          <h1 className="section-heading text-lg sm:text-2xl md:text-3xl truncate">{category.name}</h1>
        </div>
        {products.length > 0 && <CategorySortControl currentSort={sortBy} />}
      </div>

      {/* Sub-category chips */}
      {subCategories.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-7">
          {subCategories.map((sub) => (
            <Link key={sub._id}
              href={`/${validURLConvert(category.name, category._id)}/${validURLConvert(sub.name, sub._id)}`}
              className="px-4 py-1.5 rounded-full text-sm border border-theme hover:border-theme-primary hover:text-theme-primary transition-colors">
              {sub.name}
            </Link>
          ))}
        </div>
      )}

      {products.length === 0
        ? <NoData message="No products in this category" />
        : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {products.map((p) => <ProductCard key={p._id} product={p} />)}
          </div>
        )
      }
    </div>
  );
}
