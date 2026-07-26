import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { getCategoryPageData } from "@/server/data/category";
import { validURLConvert } from "@/lib/slug";
import SafeImage from "@/components/SafeImage";
import ProductCard from "@/components/ProductCard";
import NoData from "@/components/NoData";

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

export default async function CategorySlugPage({ params }) {
  const data = await getCategoryPageData(params.slug);
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
    <div className="container mx-auto px-4 py-8">
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

      <div className="flex items-center gap-3 mb-6">
        {category.image && (
          <SafeImage src={category.image} alt={category.name} width={48} height={48} className="h-12 w-12 rounded-xl object-cover" />
        )}
        <h1 className="section-heading text-2xl md:text-3xl">{category.name}</h1>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {products.map((p) => <ProductCard key={p._id} product={p} />)}
          </div>
        )
      }
    </div>
  );
}
