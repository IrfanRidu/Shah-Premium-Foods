"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { FaHeart } from "react-icons/fa";
import { useGlobalContext } from "@/providers/GlobalProvider";
import NoData from "@/components/NoData";
import ProductCard from "@/components/ProductCard";

// Reuses ProductCard directly for the grid — it already has the wishlist
// heart button built in (see WishlistButton.jsx / ProductCard.jsx), so
// clicking the (already-filled, since everything here is wishlisted)
// heart removes it from here too, with zero extra code needed for that.
export default function WishlistPage() {
  const wishlistItems = useSelector((s) => s.wishlist.wishlistItems);
  const { fetchWishlist } = useGlobalContext();
  const [loading, setLoading] = useState(true);

  // Always pull the freshest wishlist when this page opens, same
  // reasoning as My Orders — the boot-time fetch could be stale by the
  // time someone actually navigates here.
  useEffect(() => {
    (async () => { await fetchWishlist(); setLoading(false); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const products = wishlistItems.map((item) => item.productId).filter(Boolean);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <FaHeart className="text-red-500" size={20} />
        <h1 className="section-heading text-2xl">My Wishlist</h1>
      </div>
      <p className="text-sm text-theme-muted mb-6">
        {products.length > 0 ? `${products.length} item${products.length === 1 ? "" : "s"} saved for later.` : "Save items you love to come back to them later."}
      </p>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square bg-[var(--color-border)] rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <NoData message="Your wishlist is empty" description="Tap the heart icon on any product to save it here." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {products.map((product) => (
            <ProductCard key={product._id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
