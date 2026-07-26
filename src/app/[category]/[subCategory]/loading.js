import { CardSkeletonList } from "@/components/Loading";

export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="skeleton h-4 w-56 rounded mb-6" />
      <div className="skeleton h-8 w-48 rounded mb-7" />
      <CardSkeletonList count={10} />
    </div>
  );
}
