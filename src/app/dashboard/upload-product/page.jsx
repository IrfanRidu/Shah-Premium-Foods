"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSelector } from "react-redux";
import { useForm, Controller } from "react-hook-form";
import { FaPlus, FaTrash, FaTimes } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError } from "@/lib/utils";
import toast from "react-hot-toast";

function UploadForm() {
  const router      = useRouter();
  const params      = useSearchParams();
  const editId      = params.get("edit");
  const returnPage  = params.get("returnPage") || "1";
  const categories    = useSelector((s) => s.product.allCategory);
  const subCategories = useSelector((s) => s.product.allSubCategory);

  const { register, handleSubmit, control, watch, setValue, reset, formState: { isSubmitting, errors } } = useForm({
    defaultValues: {
      name: "", unit: "", sku: "", shortDescription: "", price: "", costPrice: "", discount: "",
      description: "", stock: "", lowStockThreshold: 10, category: [], subCategory: [],
      publish: true,
    },
  });

  const [images,   setImages]   = useState([]);     // { url: string, file?: File }
  const [loading,  setLoading]  = useState(false);
  // BUG FIX: Manage more_details as separate state, NOT via register() with dot-notation paths
  // react-hook-form v7 doesn't handle register("obj.key") for dynamic keys reliably
  const [moreDetails, setMoreDetails] = useState({}); // { key: value }
  const [newKey,   setNewKey]   = useState("");
  const [newVal,   setNewVal]   = useState("");

  // Alternative spellings — searchable aliases for this product (fix #11)
  const [altSpellings, setAltSpellings] = useState([]); // string[]
  const [newAltSpelling, setNewAltSpelling] = useState("");

  // Set when editing a product whose discount is currently locked off by a
  // campaign — informs the admin why the Discount field reads 0 (fix #14)
  const [campaignLockedDiscount, setCampaignLockedDiscount] = useState(0);

  const watchedCat    = watch("category") || [];
  const filteredSubs  = subCategories.filter(
    (s) => s.category?.some((c) => watchedCat.includes(c._id || c))
  );

  // Load product if editing
  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        setLoading(true);
        const r = await Axios({ ...api.getProductDetails, data: { productId: editId } });
        const p = r.data?.data;
        if (!p) return;
        reset({
          name: p.name, unit: p.unit || "", sku: p.sku || "",
          shortDescription: p.shortDescription || "",
          price: p.price, costPrice: p.costPrice || "",
          discount: p.discount || "", description: p.description || "",
          stock: p.stock, lowStockThreshold: p.lowStockThreshold || 10,
          category:    (p.category    || []).map((c) => c._id || c),
          subCategory: (p.subCategory || []).map((s) => s._id || s),
          publish: p.publish !== false,
        });
        setImages((p.image || []).map((url) => ({ url })));
        setMoreDetails(p.more_details || {});
        setAltSpellings(p.alternativeSpellings || []);
        setCampaignLockedDiscount(p.preCampaignDiscount > 0 ? p.preCampaignDiscount : 0);
      } catch (err) {
        axiosToastError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [editId, reset]);

  const handleImageAdd = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((f) => setImages((prev) => [...prev, { url: URL.createObjectURL(f), file: f }]));
  };

  const removeImage = (i) => setImages((prev) => prev.filter((_, idx) => idx !== i));

  const addMoreDetail = () => {
    if (!newKey.trim()) return;
    setMoreDetails((prev) => ({ ...prev, [newKey.trim()]: newVal }));
    setNewKey(""); setNewVal("");
  };

  const removeMoreDetail = (key) => {
    setMoreDetails((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const addAltSpelling = () => {
    const val = newAltSpelling.trim();
    if (!val) return;
    if (altSpellings.some((s) => s.toLowerCase() === val.toLowerCase())) {
      toast.error("Already added");
      return;
    }
    setAltSpellings((prev) => [...prev, val]);
    setNewAltSpelling("");
  };
  const removeAltSpelling = (val) => setAltSpellings((prev) => prev.filter((s) => s !== val));

  const uploadOneImage = async (img) => {
    if (!img.file) return img.url;
    const fd = new FormData();
    fd.append("image", img.file);
    const r = await Axios({ ...api.uploadImage, data: fd });
    const url = r.data?.data?.url || r.data?.data?.secure_url;
    if (!url) throw new Error("Image upload failed");
    return url;
  };

  const onSubmit = async (data) => {
    if (images.length === 0) { toast.error("Add at least one product image"); return; }
    try {
      // Upload any new image files
      const uploadedUrls = await Promise.all(images.map(uploadOneImage));

      const payload = {
        ...data,
        price:             Number(data.price),
        costPrice:         Number(data.costPrice) || 0,
        discount:          Number(data.discount)  || 0,
        stock:             Number(data.stock)      || 0,
        lowStockThreshold: Number(data.lowStockThreshold) || 10,
        image:      uploadedUrls,
        more_details: moreDetails,
        alternativeSpellings: altSpellings,
      };

      if (editId) {
        const r = await Axios({ ...api.updateProduct, data: { ...payload, _id: editId } });
        if (r.data?.success) { toast.success("Product updated"); router.push("/dashboard/product?page=" + returnPage); }
      } else {
        const r = await Axios({ ...api.addProduct, data: payload });
        if (r.data?.success) { toast.success("Product added"); router.push("/dashboard/product"); }
      }
    } catch (err) {
      axiosToastError(err);
    }
  };

  if (loading) return <div className="text-center py-20 text-theme-muted">Loading product…</div>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-3xl">
      <h1 className="section-heading text-2xl">{editId ? "Edit Product" : "Add Product"}</h1>

      {/* ── Images ────────────────────────────────────────────────── */}
      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
        <h2 className="font-semibold mb-3">Product Images *</h2>
        <div className="flex gap-3 flex-wrap">
          {images.map((img, i) => (
            <div key={i} className="relative h-24 w-24 rounded-xl overflow-hidden border border-theme group">
              <img src={img.url} alt="" className="w-full h-full object-cover" />
              <button type="button" onClick={() => removeImage(i)}
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                <FaTrash size={14} />
              </button>
            </div>
          ))}
          <label className="h-24 w-24 rounded-xl border-2 border-dashed border-theme flex flex-col items-center justify-center cursor-pointer hover:border-theme-primary transition-colors text-theme-muted">
            <FaPlus size={16} /><span className="text-xs mt-1">Add</span>
            <input type="file" accept="image/*" multiple onChange={handleImageAdd} className="hidden" />
          </label>
        </div>
      </div>

      {/* ── Basic Info ────────────────────────────────────────────── */}
      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold">Basic Information</h2>
        <div>
          <label className="block text-sm font-medium mb-1.5">Product Name *</label>
          <input {...register("name", { required: "Name is required" })} className="input-field" />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Unit</label>
            <input {...register("unit")} placeholder="e.g. 5kg, 1L, 1 pc" className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">SKU</label>
            <input {...register("sku")} placeholder="Leave blank to auto-generate" className="input-field" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Selling Price (BDT) *</label>
            <input {...register("price", { required: "Price is required" })} type="number" min="0" step="0.01" className="input-field" />
            {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Cost Price (BDT)</label>
            <input {...register("costPrice")} type="number" min="0" step="0.01" className="input-field" placeholder="For profit tracking" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Discount %</label>
            <input {...register("discount")} type="number" min="0" max="100" className="input-field" placeholder="0" disabled={campaignLockedDiscount > 0} />
            {campaignLockedDiscount > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                Locked at 0 — this product is in an active campaign with its own discount. Remove it from the campaign to restore this {campaignLockedDiscount}% discount.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Stock Qty</label>
            <input {...register("stock")} type="number" min="0" className="input-field" placeholder="0" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Low Stock Alert Threshold</label>
            <input {...register("lowStockThreshold")} type="number" min="1" className="input-field" placeholder="10" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input {...register("publish")} type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" />
              <span className="text-sm font-medium">Published (visible to customers)</span>
            </label>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Short Description <span className="text-theme-muted font-normal">(shown on product card — max 200 chars)</span></label>
          <input {...register("shortDescription")} maxLength={200} className="input-field" placeholder="One-line summary shown under the product name on listing pages…" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Full Description</label>
          <textarea {...register("description")} rows={4} className="input-field resize-none" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Alternative Spellings</label>
          <p className="text-xs text-theme-muted mb-2">
            Other ways customers might type this product's name — the search box matches these too (e.g. "capsicum" for "bell pepper", "dhonepata" for "coriander").
          </p>
          {altSpellings.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {altSpellings.map((s) => (
                <span key={s} className="flex items-center gap-1.5 bg-[var(--color-bg)] border border-theme rounded-full pl-3 pr-1.5 py-1 text-xs font-medium">
                  {s}
                  <button type="button" onClick={() => removeAltSpelling(s)} className="text-theme-muted hover:text-red-500 p-0.5">
                    <FaTimes size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={newAltSpelling}
              onChange={(e) => setNewAltSpelling(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAltSpelling(); } }}
              placeholder="Type a spelling variant and press Enter"
              className="input-field flex-1"
            />
            <button type="button" onClick={addAltSpelling} className="btn-outline px-3 py-2 shrink-0"><FaPlus size={13} /></button>
          </div>
        </div>
      </div>

      {/* ── Categories ───────────────────────────────────────────── */}
      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold">Categories</h2>
        <div>
          <label className="block text-sm font-medium mb-2">Category *</label>
          <Controller name="category" control={control} render={({ field }) => (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categories.map((cat) => {
                const checked = (field.value || []).includes(cat._id);
                return (
                  <label key={cat._id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-sm transition-all ${checked ? "border-theme-primary bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]" : "border-theme hover:border-theme-primary/50"}`}>
                    <input type="checkbox" checked={checked} onChange={(e) => {
                      const next = e.target.checked
                        ? [...(field.value || []), cat._id]
                        : (field.value || []).filter((id) => id !== cat._id);
                      field.onChange(next);
                    }} className="accent-[var(--color-primary)]" />
                    {cat.image && <img src={cat.image} alt="" className="h-5 w-5 rounded object-cover" />}
                    <span className="truncate">{cat.name}</span>
                  </label>
                );
              })}
            </div>
          )} />
        </div>

        {filteredSubs.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-2">Sub-Category</label>
            <Controller name="subCategory" control={control} render={({ field }) => (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {filteredSubs.map((sub) => {
                  const checked = (field.value || []).includes(sub._id);
                  return (
                    <label key={sub._id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-sm transition-all ${checked ? "border-theme-primary bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]" : "border-theme hover:border-theme-primary/50"}`}>
                      <input type="checkbox" checked={checked} onChange={(e) => {
                        const next = e.target.checked
                          ? [...(field.value || []), sub._id]
                          : (field.value || []).filter((id) => id !== sub._id);
                        field.onChange(next);
                      }} className="accent-[var(--color-primary)]" />
                      <span className="truncate">{sub.name}</span>
                    </label>
                  );
                })}
              </div>
            )} />
          </div>
        )}
      </div>

      {/* ── More Details (key-value pairs) ───────────────────────── */}
      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold">Extra Details (optional)</h2>
        {Object.entries(moreDetails).map(([k, v]) => (
          <div key={k} className="flex gap-2 items-center">
            <span className="text-sm font-medium w-32 shrink-0 capitalize">{k}</span>
            <input
              value={v}
              onChange={(e) => setMoreDetails((prev) => ({ ...prev, [k]: e.target.value }))}
              className="input-field flex-1"
            />
            <button type="button" onClick={() => removeMoreDetail(k)} className="text-red-400 hover:text-red-600 p-1 shrink-0">
              <FaTimes size={13} />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="Key (e.g. Brand)" className="input-field w-36" />
          <input value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder="Value" className="input-field flex-1"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMoreDetail(); } }} />
          <button type="button" onClick={addMoreDetail} className="btn-outline px-3 py-2 shrink-0"><FaPlus size={13} /></button>
        </div>
      </div>

      <div className="flex gap-3 pb-8">
        <button type="submit" disabled={isSubmitting} className="btn-primary px-8 py-2.5">
          {isSubmitting ? "Saving…" : editId ? "Update Product" : "Add Product"}
        </button>
        <button type="button" onClick={() => router.push("/dashboard/product?page=" + returnPage)} className="btn-outline px-8 py-2.5">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function UploadProductPage() {
  return <Suspense fallback={<div className="py-20 text-center text-theme-muted">Loading…</div>}><UploadForm /></Suspense>;
}
