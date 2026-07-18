"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FaChevronRight } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { validURLConvert } from "@/lib/utils";
import ProductCard from "./ProductCard";
import { CardSkeleton } from "./Loading";

export default function CategoryWiseProducts({ category }) {
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!category?._id) return;
    (async () => {
      try {
        setLoading(true);
        const r = await Axios({ ...api.getProductByCategory, data: { id: category._id, page: 1, limit: 10 } });
        setProducts(r.data?.data?.data || []);
      } catch {} finally { setLoading(false); }
    })();
  }, [category?._id]);

  if (!loading && products.length === 0) return null;

  return (
    <section className="py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-heading text-xl md:text-2xl">{category.name}</h2>
        <Link href={`/category/${validURLConvert(category.name, category._id)}`}
          className="text-sm font-semibold text-theme-primary flex items-center gap-1 hover:underline">
          See all <FaChevronRight size={11} />
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-[var(--color-border)]"
        style={{ scrollbarWidth: "thin" }}>
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="shrink-0 w-44 sm:w-52"><CardSkeleton /></div>
            ))
          : products.map((p) => (
              <div key={p._id} className="shrink-0 w-44 sm:w-52">
                <ProductCard product={p} />
              </div>
            ))
        }
      </div>
    </section>
  );
}
