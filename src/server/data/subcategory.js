import { cache } from "react";
import connectDb from "@/lib/mongodb";
import CategoryModel from "@/server/models/category.model";
import SubCategoryModel from "@/server/models/subcategory.model";
import ProductModel from "@/server/models/product.model";
import { extractIdFromSlug } from "@/lib/slug";
import dataCache from "@/lib/cache";

// Matches the old client-side fetch's own limit exactly
// (`{...api.getProductByCategoryAndSubCategory, data:{...,page:1,limit:50}}`).
const PAGE_SIZE = 50;

// This route (app/[category]/[subCategory]/page.jsx) is a ROOT-LEVEL
// two-segment dynamic route — it matches ANY /anything/anything-else URL
// not claimed by a more specific route. The old client-rendered version
// looked up `cat`/`sub` independently and just showed an empty product
// grid (200 OK, "No products found") for anything that didn't resolve —
// meaning every malformed/guessed/bot-probed 2-segment URL was a soft-404,
// indexable junk with no real content. Returning null here (→ notFound()
// in the page) for anything that doesn't cleanly resolve is a real,
// deliberate fix, not just a refactor — it's what makes proper `notFound()`
// handling (this pass's actual ask) correct and complete for this
// particular route, including the one case the old lookup logic couldn't
// catch at all: two IDs that both exist independently but aren't actually
// related to each other.
export const getSubCategoryPageData = cache(async (catSlug, subSlug) => {
  const catId = extractIdFromSlug(catSlug);
  const subId = extractIdFromSlug(subSlug);
  if (!catId || !subId) return null;

  return dataCache.getOrSet(
    `subCategoryPage:${catId}:${subId}`,
    async () => {
      await connectDb();
      const [category, subCategory] = await Promise.all([
        CategoryModel.findById(catId).lean(),
        SubCategoryModel.findById(subId).lean(),
      ]);
      if (!category || !subCategory) return null;

      const belongsToCategory = (subCategory.category || []).some(
        (c) => (c?._id || c)?.toString() === catId
      );
      if (!belongsToCategory) return null;

      // Matches getProductsByCategoryAndSubCategoryController's query
      // exactly — notably, unlike the category page's own query, this one
      // has no `publish: true` filter in the original controller either;
      // kept as-is on both sides rather than "fixed" in only one as an
      // incidental side effect of this pass (see category.js's own note).
      const query = { category: { $in: [catId] }, subCategory: { $in: [subId] } };
      const products = await ProductModel.find(query).sort({ createdAt: -1 }).limit(PAGE_SIZE).lean();

      return { category, subCategory, products };
    },
    dataCache.TTL.MEDIUM
  );
});
