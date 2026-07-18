"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSelector } from "react-redux";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import ProductCard from "@/components/ProductCard";
import CampaignSection from "@/components/CampaignSection";
import { CardSkeleton } from "@/components/Loading";
import HorizontalScroll from "@/components/HorizontalScroll";

export default function BannerPage() {
  const { id }    = useParams();
  const params    = useSearchParams();
  const type      = params.get("type"); // "campaign" | "products" | null (= default/all)
  const settings  = useSelector((s) => s.siteSettings);
  const campaigns = useSelector((s) => s.campaign.campaigns);

  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [allProducts,      setAllProducts]      = useState([]);
  const [allCampaigns,     setAllCampaigns]     = useState([]);
  const [loading,          setLoading]          = useState(true);

  // Find the banner that corresponds to this id
  const banner = settings.banners?.find((b) => b._id === id || b.campaignId === id);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        if (type === "campaign") {
          // Show the specific campaign first, then all other products
          const camFound = campaigns.find((c) => c._id === id || c._id === banner?.campaignId);
          if (camFound) setAllCampaigns([camFound]);
        } else if (banner?.productIds?.length) {
          // Show specific products selected for this banner
          const promises = banner.productIds.map((pid) =>
            Axios({ ...api.getProductDetails, data: { productId: pid } }).then((r) => r.data?.data)
          );
          const prods = (await Promise.all(promises)).filter(Boolean);
          setFeaturedProducts(prods);
        }

        // Always load all products below
        const r = await Axios({ ...api.getProduct, data: { page: 1, limit: 48 } });
        setAllProducts(r.data?.data?.data || []);
      } catch {} finally { setLoading(false); }
    })();
  }, [id, type, banner, campaigns]);

  const title = banner?.title || "Featured Products";

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="section-heading text-3xl">{title}</h1>
        {banner?.subtitle && <p className="text-theme-muted mt-1">{banner.subtitle}</p>}
      </div>

      {/* Featured campaign */}
      {allCampaigns.map((c) => <CampaignSection key={c._id} campaign={c} />)}

      {/* Featured products for this banner */}
      {featuredProducts.length > 0 && (
        <section>
          <h2 className="font-semibold mb-4">Featured Products</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {featuredProducts.map((p) => <ProductCard key={p._id} product={p} />)}
          </div>
          {allProducts.length > 0 && <div className="border-t border-theme my-8" />}
        </section>
      )}

      {/* All campaigns */}
      {campaigns.filter((c) => !allCampaigns.find((f) => f._id === c._id)).map((c) => (
        <CampaignSection key={c._id} campaign={c} />
      ))}

      {/* All products */}
      <section>
        <h2 className="font-semibold mb-4">All Products</h2>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {allProducts.map((p) => <ProductCard key={p._id} product={p} />)}
          </div>
        )}
      </section>
    </div>
  );
}
