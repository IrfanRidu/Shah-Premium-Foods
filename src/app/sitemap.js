import connectDb from "@/lib/mongodb";
import ProductModel from "@/server/models/product.model";
import CategoryModel from "@/server/models/category.model";
import SubCategoryModel from "@/server/models/subcategory.model";
import { validURLConvert } from "@/lib/slug";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

// Fix 9: Next.js serves whatever this default export returns as a properly
// formatted /sitemap.xml automatically — no manual XML string-building or
// custom route needed.
export default async function sitemap() {
  await connectDb();

  const [products, categories, subCategories] = await Promise.all([
    ProductModel.find({ publish: true }).select("name updatedAt").sort({ updatedAt: -1 }).limit(5000),
    CategoryModel.find({}).select("name updatedAt"),
    // Section 10 (SEO): subcategory pages (/[category]/[subCategory]) were
    // real, crawlable, indexable routes that simply never appeared in the
    // sitemap at all — an outright gap, not a design choice. `.populate`
    // only "category" (not the full document) since that's all that's
    // needed to build each URL's category-slug segment.
    SubCategoryModel.find({}).select("name updatedAt category").populate("category", "name"),
  ]);

  const staticEntries = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/products`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/category`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/sitemap`, changeFrequency: "monthly", priority: 0.3 },
  ].map((e) => ({ ...e, lastModified: new Date() }));

  const categoryEntries = categories.map((c) => ({
    url: `${SITE_URL}/category/${validURLConvert(c.name, c._id)}`,
    lastModified: c.updatedAt || new Date(),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // A sub-category only produces a URL for each parent category it
  // actually belongs to — matches how the real route
  // /[category]/[subCategory]/page.jsx resolves it (a sub-category can
  // belong to more than one category; `category` is populated as an
  // array on the model — see subcategory.model.js).
  const subCategoryEntries = subCategories.flatMap((s) =>
    (s.category || []).map((c) => ({
      url: `${SITE_URL}/${validURLConvert(c.name, c._id)}/${validURLConvert(s.name, s._id)}`,
      lastModified: s.updatedAt || new Date(),
      changeFrequency: "weekly",
      priority: 0.65,
    }))
  );

  const productEntries = products.map((p) => ({
    url: `${SITE_URL}/product/${validURLConvert(p.name, p._id)}`,
    lastModified: p.updatedAt || new Date(),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticEntries, ...categoryEntries, ...subCategoryEntries, ...productEntries];
}

// Section 9 (Performance) — "ISR" / "Route cache". Previously
// `force-dynamic`: recomputed from the live database on literally every
// single request, including every crawler hit — sitemaps don't need
// millisecond freshness, crawlers themselves typically only re-fetch a
// sitemap every so often anyway. `revalidate` still keeps this
// database-backed (never a stale build-time snapshot, the original
// concern that justified force-dynamic) while capping the worst-case
// staleness at 1 hour instead of recomputing on every request — a real
// reduction in DB load for a resource that's fetched often and doesn't
// need to be that fresh.
export const revalidate = 3600;
