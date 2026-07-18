"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { FaPlus, FaEdit, FaTrash, FaTimes, FaTruck, FaStar } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError, displayPrice } from "@/lib/utils";
import ConfirmBox from "@/components/ConfirmBox";
import toast from "react-hot-toast";

function ZoneModal({ defaultValues, onClose, onSaved }) {
  const isEdit = !!defaultValues?._id;
  const [form, setForm] = useState({
    name: defaultValues?.name || "",
    matchCities: (defaultValues?.matchCities || []).join(", "),
    charge: defaultValues?.charge ?? "",
    freeDeliveryThreshold: defaultValues?.freeDeliveryThreshold || "",
    estimatedDays: defaultValues?.estimatedDays || "",
    isDefault: defaultValues?.isDefault || false,
    isActive: defaultValues?.isActive !== false,
    displayOrder: defaultValues?.displayOrder || 0,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim() || form.charge === "") { toast.error("Name and charge are required"); return; }
    try {
      setSaving(true);
      const payload = {
        ...form,
        matchCities: form.matchCities.split(",").map((c) => c.trim()).filter(Boolean),
        charge: Number(form.charge),
        freeDeliveryThreshold: Number(form.freeDeliveryThreshold) || 0,
        displayOrder: Number(form.displayOrder) || 0,
      };
      let r;
      if (isEdit) r = await Axios({ ...api.updateDeliveryZone, data: { ...payload, _id: defaultValues._id } });
      else        r = await Axios({ ...api.createDeliveryZone, data: payload });
      if (r.data?.success) { toast.success(isEdit ? "Zone updated" : "Zone created"); onSaved(); onClose(); }
    } catch (err) { axiosToastError(err); } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl font-bold">{isEdit ? "Edit" : "Add"} Delivery Zone</h2>
          <button onClick={onClose}><FaTimes/></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Zone Name *</label>
            <input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} className="input-field" placeholder="e.g. Inside Dhaka"/>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Matching Cities (comma-separated)</label>
            <input value={form.matchCities} onChange={e => setForm(p => ({...p, matchCities: e.target.value}))} className="input-field" placeholder="Dhaka, Gazipur, Narayanganj"/>
            <p className="text-xs text-theme-muted mt-1">An order's delivery charge is matched by the customer's address city (case-insensitive).</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Delivery Charge (৳) *</label>
              <input type="number" min="0" value={form.charge} onChange={e => setForm(p => ({...p, charge: e.target.value}))} className="input-field"/>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Free Above (৳)</label>
              <input type="number" min="0" value={form.freeDeliveryThreshold} onChange={e => setForm(p => ({...p, freeDeliveryThreshold: e.target.value}))} className="input-field" placeholder="0 = no free offer"/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Estimated Delivery</label>
              <input value={form.estimatedDays} onChange={e => setForm(p => ({...p, estimatedDays: e.target.value}))} className="input-field" placeholder="1-2 days"/>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Display Order</label>
              <input type="number" value={form.displayOrder} onChange={e => setForm(p => ({...p, displayOrder: e.target.value}))} className="input-field"/>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({...p, isActive: e.target.checked}))} className="h-4 w-4 accent-[var(--color-primary)]"/>
              <span className="text-sm font-medium">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isDefault} onChange={e => setForm(p => ({...p, isDefault: e.target.checked}))} className="h-4 w-4 accent-[var(--color-primary)]"/>
              <span className="text-sm font-medium">Default zone (used when no city matches)</span>
            </label>
          </div>
        </div>
        <div className="flex gap-3 justify-end pt-5 border-t border-theme mt-5">
          <button onClick={onClose} className="btn-outline px-5 py-2">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary px-5 py-2">{saving ? "Saving…" : "Save Zone"}</button>
        </div>
      </div>
    </div>
  );
}

export default function DeliveryZonesPage() {
  const currency = useSelector((s) => s.currency.baseCurrency); // item 7: admin reporting always shows the official base currency, not any personal storefront override
  const rates    = useSelector((s) => s.currency.rates);
  const [zones,    setZones]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    try { setLoading(true); const r = await Axios({ ...api.getAllDeliveryZones }); setZones(r.data?.data || []); }
    catch (err) { axiosToastError(err); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async () => {
    try { await Axios({ ...api.deleteDeliveryZone, data: { _id: deleting } }); toast.success("Zone deleted"); setDeleting(null); load(); }
    catch (err) { axiosToastError(err); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="section-heading text-2xl">Delivery Zones</h1><p className="text-sm text-theme-muted">Set different delivery charges for different areas</p></div>
        <button onClick={() => setModal("new")} className="btn-primary flex items-center gap-2 px-4 py-2"><FaPlus size={12}/> Add Zone</button>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({length:3}).map((_,i) => <div key={i} className="skeleton h-20 rounded-2xl"/>)}</div>
      ) : zones.length === 0 ? (
        <div className="text-center py-16 text-theme-muted">No delivery zones configured yet — orders will have ৳0 delivery charge until you add one.</div>
      ) : (
        <div className="space-y-3">
          {zones.map(z => (
            <div key={z._id} className="bg-[var(--color-surface)] border border-theme rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-full bg-theme-primary text-white flex items-center justify-center shrink-0"><FaTruck size={14}/></div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{z.name}</h3>
                    {z.isDefault && <span className="badge text-[10px] flex items-center gap-1"><FaStar size={8}/> Default</span>}
                    {!z.isActive && <span className="badge text-[10px] bg-gray-100 text-gray-500">Inactive</span>}
                  </div>
                  <p className="text-xs text-theme-muted truncate">{z.matchCities?.join(", ") || "No cities matched — only used as default"}</p>
                  {z.estimatedDays && <p className="text-xs text-theme-muted">Est. delivery: {z.estimatedDays}</p>}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <p className="font-bold text-theme-primary">{displayPrice(z.charge, currency, rates)}</p>
                  {z.freeDeliveryThreshold > 0 && <p className="text-xs text-theme-muted">Free above {displayPrice(z.freeDeliveryThreshold, currency, rates)}</p>}
                </div>
                <button onClick={() => setModal(z)} className="icon-btn"><FaEdit size={14}/></button>
                <button onClick={() => setDeleting(z._id)} className="icon-btn icon-btn-danger"><FaTrash size={14}/></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <ZoneModal defaultValues={modal === "new" ? null : modal} onClose={() => setModal(null)} onSaved={load}/>}
      {deleting && <ConfirmBox title="Delete delivery zone?" danger confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setDeleting(null)}/>}
    </div>
  );
}
