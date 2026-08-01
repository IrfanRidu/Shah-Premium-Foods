// ─────────────────────────────────────────────────────────────────────────
// Bug fix (reported via real runtime output — first actual `npm run dev`
// this project has seen since Sections 9/10 introduced Server Components):
//
//   "Warning: Only plain objects can be passed to Client Components from
//   Server Components. Objects with toJSON methods are not supported...
//   [{buffer: ...}]"
//
// Root cause: Mongoose's `.lean()` strips the Document wrapper (methods,
// getters, virtuals) but does NOT deep-convert every BSON-typed field —
// `_id` and any populated reference's own `_id` remain real ObjectId
// instances (that `{buffer: ...}` in the warning is literally an
// ObjectId's internal 12-byte representation), `createdAt`/`updatedAt`
// remain Date instances, and this app's `translations` fields
// (category/subCategory models) remain Map instances. None of those are
// "plain objects," which is specifically what React Server Components'
// serialization protocol requires for anything crossing from a Server
// Component into a Client Component's props — server/data/product.js,
// category.js, and subcategory.js all fetch data this way and hand it to
// client components (ProductCard, ProductGallery, ProductPurchasePanel,
// ProductSuggestions), so this was a real, live bug, not a theoretical
// one — confirmed by the person actually running `npm run dev`, which
// this sandbox has no way to do itself.
//
// Fix: call this once on whatever a data-fetcher is about to return,
// before it's cached or handed to any component. Every ObjectId becomes
// its hex string (exactly what the JSON API layer was already producing
// for the very same fields via a normal fetch — see the note in
// ProductPurchasePanel.jsx's buy-now cart comparison below for a second,
// related bug this same fix resolves as a side effect), every Date
// becomes an ISO string, every Map becomes a plain object.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Recursively converts a Mongoose `.lean()` result (or any object graph
 * that might contain ObjectId/Date/Map instances) into a plain,
 * JSON-safe value.
 */
export function serializeDoc(value) {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map(serializeDoc);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Map) {
    const obj = {};
    for (const [k, v] of value.entries()) obj[k] = serializeDoc(v);
    return obj;
  }

  if (typeof value === "object") {
    // ObjectId (Mongoose re-exports the `bson` package's implementation) —
    // detected via toHexString rather than an instanceof check, since
    // that method is specific and reliable without this file needing to
    // import mongoose/bson itself just to do a type check.
    if (typeof value.toHexString === "function") {
      return value.toHexString();
    }

    const proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      // Plain object (or a lean-ed Mongoose subdocument, which looks
      // identical to one) — recurse into its own keys.
      const out = {};
      for (const key of Object.keys(value)) out[key] = serializeDoc(value[key]);
      return out;
    }

    // Anything else object-shaped and non-plain (Decimal128, Buffer,
    // etc.) — fall back to its own JSON/string representation rather
    // than risk passing the exotic instance through unconverted.
    if (typeof value.toJSON === "function") return value.toJSON();
    if (typeof value.toString === "function") return value.toString();
    return value;
  }

  return value; // string, number, boolean — already safe
}
