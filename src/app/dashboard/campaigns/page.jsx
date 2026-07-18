"use client";
import { useEffect, useState } from "react";
import { FaPlus, FaEdit, FaTrash, FaToggleOn, FaToggleOff, FaTimes } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError, uploadImage } from "@/lib/utils";
import { CAMPAIGN_ICONS, getCampaignIcon } from "@/lib/campaignIcons";
import { useGlobalContext } from "@/providers/GlobalProvider";
import ConfirmBox from "@/components/ConfirmBox";
import DateTimePicker from "@/components/DateTimePicker";
import ProductDropdown from "@/components/ProductDropdown";
import toast from "react-hot-toast";

const STATUS_COLORS = { active:"bg-green-100 text-green-700", upcoming:"bg-blue-100 text-blue-700", expired:"bg-gray-100 text-gray-500" };

function campaignStatus(c) {
  const now = Date.now();
  if (!c.isActive) return "inactive";
  if (now < new Date(c.startTime)) return "upcoming";
  if (now > new Date(c.endTime)) return "expired";
  return "active";
}

// Fix 21: Compute a preview background style from the campaign's badge settings
function badgePreviewStyle(form) {
  if (form.badgeStyle === "gradient" && form.badgeGradient) return { background: form.badgeGradient };
  if (form.badgeStyle === "image" && form.badgeImage) return { backgroundImage: `url(${form.badgeImage})`, backgroundSize: "cover", backgroundPosition: "center" };
  return { backgroundColor: form.badgeColor || "#ef4444" };
}

// Fix 20: Reusable searchable dropdown for products — combobox pattern with
// manual typing AND a clickable dropdown list, closes on selection/outside-click.
// (Now a shared component: @/components/ProductDropdown — also used by the
// Coupons admin page's product picker.)

