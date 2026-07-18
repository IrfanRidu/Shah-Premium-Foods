"use client";
export function CardSkeleton() {
  return (
    <div className="bg-[var(--color-surface)] border border-theme rounded-2xl overflow-hidden">
      <div className="skeleton aspect-square" />
      <div className="p-3 space-y-2">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="skeleton h-4 w-1/3 rounded" />
        <div className="skeleton h-8 w-full rounded-full mt-1" />
      </div>
    </div>
  );
}

export function CardSkeletonList({ count = 8 }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {Array.from({ length: count }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  );
}

export function FullPageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-3 border-[var(--color-border)] border-t-[var(--color-primary)] rounded-full animate-spin" />
        <p className="text-sm text-theme-muted">Loading…</p>
      </div>
    </div>
  );
}
