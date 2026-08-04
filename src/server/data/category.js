import { cache } from "react";
import connectDb from "@/lib/mongodb";
import CategoryModel from "@/server/models/category.model";
import SubCategoryModel from "@/server/models/subcategory.model";
import ProductModel from "@/server/models/product.model";
import { extractIdFromSlug } from "@/lib/slug";
import dataCache from "@/lib/cache";
import { serializeDoc } from "@/lib/serialize";
import { buildSortOption } from "@/server/controllers/product.controller";

// Matches the old client-side fetch's own limit
// (`Axios({...api.getProductByCategory, data:{id:catId,page:1,limit:20}})`)
// exactly. Note: the OLD page computed a `hasMore` flag from this but never
// actually wired it to a "Load More" control anywhere in its JSX — so in
// the shipped app, a category with more than 20 products has always simply
// shown only the first 20, with no way to see the rest. That's a
// pre-existing gap unrelated to Performance/SEO; preserved exactly as-is
// here rather than silently "fixed" as a side effect of this pass.
//
// Bug fix (confirmed via real `npm run dev` output): the returned object
// is passed through serializeDoc() before being cached/returned — see
// lib/serialize.js and server/data/product.js's own comment for the full
// diagnosis (ObjectId/Date/Map instances surviving `.lean()`, tripping
// React's Server-to-Client Component prop-serialization check). Applies
// here too: `category.translations`/`subCategories[].translations` are
// Map fields per those models' own schemas, and every product's `_id`/
// `createdAt` needed the same fix as product.js's.
const PAGE_SIZE = 20;

export const getCategoryPageData = cache(async (slug, sortBy = "newest") => {
  const catId = extractIdFromSlug(slug);
  if (!catId) return null;

  return dataCache.getOrSet(
    // Section 11 (Category Pages — "mobile-friendly sorting") addition:
    // sortBy is now part of the cache key. Without this, selecting a
    // different sort would silently keep serving whichever order got
    // cached first for this category — a real, confusing bug (the sort
    // control would visibly change but the product order wouldn't),
    // not merely a missed optimization.
    `categoryPage:${catId}:${sortBy}`,
    async () => {
      await connectDb();
      const category = await CategoryModel.findById(catId).lean();
      if (!category) return null;

      // Matches getProductsByCategoryController's query exactly, including
      // its `publish: true` filter — getProductsByCategoryAndSubCategoryController
      // (used by the subcategory page) notably does NOT have that same
      // filter, an existing asymmetry in this codebase kept as-is on both
      // sides rather than "fixed" in only one of them as an incidental
      // side effect of this pass.
      const query = { category: { $in: [catId] }, publish: true };
      const [subCategories, products, totalCount] = await Promise.all([
        SubCategoryModel.find({ category: catId }).lean(),
        ProductModel.find(query).sort(buildSortOption(sortBy)).limit(PAGE_SIZE).lean(),
        ProductModel.countDocuments(query),
      ]);

      return serializeDoc({ category, subCategories, products, totalCount });
    },
    dataCache.TTL.MEDIUM
  );
});
