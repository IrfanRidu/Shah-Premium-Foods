"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { FaPlus, FaEdit, FaTrash, FaLock, FaTimes, FaUserShield } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError, isSuperAdmin } from "@/lib/utils";
import ConfirmBox from "@/components/ConfirmBox";
import toast from "react-hot-toast";

const MODULES = [
  { key: "dashboard",  label: "Dashboard",     actions: ["view"] },
  { key: "products",   label: "Products",      actions: ["view","create","edit","delete"] },
  { key: "categories", label: "Categories",    actions: ["view","create","edit","delete"] },
  { key: "orders",     label: "Orders",        actions: ["view","edit","cancel"] },
  { key: "customers",  label: "Customers",     actions: ["view","export","call"] },
  { key: "inventory",  label: "Inventory",     actions: ["view","edit"] },
  { key: "coupons",    label: "Coupons",       actions: ["view","create","edit","delete"] },
  { key: "campaigns", label: "Campaigns",     actions: ["view","create","edit","delete"] },
  { key: "analytics",  label: "Analytics",     actions: ["view"] },
  { key: "settings",   label: "Site Settings", actions: ["view","edit"] },
  { key: "roles",      label: "Roles & Staff", actions: ["view","create","edit","delete"] },
  { key: "customerCare", label: "Customer Care", actions: ["view","edit"] },
  { key: "hrPayroll",    label: "HR & Payroll",  actions: ["view","edit"] },
];

const emptyPerms = () => MODULES.reduce((acc, m) => {
  acc[m.key] = m.actions.reduce((a, act) => ({ ...a, [act]: false }), {});
  return acc;
}, {});

