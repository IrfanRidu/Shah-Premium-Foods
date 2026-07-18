"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSelector } from "react-redux";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { validURLConvert } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export default function SitemapPage() {
  const { t } = useTranslation();
  const categories = useSelector((s) => s.product.allCategory);
  const subCategories = useSelector((s) => s.product.allSubCategory);
  const [topProducts, setTopProducts] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const r = await Axios({ ...api.getProducts, data: { page: 1, limit: 40 } });
        setTopProducts(r.data?.data?.data || []);
      } catch {}
    })();
  }, []);

  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl">
      <h1 className="section-heading text-2xl md:text-3xl mb-2">Sitemap</h1>
      <p className="text-sm text-theme-muted mb-8">A full map of every page on this site.</p>

      <div className="grid sm:grid-cols-2 gap-8">
        <div>
          <h2 className="font-display text-lg font-semibold mb-3">Main Pages</h2>
          <ul className="space-y-2 text-sm">
            <li><Link href="/" className="hover:text-theme-primary hover:underline">{t("nav.home")}</Link></li>
            <li><Link href="/products" className="hover:text-theme-primary hover:underline">{t("nav.allProducts")}</Link></li>
            <li><Link href="/category" className="hover:text-theme-primary hover:underline">{t("nav.categories")}</Link></li>
            <li><Link href="/search" className="hover:text-theme-primary hover:underline">Search</Link></li>
            <li><Link href="/cart" className="hover:text-theme-primary hover:underline">Cart</Link></li>
            <li><Link href="/dashboard/myorders" className="hover:text-theme-primary hover:underline">My Orders</Link></li>
            <li><Link href="/dashboard/submit-list" className="hover:text-theme-primary hover:underline">Submit Shopping List</Link></li>
            <li><Link href="/login" className="hover:text-theme-primary hover:underline">Login</Link></li>
          </ul>
        </div>

        <div>
          <h2 className="font-display text-lg font-semibold mb-3">Categories</h2>
          {categories.length === 0 ? (
            <p className="text-sm text-theme-muted">No categories yet.</p>
          ) : (
            <ul className="space-y-2 text-sm max-h-80 overflow-y-auto pr-2">
              {categories.map((cat) => {
                const subs = subCategories.filter((s) => s.category?.some((c) => (c._id || c) === cat._id));
                return (
                  <li key={cat._id}>
                    <Link href={`/category/${validURLConvert(cat.name, cat._id)}`} className="hover:text-theme-primary hover:underline font-medium">
                      {cat.name}
                    </Link>
                    {subs.length > 0 && (
                      <ul className="pl-4 mt-1 space-y-1">
                        {subs.map((sub) => (
                          <li key={sub._id}>
                            <Link href={`/${validURLConvert(cat.name, cat._id)}/${validURLConvert(sub.name, sub._id)}`}
                              className="text-theme-muted hover:text-theme-primary hover:underline text-xs">
                              {sub.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {topProducts.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-lg font-semibold mb-3">Products</h2>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
            {topProducts.map((p) => (
              <li key={p._id} className="truncate">
                <Link href={`/product/${validURLConvert(p.name, p._id)}`} className="hover:text-theme-primary hover:underline">
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/products" className="inline-block mt-4 text-sm font-semibold text-theme-primary hover:underline">
            View all products →
          </Link>
        </div>
      )}
    </div>
  );
}
