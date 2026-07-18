import connectDb from "@/lib/mongodb";
import ProductModel from "@/server/models/product.model";
import CategoryModel from "@/server/models/category.model";
import { validURLConvert } from "@/lib/utils";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

// Fix 9: Next.js serves whatever this default export returns as a properly
// formatted /sitemap.xml automatically — no manual XML string-building or
// custom route needed. Runs at request time (see `dynamic` export below),
// so it always reflects the current catalog rather than a stale build-time
// snapshot.
export default async function sitemap() {
  await connectDb();

  const [products, categories] = await Promise.all([
    ProductModel.find({ publish: true }).select("name updatedAt").sort({ updatedAt: -1 }).limit(5000),
    CategoryModel.find({}).select("name updatedAt"),
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

  const productEntries = products.map((p) => ({
    url: `${SITE_URL}/product/${validURLConvert(p.name, p._id)}`,
    lastModified: p.updatedAt || new Date(),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticEntries, ...categoryEntries, ...productEntries];
}

// Always regenerate from the live database rather than caching a stale
// build-time snapshot — same reasoning as Fix 3's route-caching fix.
export const dynamic = "force-dynamic";
