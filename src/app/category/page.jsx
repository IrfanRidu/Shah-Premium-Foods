"use client";
import { useSelector } from "react-redux";
import Link from "next/link";
import { validURLConvert } from "@/lib/utils";

export default function CategoryPage() {
  const categories    = useSelector((s) => s.product.allCategory);
  const subCategories = useSelector((s) => s.product.allSubCategory);
  const loading       = useSelector((s) => s.product.loadingCategory);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="skeleton h-8 w-48 rounded mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({length:12}).map((_,i)=>(<div key={i} className="skeleton aspect-square rounded-2xl"/>))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="section-heading text-3xl mb-2">All Categories</h1>
      <p className="text-theme-muted mb-8">Browse all product categories</p>

      <div className="space-y-10">
        {categories.map((cat) => {
          const subs = subCategories.filter((s) => s.category?.some((c) => (c._id||c) === cat._id));
          return (
            <div key={cat._id}>
              <div className="flex items-center gap-3 mb-4">
                {cat.image && <img src={cat.image} alt={cat.name} className="h-10 w-10 rounded-xl object-cover" />}
                <h2 className="font-display text-xl font-semibold">{cat.name}</h2>
              </div>
              {subs.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {subs.map((sub) => (
                    <Link key={sub._id} href={`/${validURLConvert(cat.name,cat._id)}/${validURLConvert(sub.name,sub._id)}`}
                      className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-theme bg-[var(--color-surface)] hover:border-theme-primary hover:shadow-md transition-all group text-center">
                      {sub.image
                        ? <img src={sub.image} alt={sub.name} className="h-14 w-14 rounded-xl object-cover group-hover:scale-105 transition-transform" />
                        : <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-sage-100 to-sage-200"/>
                      }
                      <span className="text-xs font-medium">{sub.name}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <Link href={`/category/${validURLConvert(cat.name,cat._id)}`}
                  className="inline-block text-sm text-theme-primary hover:underline">
                  View products →
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
