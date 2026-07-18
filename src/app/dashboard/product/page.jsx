"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { FaEdit, FaTrash, FaPlus, FaSearch } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { displayPrice, priceWithDiscount, axiosToastError } from "@/lib/utils";
import ConfirmBox from "@/components/ConfirmBox";
import toast from "react-hot-toast";

export default function AdminProductPage() {
  const currency = useSelector((s) => s.currency.baseCurrency); // item 7: admin reporting always shows the official base currency, not any personal storefront override
  const rates    = useSelector((s) => s.currency.rates);
  const router = useRouter();
  const [products,  setProducts]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [page,      setPage]      = useState(1);
  const [totalPage, setTotalPage] = useState(1);
  const [deleting,  setDeleting]  = useState(null);
  const LIMIT = 15;

  const load = async (p = 1, q = "") => {
    try {
      setLoading(true);
      const r = await Axios({ ...api.getProduct, data: { page: p, limit: LIMIT, search: q } });
      const d = r.data?.data;
      setProducts(d?.data || []);
      setTotalPage(Math.ceil((d?.totalCount || 0) / LIMIT) || 1);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(page, search); }, [page]);

  const handleSearch = (e) => {
    e.preventDefault(); setPage(1); load(1, search);
  };

  const handleDelete = async () => {
    try {
      await Axios({ ...api.deleteProduct, data: { _id: deleting } });
      toast.success("Product deleted"); setDeleting(null); load(page, search);
    } catch (err) { axiosToastError(err); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="section-heading text-2xl">Products</h1>
        <Link href="/dashboard/upload-product" className="btn-primary flex items-center gap-2 px-4 py-2">
          <FaPlus size={12} /> Add Product
        </Link>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 mb-5 max-w-sm">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className="input-field" />
        <button type="submit" className="btn-primary px-4 py-2"><FaSearch size={13}/></button>
      </form>

      {loading ? (
        <div className="space-y-3">
          {Array.from({length:6}).map((_,i)=>(
            <div key={i} className="flex gap-3 items-center p-3 bg-[var(--color-surface)] border border-theme rounded-xl">
              <div className="skeleton h-12 w-12 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2"><div className="skeleton h-4 w-1/2 rounded"/><div className="skeleton h-3 w-1/4 rounded"/></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl overflow-hidden">
          <table className="data-table">
            <thead><tr><th>Image</th><th>Name</th><th>SKU</th><th>Price</th><th>Stock</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {products.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-theme-muted">No products found</td></tr>}
              {products.map((p) => (
                <tr key={p._id}>
                  <td>{p.image?.[0] && <img src={p.image[0]} alt={p.name} className="h-10 w-10 rounded-lg object-cover" />}</td>
                  <td className="font-medium max-w-[200px]"><p className="truncate">{p.name}</p></td>
                  <td><span className="font-mono text-xs text-theme-muted">{p.sku || "—"}</span></td>
                  <td>
                    <p className="font-semibold text-theme-primary text-sm">{displayPrice(priceWithDiscount(p.price, p.discount), currency, rates)}</p>
                    {p.discount > 0 && <p className="text-xs text-theme-muted line-through">{displayPrice(p.price, currency, rates)}</p>}
                  </td>
                  <td><span className={`badge ${p.stock > 0 ? "" : "bg-red-100 text-red-600"}`}>{p.stock > 0 ? "In Stock" : "Out"}</span></td>
                  <td className="text-right">
                    <div className="action-group justify-end">
                      <button onClick={() => router.push(`/dashboard/upload-product?edit=${p._id}&returnPage=${page}`)} className="icon-btn"><FaEdit size={13}/></button>
                      <button onClick={() => setDeleting(p._id)} className="icon-btn icon-btn-danger"><FaTrash size={13}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPage > 1 && (
        <div className="flex justify-center gap-2 mt-5">
          <button disabled={page===1} onClick={() => setPage(p=>p-1)} className="px-4 py-2 rounded-lg border border-theme text-sm disabled:opacity-40 hover:bg-[var(--color-border)]">Prev</button>
          <span className="px-4 py-2 text-sm text-theme-muted">{page} / {totalPage}</span>
          <button disabled={page===totalPage} onClick={() => setPage(p=>p+1)} className="px-4 py-2 rounded-lg border border-theme text-sm disabled:opacity-40 hover:bg-[var(--color-border)]">Next</button>
        </div>
      )}

      {deleting && <ConfirmBox title="Delete product?" message="This action cannot be undone." danger confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setDeleting(null)} />}
    </div>
  );
}
