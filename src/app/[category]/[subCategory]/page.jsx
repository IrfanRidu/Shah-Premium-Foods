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

export default function SubCategoryProductPage() {
  const { category: catSlug, subCategory: subSlug } = useParams();
  const allCats = useSelector((s) => s.product.allCategory);
  const allSubs = useSelector((s) => s.product.allSubCategory);

  const catId = extractIdFromSlug(catSlug);
  const subId = extractIdFromSlug(subSlug);
  const cat   = allCats.find((c) => c._id === catId);
  const sub   = allSubs.find((s) => s._id === subId);

  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!catId || !subId) return;
    (async () => {
      try {
        setLoading(true);
        const r = await Axios({ ...api.getProductByCategoryAndSubCategory, data: { categoryId: catId, subCategoryId: subId, page: 1, limit: 50 } });
        setProducts(r.data?.data?.data || []);
      } catch {} finally { setLoading(false); }
    })();
  }, [catId, subId]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-xs text-theme-muted mb-6 flex items-center gap-1.5 flex-wrap">
        <Link href="/" className="hover:text-theme-primary">Home</Link>
        <span>/</span>
        <Link href="/category" className="hover:text-theme-primary">Categories</Link>
        {cat && (<><span>/</span><Link href={`/category/${validURLConvert(cat.name,cat._id)}`} className="hover:text-theme-primary">{cat.name}</Link></>)}
        {sub && (<><span>/</span><span className="text-theme">{sub.name}</span></>)}
      </div>

      <h1 className="section-heading text-2xl md:text-3xl mb-7">{sub?.name || "Products"}</h1>

      {loading
        ? <CardSkeletonList count={10} />
        : products.length === 0
          ? <NoData message="No products found" description="Try a different category or sub-category" />
          : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {products.map((p) => <ProductCard key={p._id} product={p} />)}
            </div>
          )
      }
    </div>
  );
}
