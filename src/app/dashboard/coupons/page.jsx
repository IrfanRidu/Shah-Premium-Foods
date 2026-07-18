"use client";
import { useEffect, useState } from "react";
import { FaPlus, FaEdit, FaTrash, FaTag, FaTimes, FaCopy } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError } from "@/lib/utils";
import ConfirmBox from "@/components/ConfirmBox";
import ProductDropdown from "@/components/ProductDropdown";
import toast from "react-hot-toast";

const empty = { code:"", type:"percentage", value:"", minOrderAmount:"", maxDiscount:"", usageLimit:"", perUserLimit:"1", validFrom:"", validTo:"", isActive:true, description:"", applicableProducts:[] };

function CouponModal({ defaultValues, allProducts, productsLoading, productsError, onRetryProducts, onClose, onSaved }) {
  const isEdit = !!defaultValues?._id;
  const [form, setForm] = useState(defaultValues ? {
    ...defaultValues,
    validFrom: defaultValues.validFrom ? new Date(defaultValues.validFrom).toISOString().slice(0,10) : "",
    validTo:   defaultValues.validTo   ? new Date(defaultValues.validTo).toISOString().slice(0,10)   : "",
    perUserLimit: defaultValues.perUserLimit ?? 1,
    // applicableProducts arrives populated (array of {_id, name, image, price}) from getAllCoupons
    applicableProducts: defaultValues.applicableProducts || [],
  } : { ...empty });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const addProduct = (p) => {
    if (form.applicableProducts.some(x => x._id === p._id)) return;
    set("applicableProducts", [...form.applicableProducts, p]);
  };
  const removeProduct = (id) => set("applicableProducts", form.applicableProducts.filter(p => p._id !== id));

  const save = async () => {
    if (!form.code || !form.value || !form.validFrom || !form.validTo) { toast.error("Code, value, valid dates required"); return; }
    try {
      setSaving(true);
      const payload = {
        ...form,
        value: Number(form.value), minOrderAmount: Number(form.minOrderAmount)||0,
        maxDiscount: Number(form.maxDiscount)||0, usageLimit: Number(form.usageLimit)||0,
        perUserLimit: Number(form.perUserLimit)||0,
        applicableProducts: form.applicableProducts.map(p => p._id),
      };
      let r;
      if (isEdit) r = await Axios({ ...api.updateCoupon, data: { ...payload, _id: defaultValues._id } });
      else        r = await Axios({ ...api.createCoupon, data: payload });
      if (r.data?.success) { toast.success(isEdit ? "Coupon updated" : "Coupon created"); onSaved(); onClose(); }
    } catch (err) { axiosToastError(err); } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box max-w-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl font-bold">{isEdit ? "Edit" : "Create"} Coupon</h2>
          <button onClick={onClose}><FaTimes/></button>
        </div>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Coupon Code *</label>
              <input value={form.code} onChange={e => set("code", e.target.value.toUpperCase())} className="input-field font-mono uppercase tracking-widest" placeholder="WELCOME10" disabled={isEdit}/>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type *</label>
              <select value={form.type} onChange={e => set("type", e.target.value)} className="input-field">
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount (৳)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{form.type === "percentage" ? "Discount %" : "Discount Amount ৳"} *</label>
              <input type="number" min="0" value={form.value} onChange={e => set("value", e.target.value)} className="input-field"/>
            </div>
            {form.type === "percentage" && (
              <div>
                <label className="block text-sm font-medium mb-1">Max Discount Cap ৳ (0 = unlimited)</label>
                <input type="number" min="0" value={form.maxDiscount} onChange={e => set("maxDiscount", e.target.value)} className="input-field"/>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Min Order Amount ৳</label>
              <input type="number" min="0" value={form.minOrderAmount} onChange={e => set("minOrderAmount", e.target.value)} className="input-field"/>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Overall Usage Limit (0 = unlimited)</label>
              <input type="number" min="0" value={form.usageLimit} onChange={e => set("usageLimit", e.target.value)} className="input-field"/>
              <p className="text-xs text-theme-muted mt-1">Total times this coupon can be used, across all customers combined.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Per-Customer Limit (0 = unlimited)</label>
              <input type="number" min="0" value={form.perUserLimit} onChange={e => set("perUserLimit", e.target.value)} className="input-field"/>
              <p className="text-xs text-theme-muted mt-1">How many times ONE customer may use this coupon. Default 1 = once each.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Valid From *</label>
              <input type="date" value={form.validFrom} onChange={e => set("validFrom", e.target.value)} className="input-field"/>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Valid To *</label>
              <input type="date" value={form.validTo} onChange={e => set("validTo", e.target.value)} className="input-field"/>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input value={form.description} onChange={e => set("description", e.target.value)} className="input-field" placeholder="e.g. 10% off for new customers"/>
          </div>

          {/* Item 1: product search bar + list, so admin can scope this coupon
              to specific products instead of it always applying to everything */}
          <div>
            <label className="block text-sm font-medium mb-1">Applicable Products</label>
            <p className="text-xs text-theme-muted mb-2">
              Search and add products this coupon applies to. Leave empty to apply it to <strong>all products</strong>.
            </p>
            <ProductDropdown
              allProducts={allProducts}
              excludeIds={form.applicableProducts.map(p => p._id)}
              onSelect={addProduct}
              placeholder="Search products to restrict this coupon to…"
              loading={productsLoading}
              error={productsError}
              onRetry={onRetryProducts}
            />
            {form.applicableProducts.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-3">
                {form.applicableProducts.map(p => (
                  <span key={p._id} className="flex items-center gap-1.5 bg-[var(--color-bg)] border border-theme rounded-full pl-1 pr-2 py-1 text-xs">
                    {p.image?.[0] && <img src={p.image[0]} alt="" className="h-5 w-5 rounded-full object-cover"/>}
                    <span className="max-w-[140px] truncate">{p.name}</span>
                    <button type="button" onClick={() => removeProduct(p._id)} className="text-theme-muted hover:text-red-500">
                      <FaTimes size={9}/>
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-theme-muted mt-2 italic">No products selected — this coupon currently applies to every product.</p>
            )}
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={e => set("isActive", e.target.checked)} className="h-4 w-4 accent-[var(--color-primary)]"/>
            <span className="text-sm font-medium">Active</span>
          </label>
        </div>
        <div className="flex gap-3 justify-end pt-5 border-t border-theme mt-5">
          <button onClick={onClose} className="btn-outline px-5 py-2">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary px-5 py-2">{saving ? "Saving…" : "Save Coupon"}</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminCouponsPage() {
  const [coupons,  setCoupons]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [allProducts, setAllProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(false);

  const load = async () => {
    try { setLoading(true); const r = await Axios({ ...api.getAllCoupons }); setCoupons(r.data?.data || []); }
    catch (err) { axiosToastError(err); } finally { setLoading(false); }
  };

  // Full product list for the "Applicable Products" search/picker in the
  // coupon form (item 1). Same fetch-once, filter-client-side pattern used
  // by the Campaigns admin page's product picker.
  const loadProducts = async () => {
    setProductsLoading(true);
    setProductsError(false);
    try {
      // getProductsController wraps results in a pagination object —
      // { success, data: { data: [...products], totalCount, ... } } — so the
      // actual array is r.data.data.data, not r.data.data (that one level up
      // is the pagination wrapper itself, which isn't an array — passing it
      // straight to setAllProducts is what caused the "allProducts.filter is
      // not a function" crash). Same shape the Campaigns page's own product
      // picker already unwraps correctly.
      const r = await Axios({ ...api.getProduct, data: { page: 1, limit: 200 } });
      const list = r.data?.data?.data;
      setAllProducts(Array.isArray(list) ? list : []);
    }
    catch {
      // Fix: this used to fail completely silently, so a real failure here
      // (DB cold-start, network hiccup, a fresh deployment's DB not wired up
      // yet) was indistinguishable from "the catalog is genuinely empty" —
      // both looked like "no products ever suggest while typing." Now the
      // picker itself surfaces this with a Retry button (see below).
      setProductsError(true);
      setAllProducts([]);
    }
    finally { setProductsLoading(false); }
  };

  useEffect(() => { load(); loadProducts(); }, []);

  const handleDelete = async () => {
    try { await Axios({ ...api.deleteCoupon, data: { _id: deleting } }); toast.success("Coupon deleted"); setDeleting(null); load(); }
    catch (err) { axiosToastError(err); }
  };

  const now = Date.now();
  const statusOf = (c) => {
    if (!c.isActive) return { label:"Inactive", cls:"bg-gray-100 text-gray-500" };
    if (now < new Date(c.validFrom)) return { label:"Upcoming", cls:"bg-blue-100 text-blue-700" };
    if (now > new Date(c.validTo))   return { label:"Expired",  cls:"bg-red-100 text-red-600" };
    return { label:"Active", cls:"bg-green-100 text-green-700" };
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="section-heading text-2xl">Coupons</h1><p className="text-sm text-theme-muted">Create and manage discount coupons</p></div>
        <button onClick={() => setModal("new")} className="btn-primary flex items-center gap-2 px-4 py-2"><FaPlus size={12}/> New Coupon</button>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({length:4}).map((_,i) => <div key={i} className="skeleton h-20 rounded-2xl"/>)}</div>
      ) : coupons.length === 0 ? (
        <div className="text-center py-16 text-theme-muted">No coupons created yet.</div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-theme rounded-2xl overflow-hidden">
          <table className="data-table">
            <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Applies To</th><th>Usage</th><th>Valid Until</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {coupons.map(c => {
                const st = statusOf(c);
                return (
                  <tr key={c._id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-theme-primary">{c.code}</span>
                        <button onClick={() => { navigator.clipboard.writeText(c.code); toast.success("Copied!"); }}
                          className="text-theme-muted hover:text-theme-primary"><FaCopy size={11}/></button>
                      </div>
                      {c.description && <p className="text-xs text-theme-muted">{c.description}</p>}
                    </td>
                    <td className="capitalize">{c.type}</td>
                    <td className="font-semibold">{c.type === "percentage" ? `${c.value}%` : `৳${c.value}`}</td>
                    <td className="text-sm">
                      {c.applicableProducts?.length > 0
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">{c.applicableProducts.length} product{c.applicableProducts.length > 1 ? "s" : ""}</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">All products</span>}
                    </td>
                    <td>
                      <span className="text-sm">{c.usedCount}/{c.usageLimit > 0 ? c.usageLimit : "∞"}</span>
                      {c.minOrderAmount > 0 && <p className="text-xs text-theme-muted">Min ৳{c.minOrderAmount}</p>}
                      <p className="text-xs text-theme-muted">{c.perUserLimit > 0 ? `${c.perUserLimit}/customer` : "Unlimited/customer"}</p>
                    </td>
                    <td className="text-sm">{new Date(c.validTo).toLocaleDateString()}</td>
                    <td><span className={`px-2 py-1 rounded-full text-xs font-semibold ${st.cls}`}>{st.label}</span></td>
                    <td className="text-right">
                      <div className="action-group justify-end">
                        <button onClick={() => setModal(c)} className="icon-btn"><FaEdit size={13}/></button>
                        <button onClick={() => setDeleting(c._id)} className="icon-btn icon-btn-danger"><FaTrash size={13}/></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && <CouponModal defaultValues={modal === "new" ? null : modal} allProducts={allProducts} productsLoading={productsLoading} productsError={productsError} onRetryProducts={loadProducts} onClose={() => setModal(null)} onSaved={load}/>}
      {deleting && <ConfirmBox title="Delete coupon?" message="This cannot be undone. Past order discounts are preserved." danger confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setDeleting(null)}/>}
    </div>
  );
}