function CampaignFormModal({ defaultValues, allProducts, productsLoading, productsError, onRetryProducts, onClose, onSaved }) {
  const isEdit = !!defaultValues?._id;
  const [form, setForm] = useState({
    name: defaultValues?.name || "", icon: defaultValues?.icon || "bolt",
    description: defaultValues?.description || "",
    startTime: defaultValues?.startTime ? new Date(defaultValues.startTime).toISOString().slice(0,16) : "",
    endTime:   defaultValues?.endTime   ? new Date(defaultValues.endTime).toISOString().slice(0,16) : "",
    isActive: defaultValues?.isActive !== false, showOnHomepage: defaultValues?.showOnHomepage !== false,
    showOnProductPage: defaultValues?.showOnProductPage !== false,
    badgeColor: defaultValues?.badgeColor || "#ef4444",
    // Fix 21: badge style controls
    badgeStyle: defaultValues?.badgeStyle || "solid",
    badgeGradient: defaultValues?.badgeGradient || "linear-gradient(135deg, #ef4444, #f97316)",
    badgeImage: defaultValues?.badgeImage || "",
    textColor: defaultValues?.textColor || "#ffffff",
    iconColor: defaultValues?.iconColor || "#ffffff",
    displayOrder: defaultValues?.displayOrder || 0,
  });
  const [products, setProducts]   = useState(defaultValues?.products || []);
  const [saving,   setSaving]     = useState(false);
  const [uploadingBadge, setUploadingBadge] = useState(false);

  const excludeIds = products.map((sp) => sp.productId?._id || sp.productId);

  const addProduct = (p) => setProducts((prev) => [...prev, { productId: p, specialDiscount: 10, specialPrice: 0 }]);
  const removeProduct = (idx) => setProducts((prev) => prev.filter((_, i) => i !== idx));
  const updateDiscount = (idx, val) => setProducts((prev) => prev.map((p, i) => i === idx ? { ...p, specialDiscount: Number(val) } : p));

  const handleBadgeImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingBadge(true);
      const up = await uploadImage(file, Axios, api);
      const url = up?.data?.url || up?.url;
      if (url) setForm((p) => ({ ...p, badgeImage: url, badgeStyle: "image" }));
    } catch (err) { axiosToastError(err); } finally { setUploadingBadge(false); }
  };

  const save = async () => {
    if (!form.startTime || !form.endTime) { toast.error("Start and end time required"); return; }
    try {
      setSaving(true);
      const payload = {
        ...form,
        name: form.name.trim(),
        startTime: new Date(form.startTime), endTime: new Date(form.endTime),
        displayOrder: Number(form.displayOrder),
        products: products.map((p) => ({
          productId: p.productId?._id || p.productId,
          specialDiscount: p.specialDiscount, specialPrice: p.specialPrice || 0,
        })),
      };
      let r;
      if (isEdit) r = await Axios({ ...api.updateCampaign, data: { ...payload, _id: defaultValues._id } });
      else        r = await Axios({ ...api.createCampaign, data: payload });
      if (r.data?.success) { toast.success(isEdit ? "Campaign updated" : "Campaign created"); onSaved(); onClose(); }
    } catch (err) { axiosToastError(err); } finally { setSaving(false); }
  };

  const PreviewIcon = getCampaignIcon(form.icon);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <PreviewIcon className="text-red-500"/>{isEdit ? "Edit" : "Create"} Campaign
          </h2>
          <button onClick={onClose}><FaTimes/></button>
        </div>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Campaign Name</label>
              <input value={form.name} onChange={(e) => setForm((p) => ({...p, name: e.target.value}))} className="input-field" placeholder="Leave blank for default “Flash Sale”"/>
              <p className="text-xs text-theme-muted mt-1">Name it however fits your brand (e.g. "Eid Special", "Clearance Week").</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sign / Icon</label>
              <select value={form.icon} onChange={(e) => setForm((p) => ({...p, icon: e.target.value}))} className="input-field">
                {Object.entries(CAMPAIGN_ICONS).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Description</label>
              <input value={form.description} onChange={(e) => setForm((p) => ({...p, description: e.target.value}))} className="input-field"/>
            </div>
            <div>
              <DateTimePicker label="Start Time *" value={form.startTime} onChange={(val) => setForm((p) => ({...p, startTime: val}))} placeholder="Pick start date & time" />
            </div>
            <div>
              <DateTimePicker label="End Time *" value={form.endTime} onChange={(val) => setForm((p) => ({...p, endTime: val}))} placeholder="Pick end date & time" />
            </div>

            {/* Fix 21: Badge style picker — solid / gradient / image */}
            <div className="sm:col-span-2 border-t border-theme pt-4">
              <label className="block text-sm font-medium mb-2">Badge Style</label>
              <div className="flex gap-2 mb-3">
                {["solid","gradient","image"].map((style) => (
                  <button key={style} type="button"
                    onClick={() => setForm((p) => ({...p, badgeStyle: style}))}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize border transition-colors ${form.badgeStyle === style ? "bg-theme-primary text-white border-theme-primary" : "border-theme text-theme-muted hover:bg-[var(--color-border)]"}`}>
                    {style}
                  </button>
                ))}
              </div>

              {form.badgeStyle === "solid" && (
                <div className="flex gap-2 items-center">
                  <input type="color" value={form.badgeColor} onChange={(e) => setForm((p) => ({...p, badgeColor: e.target.value}))} className="h-10 w-16 rounded cursor-pointer border border-theme"/>
                  <input value={form.badgeColor} onChange={(e) => setForm((p) => ({...p, badgeColor: e.target.value}))} className="input-field flex-1" placeholder="#ef4444"/>
                </div>
              )}
              {form.badgeStyle === "gradient" && (
                <div className="space-y-2">
                  <input value={form.badgeGradient} onChange={(e) => setForm((p) => ({...p, badgeGradient: e.target.value}))} className="input-field" placeholder="linear-gradient(135deg, #ef4444, #f97316)"/>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      "linear-gradient(135deg, #ef4444, #f97316)",
                      "linear-gradient(135deg, #8b5cf6, #ec4899)",
                      "linear-gradient(135deg, #06b6d4, #3b82f6)",
                      "linear-gradient(135deg, #22c55e, #84cc16)",
                      "linear-gradient(135deg, #f59e0b, #eab308)",
                    ].map((g) => (
                      <button key={g} type="button" onClick={() => setForm((p) => ({...p, badgeGradient: g}))}
                        className="h-8 w-14 rounded-lg border border-theme" style={{ background: g }} />
                    ))}
                  </div>
                </div>
              )}
              {form.badgeStyle === "image" && (
                <div className="flex items-center gap-3">
                  {form.badgeImage && <img src={form.badgeImage} alt="" className="h-10 w-20 rounded-lg object-cover border border-theme"/>}
                  <label className="btn-outline px-4 py-2 text-sm cursor-pointer">
                    {uploadingBadge ? "Uploading…" : "Upload Badge Image"}
                    <input type="file" accept="image/*" onChange={handleBadgeImageUpload} className="hidden" disabled={uploadingBadge}/>
                  </label>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-medium mb-1 text-theme-muted">Text Color</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={form.textColor} onChange={(e) => setForm((p) => ({...p, textColor: e.target.value}))} className="h-8 w-12 rounded cursor-pointer border border-theme"/>
                    <input value={form.textColor} onChange={(e) => setForm((p) => ({...p, textColor: e.target.value}))} className="input-field flex-1 text-xs py-1.5"/>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-theme-muted">Icon Color</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={form.iconColor} onChange={(e) => setForm((p) => ({...p, iconColor: e.target.value}))} className="h-8 w-12 rounded cursor-pointer border border-theme"/>
                    <input value={form.iconColor} onChange={(e) => setForm((p) => ({...p, iconColor: e.target.value}))} className="input-field flex-1 text-xs py-1.5"/>
                  </div>
                </div>
              </div>

              {/* Live badge preview */}
              <div className="mt-3">
                <span className="text-xs text-theme-muted block mb-1">Preview:</span>
                <span
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold shadow-md"
                  style={badgePreviewStyle(form)}
                >
                  <PreviewIcon size={11} style={{ color: form.iconColor }} />
                  <span style={{ color: form.textColor }}>{form.name || "Flash Sale"}</span>
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Display Order</label>
              <input type="number" value={form.displayOrder} onChange={(e) => setForm((p) => ({...p, displayOrder: e.target.value}))} className="input-field"/>
            </div>
            <div className="sm:col-span-2 flex flex-wrap gap-4">
              {[["isActive","Active"],["showOnHomepage","Show on Homepage"],["showOnProductPage","Show on Product Pages"]].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form[key]} onChange={(e) => setForm((p) => ({...p, [key]: e.target.checked}))} className="h-4 w-4 accent-[var(--color-primary)]"/>
                  <span className="text-sm font-medium">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Fix 20: Products — proper dropdown combobox (search + click) */}
          <div className="border-t border-theme pt-4">
            <h3 className="font-semibold mb-3">Products in Campaign ({products.length})</h3>
            <div className="mb-3">
              <ProductDropdown allProducts={allProducts} excludeIds={excludeIds} onSelect={addProduct} loading={productsLoading} error={productsError} onRetry={onRetryProducts} />
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {products.map((item, i) => {
                const p = item.productId;
                return (
                  <div key={i} className="flex items-center gap-2 bg-[var(--color-bg)] border border-theme rounded-xl px-3 py-2">
                    {(p?.image?.[0]) && <img src={p.image[0]} alt="" className="h-9 w-9 rounded object-cover shrink-0"/>}
                    <span className="flex-1 text-sm truncate">{p?.name || "Product"}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <input type="number" min="0" max="100" value={item.specialDiscount}
                        onChange={(e) => updateDiscount(i, e.target.value)}
                        className="input-field w-16 text-center text-xs py-1"/>
                      <span className="text-xs text-theme-muted">%</span>
                    </div>
                    <button onClick={() => removeProduct(i)} className="text-red-400 hover:text-red-600 p-1"><FaTimes size={12}/></button>
                  </div>
                );
              })}
              {products.length === 0 && <p className="text-sm text-theme-muted text-center py-4">No products added yet. Search above to add products.</p>}
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-4 border-t border-theme mt-4">
          <button onClick={onClose} className="btn-outline px-5 py-2">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary px-5 py-2">{saving ? "Saving…" : "Save Campaign"}</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminCampaignsPage() {
  const { fetchCampaigns } = useGlobalContext();
  const [campaigns,  setCampaigns] = useState([]);
  const [allProducts,setAllProds]  = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [modal,      setModal]     = useState(null);
  const [deleting,   setDeleting]  = useState(null);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError,   setProductsError]   = useState(false);

  // Products are fetched separately from campaigns now (previously bundled
  // into one Promise.all, so a products-fetch hiccup would also blank out
  // the whole campaigns list and only ever surface as a passing toast) —
  // each has its own loading/error state, and the product picker shows a
  // persistent, actionable "Couldn't load products — Retry" instead.
  const loadProducts = async () => {
    setProductsLoading(true);
    setProductsError(false);
    try {
      const prodsR = await Axios({ ...api.getProduct, data: { page: 1, limit: 200 } });
      const list = prodsR.data?.data?.data;
      setAllProds(Array.isArray(list) ? list : []);
    } catch {
      setProductsError(true);
      setAllProds([]);
    } finally { setProductsLoading(false); }
  };

  const load = async () => {
    try {
      setLoading(true);
      const campR = await Axios({ ...api.getAllCampaigns });
      setCampaigns(campR.data?.data || []);
    } catch (err) { axiosToastError(err); } finally { setLoading(false); }
  };

  useEffect(() => { load(); loadProducts(); }, []);

  const toggleActive = async (c) => {
    try {
      await Axios({ ...api.updateCampaign, data: { _id: c._id, isActive: !c.isActive } });
      toast.success(c.isActive ? "Campaign deactivated" : "Campaign activated");
      load(); fetchCampaigns();
    } catch (err) { axiosToastError(err); }
  };

  const handleDelete = async () => {
    try {
      await Axios({ ...api.deleteCampaign, data: { _id: deleting } });
      toast.success("Campaign deleted"); setDeleting(null); load(); fetchCampaigns();
    } catch (err) { axiosToastError(err); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="section-heading text-2xl">Campaigns</h1><p className="text-sm text-theme-muted">Time-limited promo sections — name them however fits your brand, not just "Flash Sale"</p></div>
        <button onClick={() => setModal("new")} className="btn-primary flex items-center gap-2 px-4 py-2"><FaPlus size={12}/> New Campaign</button>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({length:3}).map((_,i) => <div key={i} className="skeleton h-24 rounded-2xl"/>)}</div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-16 text-theme-muted">No campaigns created yet.</div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c) => {
            const st = campaignStatus(c);
            const Icon = getCampaignIcon(c.icon);
            return (
              <div key={c._id} className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-full flex items-center justify-center shrink-0" style={badgePreviewStyle(c)}>
                      <Icon size={16} style={{ color: c.iconColor || "#fff" }}/>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{c.name || "Flash Sale"}</h3>
                      <p className="text-xs text-theme-muted">{c.description}</p>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-theme-muted">
                        <span>Start: {new Date(c.startTime).toLocaleString()}</span>
                        <span>End: {new Date(c.endTime).toLocaleString()}</span>
                        <span className={`px-2 py-0.5 rounded-full font-semibold capitalize ${STATUS_COLORS[st] || "bg-gray-100 text-gray-600"}`}>{st}</span>
                      </div>
                    </div>
                  </div>
                  <div className="action-group">
                    <div className="flex gap-1 text-xs">
                      <span className={`px-2 py-1 rounded-lg ${c.showOnHomepage ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>Homepage</span>
                      <span className={`px-2 py-1 rounded-lg ${c.showOnProductPage ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>Product Page</span>
                    </div>
                    <button onClick={() => toggleActive(c)} className={`icon-btn ${c.isActive ? "icon-btn-active" : ""}`} title={c.isActive ? "Deactivate" : "Activate"}>
                      {c.isActive ? <FaToggleOn size={20}/> : <FaToggleOff size={20}/>}
                    </button>
                    <button onClick={() => setModal(c)} className="icon-btn"><FaEdit size={14}/></button>
                    <button onClick={() => setDeleting(c._id)} className="icon-btn icon-btn-danger"><FaTrash size={14}/></button>
                  </div>
                </div>
                {c.products?.length > 0 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto">
                    {c.products.slice(0,8).map((item, i) => {
                      const p = item.productId;
                      return p ? (
                        <div key={i} className="shrink-0 flex items-center gap-1 bg-[var(--color-bg)] border border-theme rounded-lg px-2 py-1 text-xs">
                          {p.image?.[0] && <img src={p.image[0]} alt="" className="h-6 w-6 rounded object-cover"/>}
                          <span className="truncate max-w-[80px]">{p.name}</span>
                          <span className="text-red-500 font-bold">-{item.specialDiscount}%</span>
                        </div>
                      ) : null;
                    })}
                    {c.products.length > 8 && <span className="text-xs text-theme-muted self-center">+{c.products.length - 8} more</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && <CampaignFormModal defaultValues={modal === "new" ? null : modal} allProducts={allProducts} productsLoading={productsLoading} productsError={productsError} onRetryProducts={loadProducts} onClose={() => setModal(null)} onSaved={() => { load(); fetchCampaigns(); }}/>}
      {deleting && <ConfirmBox title="Delete campaign?" message="This will permanently remove the campaign and all its product entries." danger confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setDeleting(null)}/>}
    </div>
  );
}
