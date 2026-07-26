import { cache } from "react";
import connectDb from "@/lib/mongodb";
import ProductModel from "@/server/models/product.model";
import dataCache from "@/lib/cache";
import { extractIdFromSlug } from "@/lib/slug";

// Section 9 (Performance) / Section 10 (SEO) — direct-DB-read data layer
// for Server Components, following the exact pattern already established
// in app/layout.jsx for site settings (React's cache() for within-request
// dedup between generateMetadata and the page component, layered on top
// of lib/cache.js for a real cross-request TTL cache). Bypasses
// product.controller.js entirely and on purpose: that controller is
// Express-style (req, res) and built for the client-side Axios call
// sites — a Server Component calling its own API route over HTTP would
// mean an extra self-network-hop for no benefit. This queries the same
// Mongoose model directly instead, exactly like layout.jsx already does
// for SiteSettingsModel. The existing controller/route is untouched and
// keeps serving every existing client-side call site unchanged.
//
// `.populate("category").populate("subCategory")` with no field
// restriction deliberately matches getProductDetailsController's own
// query shape exactly (see that function in product.controller.js) so
// this server-rendered path and the old client-fetched path return
// identically-shaped data — no surprise missing fields.
export const getProductBySlug = cache(async (slug) => {
  const productId = extractIdFromSlug(slug);
  if (!productId) return null;

  return dataCache.getOrSet(
    `product:${productId}`,
    async () => {
      await connectDb();
      const product = await ProductModel.findById(productId)
        .populate("category")
        .populate("subCategory")
        .lean();
      return product || null;
    },
    dataCache.TTL.MEDIUM
  );
});
