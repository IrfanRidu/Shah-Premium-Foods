import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { getSubCategoryPageData } from "@/server/data/subcategory";
import { validURLConvert } from "@/lib/slug";
import ProductCard from "@/components/ProductCard";
import NoData from "@/components/NoData";

export const revalidate = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

export async function generateMetadata({ params }) {
  const data = await getSubCategoryPageData(params.category, params.subCategory);
  if (!data) return {};
  const { category, subCategory } = data;
  const description = `Shop ${subCategory.name} in ${category.name} — fresh, quality products delivered to your door.`;
  const canonicalPath = `/${validURLConvert(category.name, category._id)}/${validURLConvert(subCategory.name, subCategory._id)}`;

  return {
    title: `${subCategory.name} — ${category.name}`,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: subCategory.name,
      description,
      url: canonicalPath,
      type: "website",
      ...(subCategory.image ? { images: [subCategory.image] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: subCategory.name,
      description,
      ...(subCategory.image ? { images: [subCategory.image] } : {}),
    },
  };
}

export default async function SubCategoryProductPage({ params }) {
  const data = await getSubCategoryPageData(params.category, params.subCategory);
  if (!data) notFound();
  const { category, subCategory, products } = data;
  const nonce = (await headers()).get("x-csp-nonce") || "";
  const categoryPath = `/category/${validURLConvert(category.name, category._id)}`;
  const canonicalPath = `/${validURLConvert(category.name, category._id)}/${validURLConvert(subCategory.name, subCategory._id)}`;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { name: "Home", url: "/" },
      { name: "Categories", url: "/category" },
      { name: category.name, url: categoryPath },
      { name: subCategory.name, url: canonicalPath },
    ].map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };
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

      <div className="text-xs text-theme-muted mb-6 flex items-center gap-1.5 flex-wrap">
        <Link href="/" className="hover:text-theme-primary">Home</Link>
        <span>/</span>
        <Link href="/category" className="hover:text-theme-primary">Categories</Link>
        <span>/</span>
        <Link href={categoryPath} className="hover:text-theme-primary">{category.name}</Link>
        <span>/</span>
        <span className="text-theme">{subCategory.name}</span>
      </div>

      <h1 className="section-heading text-2xl md:text-3xl mb-7">{subCategory.name}</h1>

      {products.length === 0
        ? <NoData message="No products found" description="Try a different category or sub-category" />
        : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {products.map((p) => <ProductCard key={p._id} product={p} />)}
          </div>
        )
      }
    </div>
  );
}
