import { cache } from "react";
import connectDb from "@/lib/mongodb";
import ProductModel from "@/server/models/product.model";
import dataCache from "@/lib/cache";
import { extractIdFromSlug } from "@/lib/slug";
import { serializeDoc } from "@/lib/serialize";

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
//
// Bug fix (confirmed via real `npm run dev` output — this app's own
// runtime, not this sandbox, first actually exercised this code path):
// `.lean()` does NOT deep-convert ObjectId/Date/Map fields to plain
// values — `_id` (this product's own, and every populated category/
// subCategory's own) stayed a real ObjectId instance, `createdAt`/
// `updatedAt` stayed Date instances. Passing that through as props to
// this page's client components (ProductGallery, ProductPurchasePanel,
// ProductSuggestions) tripped React's "Only plain objects can be passed
// to Client Components" warning — see lib/serialize.js for the full
// diagnosis. serializeDoc() here converts the whole result once, before
// it's cached or returned, so every consumer downstream automatically
// gets clean data with no changes needed at any call site.
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
      return product ? serializeDoc(product) : null;
    },
    dataCache.TTL.MEDIUM
  );
});
