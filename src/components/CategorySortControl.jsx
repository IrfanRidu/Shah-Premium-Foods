"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import SortDropdown from "@/components/SortDropdown";

// Section 11 (Category Pages — "mobile-friendly sorting") on a Server
// Component page: category/[slug]/page.jsx fetches data server-side
// (a deliberate Section 9 RSC conversion — see that page's own comments)
// and can't hold client-side useState sort state without either
// converting the whole page to a Client Component (losing the SEO/
// performance benefit that conversion specifically bought) or fetching
// the product grid client-side as a second round-trip after the page
// already loaded (a real regression: slower, and a content flash).
//
// Encoding sort in the URL (?sort=price_asc) avoids both — this small
// client island updates the URL, Next.js re-invokes the Server Component
// with the new searchParams, and getCategoryPageData (now sort-aware,
// see server/data/category.js) returns the right order. Each distinct
// sort value becomes its own independently cacheable page variant, which
// is the standard, supported Next.js App Router pattern for exactly this.
export default function CategorySortControl({ currentSort }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleChange = (value) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "newest") params.delete("sort"); // keep the default URL clean
    else params.set("sort", value);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  return (
    <div className={isPending ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <SortDropdown value={currentSort} onChange={handleChange} />
    </div>
  );
}
