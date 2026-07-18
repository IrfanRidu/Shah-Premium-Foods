"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { FaChevronLeft, FaChevronRight, FaShoppingCart } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { displayPrice, priceWithDiscount, extractIdFromSlug, validURLConvert } from "@/lib/utils";
import { getCampaignIcon } from "@/lib/campaignIcons";
import AddToCartButton from "@/components/AddToCartButton";
import ProductCard from "@/components/ProductCard";
import HorizontalScroll from "@/components/HorizontalScroll";
import { useGlobalContext } from "@/providers/GlobalProvider";
import CampaignSection from "@/components/CampaignSection";
import toast from "react-hot-toast";

export default function ProductPage() {
  const { product: slug } = useParams();
  const router    = useRouter();
  const { logActivity, fetchCartItems } = useGlobalContext();
  const currency  = useSelector((s) => s.currency.selected);
  const rates     = useSelector((s) => s.currency.rates);
  const cart      = useSelector((s) => s.cartItem.cart);
  const userId    = useSelector((s) => s.user._id);
  const campaigns = useSelector((s) => s.campaign.campaigns);

  const [product,     setProduct]     = useState(null);
  const [imgIdx,      setImgIdx]      = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const [buying,      setBuying]      = useState(false);

  const productId = extractIdFromSlug(slug);

  useEffect(() => {
    if (!productId) return;
    (async () => {
      try {
        setLoading(true);
        const r = await Axios({ ...api.getProductDetails, data: { productId } });
        setProduct(r.data?.data || null);
        // Log product view for activity tracking
        logActivity("view", { productId, categoryId: r.data?.data?.category?.[0]?._id });
      } catch {}
      finally { setLoading(false); }
    })();
  }, [productId]);

  // Fetch suggestions after product loads
  useEffect(() => {
    if (!productId) return;
    Axios({ ...api.getSuggestions, params: { productId, limit: 12 } })
      .then((r) => setSuggestions(r.data?.data || []))
      .catch(() => {});
  }, [productId]);

  // "Buy Now" — add to cart then go directly to checkout
  const handleBuyNow = async () => {
    if (!userId) { toast.error("Please login first"); router.push("/login"); return; }
    try {
      setBuying(true);
      const cartItem = cart.find((i) => (i.productId?._id || i.productId) === product._id);
      if (!cartItem) {
        const r = await Axios({ ...api.addToCart, data: { productId: product._id } });
        if (r.data?.success) await fetchCartItems();
      }
      router.push("/checkout");
    } catch { toast.error("Failed to add to cart"); }
    finally { setBuying(false); }
  };

  if (loading) return (
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

  if (!product) return <div className="container mx-auto px-4 py-20 text-center text-theme-muted">Product not found</div>;

  const images = product.image || [];
  const activeCampaign = campaigns.find((c) =>
    c.products?.some((p) => (p.productId?._id || p.productId)?.toString() === product._id?.toString())
  );
  const campaignEntry = activeCampaign?.products?.find(
    (p) => (p.productId?._id || p.productId)?.toString() === product._id?.toString()
  );
  const campaignDiscount = campaignEntry?.specialDiscount || 0;
  const activeDiscount   = campaignDiscount || product.discount || 0;
  const discounted       = priceWithDiscount(product.price, activeDiscount);
  const isCampaign       = !!activeCampaign;
  const CampaignIcon     = getCampaignIcon(activeCampaign?.icon);
  const campaignLabel    = activeCampaign?.name || "Flash Sale";

  // Campaigns that should show on product pages
  const productPageCampaigns = campaigns.filter((c) => c.showOnProductPage && c.isActive);

  return (
    <div className="container mx-auto px-4 py-8 space-y-10">
      {/* Product detail grid */}
      <div className="grid md:grid-cols-2 gap-8 lg:gap-16">
        {/* Images */}
        <div>
          <div className="relative rounded-2xl overflow-hidden bg-[var(--color-surface)] aspect-square mb-3 group">
            {images[imgIdx] && <img src={images[imgIdx]} alt={product.name} className="w-full h-full object-cover" />}
            {isCampaign && (
              <span className="absolute top-3 left-3 flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold text-white shadow"
                style={{ backgroundColor: activeCampaign?.badgeColor || "#ef4444" }}>
                <CampaignIcon size={12} /> {campaignLabel} — {campaignDiscount}% OFF
              </span>
            )}
            {images.length > 1 && (<>
              <button onClick={() => setImgIdx((p) => (p - 1 + images.length) % images.length)}
                className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 bg-white/80 rounded-full flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity">
                <FaChevronLeft size={14} />
              </button>
              <button onClick={() => setImgIdx((p) => (p + 1) % images.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 bg-white/80 rounded-full flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity">
                <FaChevronRight size={14} />
              </button>
            </>)}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((img, i) => (
                <button key={i} onClick={() => setImgIdx(i)}
                  className={`h-16 w-16 shrink-0 rounded-xl overflow-hidden border-2 transition-all ${i === imgIdx ? "border-theme-primary" : "border-transparent opacity-60"}`}>
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {product.category?.map((c) => <span key={c._id} className="badge">{c.name}</span>)}
          </div>

          <h1 className="font-display text-2xl md:text-3xl font-bold leading-snug">{product.name}</h1>
          {product.unit && <p className="text-sm text-theme-muted">Unit: {product.unit}</p>}
          {product.sku  && <p className="text-xs text-theme-muted font-mono">SKU: {product.sku}</p>}

          {/* Price */}
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className={`text-3xl font-bold ${isCampaign ? "text-red-500" : "text-theme-primary"}`}>
              {displayPrice(discounted, currency, rates)}
            </span>
            {activeDiscount > 0 && <>
              <span className="text-lg text-theme-muted line-through">{displayPrice(product.price, currency, rates)}</span>
              <span className="badge">{activeDiscount}% off</span>
            </>}
          </div>

          {/* Stock info */}
          {product.stock === 0
            ? <span className="inline-block bg-red-100 text-red-600 text-xs font-semibold px-3 py-1 rounded-full">Out of Stock</span>
            : product.stock <= (product.lowStockThreshold || 10)
              ? <span className="inline-block bg-orange-100 text-orange-600 text-xs font-semibold px-3 py-1 rounded-full">Only {product.stock} left!</span>
              : <span className="inline-block bg-green-100 text-green-600 text-xs font-semibold px-3 py-1 rounded-full">In Stock</span>
          }

          {/* CTA buttons */}
          {product.stock > 0 && (
            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-[140px]"><AddToCartButton product={product} /></div>
              <button onClick={handleBuyNow} disabled={buying}
                className="flex-1 min-w-[140px] flex items-center justify-center gap-2 btn-primary py-2 text-sm disabled:opacity-60">
                <FaShoppingCart size={14} />
                {buying ? "Adding…" : "Buy Now"}
              </button>
            </div>
          )}

          {/* Description */}
          {product.description && (
            <div className="border-t border-theme pt-4">
              <h3 className="font-semibold mb-2">Description</h3>
              <p className="text-sm text-theme-muted leading-relaxed whitespace-pre-line">{product.description}</p>
            </div>
          )}

          {/* More details */}
          {product.more_details && Object.keys(product.more_details).length > 0 && (
            <div className="border-t border-theme pt-4">
              <h3 className="font-semibold mb-3">Product Details</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {Object.entries(product.more_details).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-theme-muted capitalize">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* Campaign sections relevant to this product page */}
      {productPageCampaigns.map((c) => <CampaignSection key={c._id} campaign={c} />)}

      {/* Similar Products */}
      {suggestions.length > 0 && (
        <section>
          <h2 className="section-heading text-xl mb-4">You May Also Like</h2>
          <HorizontalScroll>
            {suggestions.map((p) => (
              <div key={p._id} className="shrink-0 w-44 sm:w-52">
                <ProductCard product={p} />
              </div>
            ))}
          </HorizontalScroll>
        </section>
      )}
    </div>
  );
}
