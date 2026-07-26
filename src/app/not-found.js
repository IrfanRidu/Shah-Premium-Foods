import Link from "next/link";
import { FaSearch, FaHome } from "react-icons/fa";

// Section 10 (SEO): pairs with the new notFound() calls in
// product/[product]/page.jsx (and the category/subcategory pages next in
// this pass) — Next.js renders this for any route that calls notFound(),
// with a real 404 HTTP status. Without this file Next falls back to its
// own bare default 404 UI, which works but isn't branded; this one is
// deliberately simple (no data fetching, no client state) so it can never
// itself be the thing that fails.
export const metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="container mx-auto px-4 py-24 text-center">
      <p className="font-display text-6xl font-bold text-theme-primary mb-4">404</p>
      <h1 className="section-heading text-2xl mb-2">We couldn't find that page</h1>
      <p className="text-theme-muted mb-8 max-w-md mx-auto">
        The page you're looking for may have been moved, renamed, or no longer exists.
      </p>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <Link href="/" className="btn-primary px-5 py-2.5 text-sm inline-flex items-center gap-2">
          <FaHome size={14} /> Back to Home
        </Link>
        <Link href="/search" className="btn-outline px-5 py-2.5 text-sm inline-flex items-center gap-2">
          <FaSearch size={14} /> Search Products
        </Link>
      </div>
    </div>
  );
}
