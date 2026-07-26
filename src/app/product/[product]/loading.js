// Section 9 (Performance) — "Streaming" / "Suspense". A loading.js file in
// a route segment is automatically wrapped in a Suspense boundary by the
// App Router — purely additive, no changes needed to page.jsx itself. This
// mirrors the exact skeleton the old client-rendered page used to show
// while its useEffect fetch was in flight, so the visual result during a
// slow request is unchanged; the difference is *why* it can appear at
// all now — the page below is an async Server Component (see
// server/data/product.js), and this is what streams to the browser
// immediately while that data is still being fetched, instead of the
// browser sitting on a blank tab.
export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid md:grid-cols-2 gap-8">
        <div className="skeleton aspect-square rounded-2xl" />
        <div className="space-y-4">
          <div className="skeleton h-8 w-3/4 rounded" />
          <div className="skeleton h-5 w-1/4 rounded" />
          <div className="skeleton h-6 w-1/2 rounded" />
          <div className="skeleton h-12 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
