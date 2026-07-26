import { CardSkeletonList } from "@/components/Loading";

// Section 9 (Performance) — "Streaming"/"Suspense", same mechanism as
// product/[product]/loading.js. Matches the skeleton the old client-fetched
// page used to show while loading.
export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="skeleton h-4 w-40 rounded mb-6" />
      <div className="flex items-center gap-3 mb-6">
        <div className="skeleton h-12 w-12 rounded-xl" />
        <div className="skeleton h-8 w-48 rounded" />
      </div>
      <CardSkeletonList count={10} />
    </div>
  );
}
