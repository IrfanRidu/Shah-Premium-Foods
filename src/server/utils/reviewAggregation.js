import mongoose from "mongoose";
import ReviewModel from "../models/review.model.js";
import ProductModel from "../models/product.model.js";
import dataCache from "@/lib/cache";

// Session 4 (Rating system) — keeps Product.rating / Product.numReviews
// (denormalized, see product.model.js's own comment on those fields) in
// sync with the real, current set of PUBLISHED reviews. Called after
// every review create / rating-change update / status change (hide or
// unhide) / delete, from review.controller.js — never computed lazily
// on read, so every ProductCard grid stays a single cheap field read
// with no per-card aggregation cost.
//
// A HIDDEN review still exists in the collection (soft-moderation) but
// is deliberately excluded from this aggregation — an admin hiding a
// review must also remove its influence on the public star average,
// or "hide" would be cosmetic only.
export async function recalcProductRating(productId) {
  const objectId = new mongoose.Types.ObjectId(productId);

  const [agg] = await ReviewModel.aggregate([
    { $match: { productId: objectId, status: "published" } },
    { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);

  // Round to 1 decimal (5.0, 4.3, …) — matches how ProductCard.jsx's
  // existing star display already rounds for whole-star rendering, and
  // avoids showing a false-precision value like "4.333333333333".
  const rating = agg ? Math.round(agg.avg * 10) / 10 : 0;
  const numReviews = agg ? agg.count : 0;

  await ProductModel.findByIdAndUpdate(productId, { rating, numReviews });

  // Bust the PDP's per-product cache (see server/data/product.js /
  // lib/cache.js) so the new rating is visible on the very next page
  // load instead of waiting out that cache's TTL — same
  // invalidate-on-write discipline lib/cache.js's own header comment
  // documents for every other cached, mutable read in this app.
  await dataCache.del(`product:${productId}`);

  return { rating, numReviews };
}