function RoleModal({ defaultValues, onClose, onSaved }) {
  const isEdit = !!defaultValues?._id;
  const [label, setLabel] = useState(defaultValues?.label || "");
  const [name,  setName]  = useState(defaultValues?.name  || "");
  const [description, setDescription] = useState(defaultValues?.description || "");
  const [perms, setPerms] = useState(defaultValues?.permissions || emptyPerms());
  const [saving, setSaving] = useState(false);

  const toggle = (module, action) => setPerms(prev => ({
    ...prev, [module]: { ...prev[module], [action]: !prev[module]?.[action] },
  }));

  const save = async () => {
    if (!label.trim() || (!isEdit && !name.trim())) { toast.error("Name and label required"); return; }
    try {
      setSaving(true);
      let r;
      if (isEdit) r = await Axios({ ...api.updateRole, data: { _id: defaultValues._id, label, description, permissions: perms } });
      else        r = await Axios({ ...api.createRole, data: { name, label, description, permissions: perms } });
      if (r.data?.success) { toast.success(isEdit ? "Role updated" : "Role created"); onSaved(); onClose(); }
    } catch (err) { axiosToastError(err); } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl font-bold">{isEdit ? "Edit" : "Create"} Role</h2>
          <button onClick={onClose}><FaTimes/></button>
        </div>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid sm:grid-cols-2 gap-4">
            {!isEdit && (
              <div>
                <label className="block text-sm font-medium mb-1">Role ID (no spaces) *</label>
                <input value={name} onChange={e => setName(e.target.value.toUpperCase().replace(/\s+/g,"_"))} className="input-field font-mono" placeholder="WAREHOUSE_STAFF"/>
              </div>
            )}
            <div className={isEdit ? "sm:col-span-2" : ""}>
              <label className="block text-sm font-medium mb-1">Display Label *</label>
              <input value={label} onChange={e => setLabel(e.target.value)} className="input-field" placeholder="Warehouse Staff"/>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)} className="input-field" placeholder="What can this role do?"/>
            </div>
          </div>

          <div className="border-t border-theme pt-4">
            <h3 className="font-semibold mb-3 text-sm">Permissions</h3>
            <div className="space-y-2">
              {MODULES.map(m => (
                <div key={m.key} className="flex items-center gap-3 bg-[var(--color-bg)] border border-theme rounded-xl px-3 py-2.5">
                  <span className="text-sm font-medium w-28 shrink-0">{m.label}</span>
                  <div className="flex gap-3 flex-wrap">
                    {m.actions.map(act => (
                      <label key={act} className="flex items-center gap-1.5 text-xs cursor-pointer capitalize">
                        <input type="checkbox" checked={!!perms[m.key]?.[act]} onChange={() => toggle(m.key, act)} className="h-3.5 w-3.5 accent-[var(--color-primary)]"/>
                        {act}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-4 border-t border-theme mt-4">
          <button onClick={onClose} className="btn-outline px-5 py-2">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary px-5 py-2">{saving ? "Saving…" : "Save Role"}</button>
        </div>
      </div>
    </div>
  );
}

export default function RolesPage() {
  const myRole = useSelector((s) => s.user.role);
  const [roles,    setRoles]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    try { setLoading(true); const r = await Axios({ ...api.getAllRoles }); setRoles(r.data?.data || []); }
    catch (err) { axiosToastError(err); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async () => {
    try { await Axios({ ...api.deleteRole, data: { _id: deleting } }); toast.success("Role deleted"); setDeleting(null); load(); }
    catch (err) { axiosToastError(err); }
  };

  if (!isSuperAdmin(myRole)) {
    return (
      <div className="text-center py-20">
        <FaLock className="text-4xl text-theme-muted mx-auto mb-3"/>
        <p className="text-theme-muted">Only the Super Admin can manage roles and permissions.</p>
      </div>
    );
  }

  const countPerms = (perms) => {
    let count = 0;
    Object.values(perms || {}).forEach(mod => Object.values(mod).forEach(v => { if (v) count++; }));
    return count;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-heading text-2xl flex items-center gap-2"><FaUserShield className="text-theme-primary"/>Roles & Permissions</h1>
          <p className="text-sm text-theme-muted">Create custom staff roles with granular module access</p>
        </div>
        <button onClick={() => setModal("new")} className="btn-primary flex items-center gap-2 px-4 py-2"><FaPlus size={12}/> New Role</button>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({length:5}).map((_,i) => <div key={i} className="skeleton h-16 rounded-2xl"/>)}</div>
      ) : (
        <div className="space-y-3">
          {roles.map(role => (
            <div key={role._id} className="bg-[var(--color-surface)] border border-theme rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${role.isSystemRole ? "bg-theme-primary text-white" : "bg-[var(--color-border)] text-theme-muted"}`}>
                  {role.isSystemRole ? <FaLock size={14}/> : <FaUserShield size={14}/>}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold truncate">{role.label}</h3>
                    <span className="text-xs font-mono text-theme-muted">({role.name})</span>
                    {role.isSystemRole && <span className="badge text-[10px]">System</span>}
                  </div>
                  <p className="text-xs text-theme-muted truncate">{role.description}</p>
                  <p className="text-xs text-theme-muted mt-0.5">{countPerms(role.permissions)} permissions granted</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setModal(role)} className="icon-btn" title="Edit permissions"><FaEdit size={14}/></button>
                {!role.isSystemRole && (
                  <button onClick={() => setDeleting(role._id)} className="icon-btn icon-btn-danger" title="Delete role"><FaTrash size={14}/></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-theme-muted mt-6">
        System roles (SUPERADMIN, ADMIN, MANAGER, STAFF, ANALYST, USER) cannot be deleted but their permissions can be customized.
        Assign roles to specific staff members from the Customers page.
      </p>

      {modal && <RoleModal defaultValues={modal === "new" ? null : modal} onClose={() => setModal(null)} onSaved={load}/>}
      {deleting && <ConfirmBox title="Delete this role?" message="Users with this role must be reassigned first." danger confirmLabel="Delete" onConfirm={handleDelete} onCancel={() => setDeleting(null)}/>}
    </div>
  );
}
