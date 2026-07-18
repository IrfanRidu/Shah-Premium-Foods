"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSelector } from "react-redux";
import Link from "next/link";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { extractIdFromSlug, validURLConvert } from "@/lib/utils";
import ProductCard from "@/components/ProductCard";
import { CardSkeletonList } from "@/components/Loading";
import NoData from "@/components/NoData";

export default function CategorySlugPage() {
  const { slug } = useParams();
  const subCategories = useSelector((s) => s.product.allSubCategory);
  const allCategories = useSelector((s) => s.product.allCategory);

  const catId    = extractIdFromSlug(slug);
  const category = allCategories.find((c) => c._id === catId);
  const subs     = subCategories.filter((s) => s.category?.some((c) => (c._id||c) === catId));

  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const [hasMore,  setHasMore]  = useState(false);

  useEffect(() => {
    if (!catId) return;
    (async () => {
      try {
        setLoading(true);
        const r = await Axios({ ...api.getProductByCategory, data: { id: catId, page: 1, limit: 20 } });
        const d = r.data?.data;
        setProducts(d?.data || []);
        setHasMore((d?.data?.length||0) < (d?.totalCount||0));
      } catch {} finally { setLoading(false); }
    })();
  }, [catId]);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="text-xs text-theme-muted mb-6 flex items-center gap-1.5">
        <Link href="/" className="hover:text-theme-primary">Home</Link>
        <span>/</span>
        <Link href="/category" className="hover:text-theme-primary">Categories</Link>
        <span>/</span>
        <span className="text-theme">{category?.name || "Category"}</span>
      </div>

      <div className="flex items-center gap-3 mb-6">
        {category?.image && <img src={category.image} alt={category.name} className="h-12 w-12 rounded-xl object-cover" />}
        <h1 className="section-heading text-2xl md:text-3xl">{category?.name || "Category"}</h1>
      </div>

      {/* Sub-category chips */}
      {subs.length > 0 && category && (
        <div className="flex gap-2 flex-wrap mb-7">
          {subs.map((sub) => (
            <Link key={sub._id}
              href={`/${validURLConvert(category.name,category._id)}/${validURLConvert(sub.name,sub._id)}`}
              className="px-4 py-1.5 rounded-full text-sm border border-theme hover:border-theme-primary hover:text-theme-primary transition-colors">
              {sub.name}
            </Link>
          ))}
        </div>
      )}

      {loading
        ? <CardSkeletonList count={10} />
        : products.length === 0
          ? <NoData message="No products in this category" />
          : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {products.map((p) => <ProductCard key={p._id} product={p} />)}
            </div>
          )
      }
    </div>
  );
}
