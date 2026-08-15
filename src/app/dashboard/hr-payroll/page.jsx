"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useSelector } from "react-redux";
import {
  FaUserTie, FaPlus, FaEdit, FaTrash, FaMoneyCheckAlt, FaUsers,
  FaChevronLeft, FaChevronRight, FaTimes, FaPrint, FaReceipt,
  FaFileAlt, FaUser, FaClock, FaCalendarAlt, FaStar, FaDownload,
  FaExclamationTriangle, FaCheckCircle, FaClipboardCheck, FaHistory, FaCamera,
} from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { displayPrice, axiosToastError, isSuperAdmin, hasFullDashboardAccess } from "@/lib/utils";
import toast from "react-hot-toast";
import FaceCaptureModal from "@/components/FaceCaptureModal";

const STATUSES = ["Active", "On Leave", "Terminated"];
const STATUS_COLOR = {
  Active: "bg-green-100 text-green-700",
  "On Leave": "bg-yellow-100 text-yellow-700",
  Terminated: "bg-red-100 text-red-700",
};
const TYPES = ["Full-time", "Part-time", "Contract", "Intern"];
// Must exactly match PROVISIONABLE_ROLES in hrPayroll.controller.js — kept
// as a fixed, safe list rather than pulling every role from the Roles &
// Staff page, so this form can never accidentally offer to hand out
// ADMIN/SUPERADMIN access. Call Center Agent (Session 2): now supported
// here too — the server side generates SIP credentials + sets
// isCallCenterAgent automatically when this is selected, same as the
// dedicated Customer Care page flow, so an agent created from either
// form ends up fully working, not a lesser duplicate.
const PROVISIONABLE_ROLES = [
  { value: "HR",      label: "HR" },
  { value: "MANAGER", label: "Manager" },
  { value: "STAFF",   label: "Staff" },
  { value: "ANALYST", label: "Analyst" },
  { value: "CALL_CENTER_AGENT", label: "Call Center Agent" },
];

const emptyForm = {
  _id: null, name: "", email: "", phone: "", designation: "", department: "",
  employmentType: "Full-time", monthlySalary: "", status: "Active", bankAccount: "", notes: "",
  createLogin: false, roleName: "HR", password: "",
};

function EmployeeModal({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState(null); // { email, tempPassword, roleName } once created with a login
  const isEdit = !!initial._id;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (form.createLogin && !isEdit && !form.email.trim()) { toast.error("Email is required to create a dashboard login"); return; }
    try {
      setSaving(true);
      const payload = { ...form, monthlySalary: Number(form.monthlySalary) || 0 };
      if (form.createLogin && !isEdit) {
        const r = await Axios({ ...api.createEmployeeWithLogin, data: payload });
        if (r.data?.success) {
          // isDemoAction (Demo Admin): the simulated response has no real
          // tempPassword to show — skip the credentials panel and just
          // close normally, same as any other simulated save.
          if (r.data.isDemoAction) { toast.success(r.data.message); onSaved(); onClose(); return; }
          toast.success(r.data.message || "Employee added with a dashboard login");
          setCredentials({ email: payload.email, tempPassword: r.data.tempPassword, roleName: payload.roleName });
          onSaved();
          return; // stay open — the temp password below is only ever shown this once
        }
      } else {
        const r = await Axios(
          isEdit ? { ...api.updateEmployee, data: payload } : { ...api.createEmployee, data: payload }
        );
        if (r.data?.success) {
          toast.success(isEdit ? "Employee updated" : "Employee added");
          onSaved();
          onClose();
        }
      }
    } catch (err) {
      axiosToastError(err);
    } finally {
      setSaving(false);
    }
  };

  // One-time credentials panel — replaces the form once a login has been
  // created, since the temp password genuinely can't be retrieved again
  // after this (it's stored hashed, same as any real password).
  if (credentials) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
        <div className="bg-[var(--color-surface)] rounded-2xl w-full max-w-sm p-6 text-center">
          <h2 className="font-display text-lg font-semibold mb-1">Login created</h2>
          <p className="text-sm text-theme-muted mb-4">
            Share these with {form.name.split(" ")[0] || "them"} now — the password can't be shown again after you close this.
          </p>
          <div className="bg-[var(--color-bg)] border border-theme rounded-xl p-3 text-left space-y-1.5 mb-5">
            <p className="text-xs text-theme-muted">Role</p>
            <p className="font-semibold text-sm mb-2">{credentials.roleName}</p>
            <p className="text-xs text-theme-muted">Email</p>
            <p className="font-mono text-sm mb-2 break-all">{credentials.email}</p>
            <p className="text-xs text-theme-muted">Temporary password</p>
            <p className="font-mono text-sm font-bold break-all">{credentials.tempPassword}</p>
          </div>
          <button onClick={onClose} className="btn-primary px-5 py-2 text-sm w-full">Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-[var(--color-surface)] rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6">
        <h2 className="font-display text-lg font-semibold mb-4">{isEdit ? "Edit Employee" : "Add Employee"}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1.5">Full Name *</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <input value={form.email} onChange={(e) => set("email", e.target.value)} type="email" className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Phone</label>
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Designation</label>
            <input value={form.designation} onChange={(e) => set("designation", e.target.value)} className="input-field" placeholder="e.g. Warehouse Lead" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Department</label>
            <input value={form.department} onChange={(e) => set("department", e.target.value)} className="input-field" placeholder="e.g. Operations" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Employment Type</label>
            <select value={form.employmentType} onChange={(e) => set("employmentType", e.target.value)} className="input-field">
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Status</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value)} className="input-field">
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Monthly Salary</label>
            <input value={form.monthlySalary} onChange={(e) => set("monthlySalary", e.target.value)} type="number" min="0" className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Bank Account</label>
            <input value={form.bankAccount} onChange={(e) => set("bankAccount", e.target.value)} className="input-field" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="input-field resize-none" />
          </div>

          {/* Employee "types" — "HR, Call center agent, and others which
              Super admin, HR, admin can add." Call Center Agent has its
              own flow on the Customer Care page; this covers the rest.
              Only offered when adding someone new — retrofitting a login
              onto an existing HR-only record isn't handled by this form. */}
          {!isEdit && (
            <div className="sm:col-span-2 border-t border-theme pt-3 mt-1">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                <input type="checkbox" checked={form.createLogin} onChange={(e) => set("createLogin", e.target.checked)} className="h-4 w-4" />
                Also create a dashboard login for this person
              </label>
              {form.createLogin && (
                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Employee Type (role)</label>
                    <select value={form.roleName} onChange={(e) => set("roleName", e.target.value)} className="input-field">
                      {PROVISIONABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Initial Password</label>
                    <input value={form.password} onChange={(e) => set("password", e.target.value)} className="input-field" placeholder="Leave blank to auto-generate" />
                  </div>
                  <p className="sm:col-span-2 text-xs text-theme-muted -mt-1">
                    Email above will become their login. A one-time password is shown right after you save — make sure you're ready to note it down.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-outline px-4 py-2 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmployeesTab() {
  const [employees, setEmployees] = useState([]);
  const [totalMonthlySalary, setTotalMonthlySalary] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | {} (add) | employee (edit)
  const [deleting, setDeleting] = useState(null);
  const [fileEmployeeId, setFileEmployeeId] = useState(null); // employee whose digital file drawer is open, or null
  const currency = useSelector((s) => s.currency.baseCurrency); // item 7: admin reporting always shows the official base currency, not any personal storefront override
  const rates    = useSelector((s) => s.currency.rates);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await Axios({ ...api.getEmployees });
      if (r.data?.success) {
        setEmployees(r.data.data.employees || []);
        setTotalMonthlySalary(r.data.data.totalMonthlySalary || 0);
      }
    } catch (err) { axiosToastError(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    try {
      const r = await Axios({ ...api.deleteEmployee, data: { _id: deleting } });
      if (r.data?.success) { toast.success("Employee removed"); setDeleting(null); load(); }
    } catch (err) { axiosToastError(err); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="bg-[var(--color-surface)] border border-theme rounded-xl px-4 py-2.5 flex items-center gap-2">
          <FaMoneyCheckAlt className="text-theme-primary" />
          <span className="text-sm text-theme-muted">Total monthly payroll (active staff):</span>
          <span className="font-bold text-theme-primary">{displayPrice(totalMonthlySalary, currency, rates)}</span>
        </div>
        <button onClick={() => setModal(emptyForm)} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm">
          <FaPlus size={12} /> Add Employee
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-theme-muted">Loading employees…</div>
      ) : employees.length === 0 ? (
        <div className="text-center py-16 text-theme-muted">No employees added yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-theme-muted border-b border-theme">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Designation</th>
                <th className="py-2 pr-3 font-medium">Department</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Login</th>
                <th className="py-2 pr-3 font-medium">Salary</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp._id} className="border-b border-theme last:border-0">
                  <td className="py-2.5 pr-3 font-medium">{emp.name}</td>
                  <td className="py-2.5 pr-3 text-theme-muted">{emp.designation || "—"}</td>
                  <td className="py-2.5 pr-3 text-theme-muted">{emp.department || "—"}</td>
                  <td className="py-2.5 pr-3 text-theme-muted">{emp.employmentType}</td>
                  <td className="py-2.5 pr-3">
                    {emp.userId
                      ? <span className="badge text-[11px]" title={emp.userId.email}>{emp.userId.role}</span>
                      : <span className="text-theme-muted text-xs">—</span>
                    }
                  </td>
                  <td className="py-2.5 pr-3 font-semibold">{displayPrice(emp.monthlySalary, currency, rates)}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[emp.status]}`}>{emp.status}</span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="action-group justify-end">
                      <button onClick={() => setFileEmployeeId(emp._id)} title="View employee file" className="icon-btn"><FaFileAlt size={13} /></button>
                      <button onClick={() => setModal(emp)} className="icon-btn"><FaEdit size={13} /></button>
                      <button onClick={() => setDeleting(emp._id)} className="icon-btn icon-btn-danger"><FaTrash size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <EmployeeModal
          initial={modal._id ? modal : emptyForm}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-[var(--color-surface)] rounded-2xl w-full max-w-sm p-6 text-center">
            <p className="mb-5">Remove this employee? Their payroll history will also be deleted.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setDeleting(null)} className="btn-outline px-4 py-2 text-sm">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm rounded-xl bg-red-500 text-white hover:bg-red-600">Remove</button>
            </div>
          </div>
        </div>
      )}

      {fileEmployeeId && (
        <EmployeeFileDrawer employeeId={fileEmployeeId} onClose={() => setFileEmployeeId(null)} />
      )}
    </div>
  );
}

function monthLabel(m) {
  if (!m) return "";
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function shiftMonth(m, delta) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function InfoField({ label, value }) {
  return (
    <div>
      <p className="text-theme-muted">{label}</p>
      <p className="font-semibold">{value || "—"}</p>
    </div>
  );
}

function PlaceholderSection({ title, icon: Icon, note }) {
  return (
    <section>
      <h3 className="text-xs uppercase tracking-widest text-theme-muted font-semibold mb-2 flex items-center gap-1.5">
        <Icon size={11} /> {title}
      </h3>
      <p className="text-xs text-theme-muted italic">{note}</p>
    </section>
  );
}

const EVENT_TYPE_META = {
  performance_review: { label: "Performance Reviews", icon: FaStar, placeholder: "e.g. Q3 2026 Review — Exceeds Expectations" },
  warning:             { label: "Warnings", icon: FaExclamationTriangle, placeholder: "e.g. Late attendance — 3rd occurrence" },
  promotion:           { label: "Promotions", icon: FaCheckCircle, placeholder: "e.g. Promoted to Senior Associate" },
  training:            { label: "Training Records", icon: FaClipboardCheck, placeholder: "e.g. Fire Safety & First Aid — Completed" },
};

// One reusable section for all 4 event types rather than 4 near-identical
// blocks — see employeeEvent.model.js's own comment for why these share
// a single model+shape in the first place.
function EventSection({ type, items, employeeId, canEdit, onChanged }) {
  const meta = EVENT_TYPE_META[type];
  const Icon = meta.icon;
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    try {
      setSaving(true);
      const r = await Axios({ ...api.addEmployeeEvent, data: { employeeId, type, title: title.trim(), note: note.trim() } });
      if (r.data?.success) {
        toast.success(r.data.isDemoAction ? r.data.message : "Added to employee file");
        setTitle(""); setNote(""); setAdding(false);
        // Demo Admin: same reasoning as PayrollModal's save() above — the
        // simulated response echoes the request body, not a real saved
        // document (no _id/createdBy/etc), so skip the refetch and just
        // let the toast confirm nothing was really written.
        if (!r.data.isDemoAction) onChanged();
      }
    } catch (err) { axiosToastError(err); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    try {
      const r = await Axios({ ...api.deleteEmployeeEvent, data: { _id: id } });
      if (r.data?.success) {
        toast.success(r.data.isDemoAction ? r.data.message : "Removed");
        if (!r.data.isDemoAction) onChanged();
      }
    } catch (err) { axiosToastError(err); }
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs uppercase tracking-widest text-theme-muted font-semibold flex items-center gap-1.5">
          <Icon size={11} /> {meta.label}
        </h3>
        {canEdit && (
          <button onClick={() => setAdding((a) => !a)} className="text-xs text-theme-primary font-semibold hover:underline">
            {adding ? "Cancel" : "+ Add"}
          </button>
        )}
      </div>
      {adding && (
        <div className="bg-[var(--color-bg)] border border-theme rounded-lg p-2.5 mb-2 space-y-1.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={meta.placeholder} className="input-field py-1.5 text-xs w-full" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" rows={2} className="input-field py-1.5 text-xs w-full resize-none" />
          <div className="flex justify-end">
            <button onClick={submit} disabled={saving} className="btn-primary px-3 py-1 text-xs disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-xs text-theme-muted">None recorded yet.</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((it) => (
            <div key={it._id} className="text-xs bg-[var(--color-bg)] border border-theme rounded-lg px-3 py-2 flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{it.title}</p>
                {it.note && <p className="text-theme-muted mt-0.5">{it.note}</p>}
                <p className="text-theme-muted mt-1">{it.createdBy?.name || "—"} · {new Date(it.date).toLocaleDateString()}</p>
              </div>
              {canEdit && (
                <button onClick={() => remove(it._id)} className="icon-btn icon-btn-danger shrink-0"><FaTrash size={11} /></button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Real data now (Phase C) — was a placeholder section in Phase B before
// the document generation engine existed. Kept as its own small
// component (not inlined into EmployeeFileDrawer) since it does its own
// fetch, same reasoning as EventSection above.
function GeneratedDocumentsSection({ employeeId }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await Axios({ ...api.getGeneratedDocuments, params: { employeeId } });
        if (r.data?.success) setDocs(r.data.data);
      } catch (err) { axiosToastError(err); }
      finally { setLoading(false); }
    })();
  }, [employeeId]);

  const download = async (doc) => {
    try {
      const r = await Axios({ ...api.downloadGeneratedDocument, params: { _id: doc._id } });
      if (r.data?.success) downloadBase64File(r.data.data.base64, r.data.data.fileName, r.data.data.mimeType);
    } catch (err) { axiosToastError(err); }
  };

  return (
    <section>
      <h3 className="text-xs uppercase tracking-widest text-theme-muted font-semibold mb-2 flex items-center gap-1.5">
        <FaFileAlt size={11} /> Generated Documents
      </h3>
      {loading ? (
        <p className="text-xs text-theme-muted">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-theme-muted">None generated yet — use the Documents tab to generate one.</p>
      ) : (
        <div className="space-y-1.5">
          {docs.map((d) => (
            <div key={d._id} className="text-xs bg-[var(--color-bg)] border border-theme rounded-lg px-3 py-2 flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{d.templateName || d.documentType}</p>
                <p className="text-theme-muted mt-0.5">{d.documentType} · {new Date(d.createdAt).toLocaleDateString()} · {d.format.toUpperCase()}</p>
              </div>
              <button onClick={() => download(d)} title="Download" className="icon-btn shrink-0"><FaDownload size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Duplicated from employeeDocument.model.js's own EMPLOYEE_DOCUMENT_TYPES
// export rather than imported — same reason and same sync-comment
// pattern as DOCUMENT_TYPES above (Mongoose/server-only can't be
// bundled into client code).
const EMPLOYEE_DOCUMENT_TYPES = [
  "Passport", "National ID", "Driving License", "Birth Certificate",
  "Educational Certificate", "Experience Certificate", "Bank Document",
  "Tax Document", "Other",
];

function UploadEmployeeDocumentModal({ employeeId, onClose, onUploaded }) {
  const [documentType, setDocumentType] = useState("Passport");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!file) { toast.error("Choose a file"); return; }
    try {
      setSaving(true);
      const fd = new FormData();
      fd.append("employeeId", employeeId);
      fd.append("documentType", documentType);
      fd.append("file", file);
      const r = await Axios({ ...api.uploadEmployeeDocument, data: fd });
      if (r.data?.success) {
        toast.success(r.data.message || "Uploaded");
        if (!r.data.isDemoAction) onUploaded();
        onClose();
      }
    } catch (err) { axiosToastError(err); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-[var(--color-surface)] rounded-2xl w-full max-w-md p-6">
        <h2 className="font-display text-lg font-semibold mb-4">Upload Document</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Document type</label>
            <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="input-field py-2 text-sm w-full">
              {EMPLOYEE_DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Photo or PDF scan</label>
            <input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="input-field py-2 text-sm w-full" />
            <p className="text-xs text-theme-muted mt-1">
              For passports and National IDs, key fields are read automatically — you'll get a chance to review and correct anything before it's saved to the profile. Other document types are stored but not auto-filled.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-outline px-4 py-2 text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">{saving ? "Uploading…" : "Upload"}</button>
        </div>
      </div>
    </div>
  );
}

// Advanced HRMS Features spec: "Highlight low-confidence fields for
// manual review... The HR user can edit extracted values before
// saving." Every field is editable regardless of confidence (OCR can be
// wrong even when "confident"), but low-confidence ones get a visible
// nudge to actually double-check rather than rubber-stamp.
function ReviewDocumentModal({ doc, onClose, onReviewed }) {
  const [fields, setFields] = useState(doc.extractedFields?.length ? doc.extractedFields : []);
  const [saving, setSaving] = useState(false);

  const update = (i, val) => setFields((f) => f.map((item, idx) => (idx === i ? { ...item, value: val } : item)));
  const addField = () => setFields((f) => [...f, { field: "", value: "", confidence: 0 }]);
  const removeField = (i) => setFields((f) => f.filter((_, idx) => idx !== i));

  const submit = async () => {
    try {
      setSaving(true);
      const r = await Axios({ ...api.reviewEmployeeDocument, data: { _id: doc._id, fields: fields.filter((f) => f.field?.trim()) } });
      if (r.data?.success) {
        toast.success(r.data.isDemoAction ? r.data.message : "Applied to the employee profile");
        if (!r.data.isDemoAction) onReviewed();
        onClose();
      }
    } catch (err) { axiosToastError(err); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-[var(--color-surface)] rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6">
        <h2 className="font-display text-lg font-semibold mb-1">Review: {doc.documentType}</h2>
        <p className="text-sm text-theme-muted mb-4">{doc.fileName}</p>

        {fields.length === 0 ? (
          <p className="text-sm text-theme-muted mb-3">No fields were automatically extracted from this document. Add them manually below, or just mark it reviewed as-is.</p>
        ) : (
          <div className="space-y-2 mb-2">
            {fields.map((f, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-xs text-theme-muted flex items-center gap-1.5 mb-1 capitalize">
                    {f.field.replace(/_/g, " ")}
                    {f.confidence > 0 && f.confidence < 0.7 && (
                      <span className="text-amber-600 font-semibold normal-case" title="Low confidence — please double-check this value">⚠ double-check this</span>
                    )}
                  </label>
                  <input value={f.value} onChange={(e) => update(i, e.target.value)} className="input-field py-1.5 text-sm w-full" />
                </div>
                <button onClick={() => removeField(i)} className="icon-btn icon-btn-danger"><FaTimes size={11} /></button>
              </div>
            ))}
          </div>
        )}
        <button onClick={addField} className="text-xs text-theme-primary font-semibold hover:underline mb-4">+ Add field manually</button>

        <p className="text-xs text-theme-muted mb-4">Applying will update the employee's profile with these values (blank fields are skipped; anything not listed here stays untouched).</p>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-outline px-4 py-2 text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">{saving ? "Saving…" : "Apply to Profile"}</button>
        </div>
      </div>
    </div>
  );
}

function UploadedDocumentsSection({ employeeId }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reviewDoc, setReviewDoc] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await Axios({ ...api.getEmployeeDocuments, params: { employeeId } });
      if (r.data?.success) setDocs(r.data.data);
    } catch (err) { axiosToastError(err); }
    finally { setLoading(false); }
  }, [employeeId]);
  useEffect(() => { load(); }, [load]);

  const download = async (doc) => {
    try {
      const r = await Axios({ ...api.downloadEmployeeDocument, params: { _id: doc._id } });
      if (r.data?.success) downloadBase64File(r.data.data.base64, r.data.data.fileName, r.data.data.mimeType);
    } catch (err) { axiosToastError(err); }
  };

  const remove = async (id) => {
    try {
      const r = await Axios({ ...api.deleteEmployeeDocument, data: { _id: id } });
      if (r.data?.success) {
        toast.success(r.data.isDemoAction ? r.data.message : "Deleted");
        if (!r.data.isDemoAction) load();
      }
    } catch (err) { axiosToastError(err); }
  };

  const statusColor = (status) =>
    status === "Reviewed" ? "bg-green-100 text-green-700" : status === "Failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs uppercase tracking-widest text-theme-muted font-semibold flex items-center gap-1.5">
          <FaFileAlt size={11} /> Uploaded Documents
        </h3>
        <button onClick={() => setUploadOpen(true)} className="text-xs text-theme-primary font-semibold hover:underline">+ Upload</button>
      </div>
      {loading ? (
        <p className="text-xs text-theme-muted">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-theme-muted">None uploaded yet.</p>
      ) : (
        <div className="space-y-1.5">
          {docs.map((d) => (
            <div key={d._id} className="text-xs bg-[var(--color-bg)] border border-theme rounded-lg px-3 py-2 flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold flex items-center gap-1.5">
                  {d.documentType}
                  <span className={`px-1.5 py-0.5 rounded-full font-bold text-[10px] ${statusColor(d.status)}`}>{d.status}</span>
                </p>
                <p className="text-theme-muted mt-0.5">{d.fileName} · {new Date(d.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="action-group shrink-0">
                {d.status === "Needs Review" && (
                  <button onClick={() => setReviewDoc(d)} className="btn-primary px-2.5 py-1 text-xs">Review</button>
                )}
                <button onClick={() => download(d)} title="Download" className="icon-btn"><FaDownload size={11} /></button>
                <button onClick={() => remove(d._id)} title="Delete" className="icon-btn icon-btn-danger"><FaTrash size={11} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {uploadOpen && <UploadEmployeeDocumentModal employeeId={employeeId} onClose={() => setUploadOpen(false)} onUploaded={load} />}
      {reviewDoc && <ReviewDocumentModal doc={reviewDoc} onClose={() => setReviewDoc(null)} onReviewed={load} />}
    </section>
  );
}

function localDateString(d = new Date()) {
  // Mirrors attendanceService.js's server-side todayString() exactly —
  // same local-date-key reasoning (a plain YYYY-MM-DD string
  // sidesteps timezone-range-query ambiguity entirely), duplicated
  // client-side for the same reason DOCUMENT_TYPES etc. are: server
  // files can't be imported into client bundles.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Spec: "If biometric hardware is unavailable, manual attendance must
// continue to work" — read by this session as including HR's ability
// to backfill a forgotten day or correct a mistake, not just an
// employee's own self-service buttons (see the "My Attendance" personal
// page for that side). `checkIn`/`checkOut` use `datetime-local` inputs
// so HR can set a specific time, not just a date.
function AttendanceEditModal({ employeeId, record, onClose, onSaved }) {
  const toLocalInput = (d) => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  const [date, setDate] = useState(record.date);
  const [checkIn, setCheckIn] = useState(toLocalInput(record.checkIn));
  const [checkOut, setCheckOut] = useState(toLocalInput(record.checkOut));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!date) { toast.error("Date is required"); return; }
    try {
      setSaving(true);
      const r = await Axios({
        ...api.overrideAttendance,
        data: { employeeId, date, checkIn: checkIn ? new Date(checkIn).toISOString() : null, checkOut: checkOut ? new Date(checkOut).toISOString() : null },
      });
      if (r.data?.success) {
        toast.success(r.data.isDemoAction ? r.data.message : "Attendance updated");
        if (!r.data.isDemoAction) onSaved();
        onClose();
      }
    } catch (err) { axiosToastError(err); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-[var(--color-surface)] rounded-2xl w-full max-w-sm p-6">
        <h2 className="font-display text-lg font-semibold mb-4">Correct Attendance</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Check In</label>
            <input type="datetime-local" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="input-field py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Check Out</label>
            <input type="datetime-local" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="input-field py-2 text-sm w-full" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-outline px-4 py-2 text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function AttendanceSection({ employeeId, canEdit }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await Axios({ ...api.getAttendanceHistory, params: { employeeId } });
      if (r.data?.success) setRecords(r.data.data);
    } catch (err) { axiosToastError(err); }
    finally { setLoading(false); }
  }, [employeeId]);
  useEffect(() => { load(); }, [load]);

  const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");
  const fmtHours = (mins) => (mins ? `${(mins / 60).toFixed(1)}h` : "—");

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs uppercase tracking-widest text-theme-muted font-semibold flex items-center gap-1.5">
          <FaClock size={11} /> Attendance
        </h3>
        {canEdit && (
          <button onClick={() => setEditing({ date: localDateString(), checkIn: "", checkOut: "" })} className="text-xs text-theme-primary font-semibold hover:underline">
            + Add / Correct
          </button>
        )}
      </div>
      {loading ? (
        <p className="text-xs text-theme-muted">Loading…</p>
      ) : records.length === 0 ? (
        <p className="text-xs text-theme-muted">No attendance recorded yet.</p>
      ) : (
        <div className="space-y-1.5">
          {records.slice(0, 10).map((r) => (
            <div key={r._id} className="text-xs bg-[var(--color-bg)] border border-theme rounded-lg px-3 py-2 flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{r.date}</p>
                <p className="text-theme-muted mt-0.5">In {fmtTime(r.checkIn)} ({r.checkInMethod || "—"}) · Out {fmtTime(r.checkOut)} ({r.checkOutMethod || "—"})</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-bold">{fmtHours(r.workMinutes)}</span>
                {canEdit && <button onClick={() => setEditing(r)} title="Correct this day" className="icon-btn"><FaEdit size={11} /></button>}
              </div>
            </div>
          ))}
          {records.length > 10 && <p className="text-xs text-theme-muted text-center pt-1">+{records.length - 10} more day{records.length - 10 === 1 ? "" : "s"}</p>}
        </div>
      )}
      {editing && <AttendanceEditModal employeeId={employeeId} record={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </section>
  );
}

// Spec: "Design the system so it can integrate with fingerprint
// scanners that expose SDKs or local APIs." This app never captures a
// raw fingerprint — "enrollment" here means telling this app which
// device-issued template/user ID corresponds to which employee, so the
// scanner's webhook (see attendance.controller.js's
// fingerprintWebhookController) can find the right person later. The
// actual capture happens on the vendor's own hardware, entirely outside
// this app.
function EnrollFingerprintModal({ employeeId, currentTemplateId, onClose, onSaved }) {
  const [templateId, setTemplateId] = useState(currentTemplateId || "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!templateId.trim()) { toast.error("Enter a fingerprint template ID"); return; }
    try {
      setSaving(true);
      const r = await Axios({ ...api.enrollFingerprint, data: { employeeId, fingerprintTemplateId: templateId.trim() } });
      if (r.data?.success) {
        toast.success(r.data.isDemoAction ? r.data.message : "Fingerprint template linked");
        if (!r.data.isDemoAction) onSaved();
        onClose();
      }
    } catch (err) { axiosToastError(err); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-[var(--color-surface)] rounded-2xl w-full max-w-sm p-6">
        <h2 className="font-display text-lg font-semibold mb-2">Link Fingerprint Template</h2>
        <p className="text-xs text-theme-muted mb-4">
          Enter the template/user ID your fingerprint scanner reports for this employee. This links that device-issued ID to their profile — the fingerprint itself is captured and stored on the scanner hardware, never here.
        </p>
        <input value={templateId} onChange={(e) => setTemplateId(e.target.value)} placeholder="e.g. device user ID from the scanner" className="input-field py-2 text-sm w-full" />
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-outline px-4 py-2 text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function BiometricEnrollmentSection({ employeeId, employee, canEdit, onChanged }) {
  const [faceModalOpen, setFaceModalOpen] = useState(false);
  const [fingerprintModalOpen, setFingerprintModalOpen] = useState(false);

  return (
    <section>
      <h3 className="text-xs uppercase tracking-widest text-theme-muted font-semibold mb-2 flex items-center gap-1.5">
        <FaCamera size={11} /> Biometric Enrollment
      </h3>
      <div className="bg-[var(--color-bg)] border border-theme rounded-lg p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold">Facial Recognition</p>
            <p className="text-xs text-theme-muted">{employee.faceEnrolledAt ? `Enrolled ${new Date(employee.faceEnrolledAt).toLocaleDateString()}` : "Not enrolled"}</p>
          </div>
          {canEdit && (
            <button onClick={() => setFaceModalOpen(true)} className="btn-outline px-3 py-1.5 text-xs">{employee.faceEnrolledAt ? "Re-enroll" : "Enroll"}</button>
          )}
        </div>
        <div className="flex items-center justify-between pt-2.5 border-t border-theme">
          <div>
            <p className="text-xs font-semibold">Fingerprint</p>
            <p className="text-xs text-theme-muted">{employee.fingerprintEnrolledAt ? `Linked ${new Date(employee.fingerprintEnrolledAt).toLocaleDateString()}` : "Not linked"}</p>
          </div>
          {canEdit && (
            <button onClick={() => setFingerprintModalOpen(true)} className="btn-outline px-3 py-1.5 text-xs">{employee.fingerprintEnrolledAt ? "Update" : "Link Device"}</button>
          )}
        </div>
      </div>

      {faceModalOpen && (
        <FaceCaptureModal purpose="enroll" employeeId={employeeId} title={`Enroll Face — ${employee.name}`} onClose={() => setFaceModalOpen(false)} onDone={onChanged} />
      )}
      {fingerprintModalOpen && (
        <EnrollFingerprintModal employeeId={employeeId} currentTemplateId={employee.fingerprintTemplateId} onClose={() => setFingerprintModalOpen(false)} onSaved={onChanged} />
      )}
    </section>
  );
}

// Advanced HRMS Features spec: "Each employee should have a complete
// digital personnel file... This becomes the employee's permanent
// digital record within the HRMS." Slide-in-from-right shell, same idea
// as the CRM module's OrderTimeline.jsx (see
// src/app/dashboard/call-center/orders/page.jsx for that precedent) —
// one drawer, one loading state, backdrop click to close.
function EmployeeFileDrawer({ employeeId, onClose }) {
  const currency = useSelector((s) => s.currency.baseCurrency);
  const rates    = useSelector((s) => s.currency.rates);
  const myRole   = useSelector((s) => s.user.role);
  const permissions = useSelector((s) => s.permissions.permissions);
  // Same canSee()-equivalent shape used everywhere else in this app
  // (dashboard/layout.jsx, customer-care/page.jsx) — checked locally
  // here rather than assumed, because every role that can currently
  // reach HR & Payroll happens to have both view+edit today, but a
  // future custom "HR Auditor" role (view-only) created via Roles &
  // Staff shouldn't see Add/Delete controls the API would then reject —
  // the exact bug class fixed elsewhere this session.
  const canEdit = hasFullDashboardAccess(myRole) || (myRole === "ADMIN" && !permissions?.hrPayroll) || !!permissions?.hrPayroll?.edit;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await Axios({ ...api.getEmployeeFile, params: { employeeId } });
      if (r.data?.success) setData(r.data.data);
    } catch (err) { axiosToastError(err); }
    finally { setLoading(false); }
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg h-full bg-[var(--color-surface)] border-l border-theme p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Employee File</h2>
          <button onClick={onClose} className="icon-btn"><FaTimes size={14} /></button>
        </div>

        {loading ? (
          <p className="text-sm text-theme-muted">Loading…</p>
        ) : !data ? (
          <p className="text-sm text-theme-muted">Employee not found.</p>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="font-display text-lg font-semibold">{data.employee.name}</p>
              <p className="text-sm text-theme-muted">{data.employee.designation || "—"}{data.employee.department ? ` · ${data.employee.department}` : ""}</p>
            </div>

            <section>
              <h3 className="text-xs uppercase tracking-widest text-theme-muted font-semibold mb-2 flex items-center gap-1.5">
                <FaUser size={11} /> Personal &amp; Employment Info
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs bg-[var(--color-bg)] border border-theme rounded-lg p-3">
                <InfoField label="Email" value={data.employee.email} />
                <InfoField label="Phone" value={data.employee.phone} />
                <InfoField label="Employment Type" value={data.employee.employmentType} />
                <InfoField label="Status" value={data.employee.status} />
                <InfoField label="Joined" value={data.employee.joinDate ? new Date(data.employee.joinDate).toLocaleDateString() : "—"} />
                <InfoField label="Dashboard Login" value={data.employee.userId ? data.employee.userId.role : "None"} />
              </div>
            </section>

            <AttendanceSection employeeId={employeeId} canEdit={canEdit} />
            <BiometricEnrollmentSection employeeId={employeeId} employee={data.employee} canEdit={canEdit} onChanged={load} />
            <PlaceholderSection title="Leave History" icon={FaCalendarAlt} note="Not tracked yet — this build doesn't include a dedicated leave request/approval workflow." />

            <section>
              <h3 className="text-xs uppercase tracking-widest text-theme-muted font-semibold mb-2 flex items-center gap-1.5">
                <FaMoneyCheckAlt size={11} /> Payroll &amp; Tax History
              </h3>
              {data.payrollHistory.length === 0 ? (
                <p className="text-xs text-theme-muted">No payroll run yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.payrollHistory.map((r) => (
                    <div key={r._id} className="text-xs bg-[var(--color-bg)] border border-theme rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                      <span>{monthLabel(r.month)} <span className="text-theme-muted">· {r.status}</span></span>
                      <span className="text-theme-muted text-right">Net {displayPrice(r.netPay, currency, rates)} · Tax {displayPrice(r.taxDeduction, currency, rates)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <GeneratedDocumentsSection employeeId={employeeId} />
            <UploadedDocumentsSection employeeId={employeeId} />

            <EventSection type="performance_review" items={data.performanceReviews} employeeId={employeeId} canEdit={canEdit} onChanged={load} />
            <EventSection type="warning" items={data.warnings} employeeId={employeeId} canEdit={canEdit} onChanged={load} />
            <EventSection type="promotion" items={data.promotions} employeeId={employeeId} canEdit={canEdit} onChanged={load} />
            <EventSection type="training" items={data.training} employeeId={employeeId} canEdit={canEdit} onChanged={load} />

            <PlaceholderSection title="Audit History" icon={FaHistory} note="Not tracked yet for HR records specifically — there's no field-level change log for employee/payroll edits in this build (the Call Center CRM module has its own separate one)." />
          </div>
        )}
      </div>
    </div>
  );
}

// Client-side mirror of hrPayroll.controller.js's calculatePayroll() —
// used ONLY for an instant live preview inside PayrollModal before
// saving (and for the overview table's "not run yet" rows). The server
// recomputes independently and authoritatively on every save and never
// trusts this number, so any drift between the two copies could only
// ever make the *preview* momentarily wrong, never what's actually
// stored — kept intentionally identical to the server version so
// nothing surprising appears the moment it's saved.
function previewPayroll(baseSalary, { overtime = 0, bonus = 0, allowances = 0, adHocDeductions = [] } = {}, rules = []) {
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const base = round2(baseSalary);
  const ot = round2(overtime), bn = round2(bonus), al = round2(allowances);
  const grossSalary = round2(base + ot + bn + al);
  const deductionBreakdown = [];
  for (const rule of rules) {
    if (!rule?.enabled) continue;
    const ruleBase = rule.appliesTo === "gross" ? grossSalary : base;
    const amount = round2(rule.type === "fixed" ? rule.value : (ruleBase * (Number(rule.value) || 0)) / 100);
    if (amount <= 0) continue;
    deductionBreakdown.push({ name: rule.name, amount, category: rule.category === "tax" ? "tax" : "other" });
  }
  for (const item of adHocDeductions) {
    const amount = round2(item?.amount);
    if (!item?.name?.trim() || amount <= 0) continue;
    deductionBreakdown.push({ name: item.name.trim(), amount, category: "other" });
  }
  const taxDeduction = round2(deductionBreakdown.filter((d) => d.category === "tax").reduce((s, d) => s + d.amount, 0));
  const otherDeductions = round2(deductionBreakdown.filter((d) => d.category === "other").reduce((s, d) => s + d.amount, 0));
  const netPay = round2(grossSalary - taxDeduction - otherDeductions);
  return { baseSalary: base, overtime: ot, bonus: bn, allowances: al, grossSalary, deductionBreakdown, taxDeduction, otherDeductions, netPay };
}

function PayslipRow({ label, value, bold, big, muted }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={muted ? "text-theme-muted text-xs" : "text-sm text-theme-muted"}>{label}</span>
      <span className={`${bold ? "font-bold" : "text-sm"} ${big ? "text-base text-theme-primary" : ""} ${muted ? "text-xs" : ""}`}>{value}</span>
    </div>
  );
}

// Spec: "Each payroll calculation must show: Basic Salary, Overtime,
// Bonuses, Allowances, Gross Salary, Tax Deduction, Other Deductions, Net
// Salary... The salary slip should clearly itemize every earning and
// deduction." One modal covers both running payroll (editable, with a
// live preview) and viewing/printing an already-saved payslip
// (read-only once Paid) — avoids two near-duplicate components for what
// is fundamentally the same screen at two points in its lifecycle.
function PayrollModal({ employee, month, existingRecord, rules, onClose, onSaved }) {
  const currency = useSelector((s) => s.currency.baseCurrency);
  const rates    = useSelector((s) => s.currency.rates);
  const fmt = (n) => displayPrice(n, currency, rates);
  const isPaid = existingRecord?.status === "Paid";
  const printRef = useRef(null);

  const [overtime, setOvertime]     = useState(existingRecord?.overtime ?? 0);
  const [bonus, setBonus]           = useState(existingRecord?.bonus ?? 0);
  const [allowances, setAllowances] = useState(existingRecord?.allowances ?? 0);
  const [adHoc, setAdHoc]           = useState(existingRecord?.adHocDeductions?.length ? existingRecord.adHocDeductions : []);
  const [saving, setSaving]         = useState(false);

  const preview = previewPayroll(
    employee.monthlySalary,
    { overtime: Number(overtime) || 0, bonus: Number(bonus) || 0, allowances: Number(allowances) || 0, adHocDeductions: adHoc },
    rules
  );
  // What actually renders (and prints): the real saved record once one
  // exists, so a printout never shows figures that were never actually
  // saved — otherwise the live unsaved preview.
  const shown = existingRecord || preview;

  const addAdHocRow    = () => setAdHoc((a) => [...a, { name: "", amount: 0 }]);
  const updateAdHocRow = (i, field, val) => setAdHoc((a) => a.map((it, idx) => (idx === i ? { ...it, [field]: val } : it)));
  const removeAdHocRow = (i) => setAdHoc((a) => a.filter((_, idx) => idx !== i));

  const save = async (status) => {
    try {
      setSaving(true);
      const r = await Axios({
        ...api.savePayroll,
        data: {
          employeeId: employee._id, month,
          overtime: Number(overtime) || 0, bonus: Number(bonus) || 0, allowances: Number(allowances) || 0,
          adHocDeductions: adHoc.filter((i) => i.name?.trim() && Number(i.amount) > 0).map((i) => ({ name: i.name.trim(), amount: Number(i.amount) })),
          status,
        },
      });
      if (r.data?.success) {
        toast.success(status === "Paid" ? "Marked as paid" : "Payroll saved");
        // Demo Admin: the simulated response echoes the raw request body,
        // not a real computed record (no grossSalary/deductionBreakdown/
        // taxDeduction/etc) — storing that as-is would show a misleading
        // all-zero row afterward. Skip the state update in that case; the
        // toast + close below still happen normally, same as every other
        // isDemoAction handling in this app (see EmployeeModal above).
        if (!r.data.isDemoAction) onSaved(r.data.data);
        if (status === "Paid" || r.data?.isDemoAction) onClose();
      }
    } catch (err) { axiosToastError(err); }
    finally { setSaving(false); }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const printContents = printRef.current.innerHTML;
    const win = window.open("", "_blank", "width=700,height=900");
    win.document.write(`
      <html>
        <head>
          <title>Payslip - ${employee.name} - ${monthLabel(month)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; }
            .row.bold { font-weight: bold; }
            .row.big { font-size: 16px; font-weight: bold; }
            .divider { border-top: 1px solid #ddd; margin: 8px 0; }
            h2 { margin: 0 0 2px; } .muted { color: #666; font-size: 12px; margin: 0 0 12px; }
          </style>
        </head>
        <body>
          <h2>${employee.name}</h2>
          <p class="muted">${employee.designation || ""}${employee.department ? " · " + employee.department : ""}</p>
          <p class="muted">Payslip for ${monthLabel(month)} — ${shown.status || (isPaid ? "Paid" : "Draft")}</p>
          ${printContents}
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 350);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-[var(--color-surface)] rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto p-6">
        <h2 className="font-display text-lg font-semibold mb-1">Payroll — {employee.name}</h2>
        <p className="text-sm text-theme-muted mb-4">{monthLabel(month)}{isPaid && " · Paid — read only"}</p>

        {!isPaid && (
          <div className="space-y-3 mb-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Overtime</label>
                <input type="number" min="0" value={overtime} onChange={(e) => setOvertime(e.target.value)} className="input-field py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Bonus</label>
                <input type="number" min="0" value={bonus} onChange={(e) => setBonus(e.target.value)} className="input-field py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Allowances</label>
                <input type="number" min="0" value={allowances} onChange={(e) => setAllowances(e.target.value)} className="input-field py-1.5 text-sm" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium">Other deductions this month (loan, advance, custom…)</label>
                <button type="button" onClick={addAdHocRow} className="text-xs text-theme-primary font-semibold hover:underline">+ Add line</button>
              </div>
              {adHoc.length === 0 ? (
                <p className="text-xs text-theme-muted">None added.</p>
              ) : (
                <div className="space-y-1.5">
                  {adHoc.map((item, i) => (
                    <div key={i} className="flex gap-2">
                      <input value={item.name} onChange={(e) => updateAdHocRow(i, "name", e.target.value)} placeholder="e.g. Salary advance" className="input-field py-1 text-xs flex-1" />
                      <input type="number" min="0" value={item.amount} onChange={(e) => updateAdHocRow(i, "amount", e.target.value)} className="input-field py-1 text-xs w-24" />
                      <button type="button" onClick={() => removeAdHocRow(i)} className="icon-btn icon-btn-danger shrink-0"><FaTimes size={11} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={printRef} className="bg-[var(--color-bg)] border border-theme rounded-xl p-3">
          <PayslipRow label="Basic Salary" value={fmt(shown.baseSalary ?? employee.monthlySalary)} />
          <PayslipRow label="Overtime" value={fmt(shown.overtime)} />
          <PayslipRow label="Bonus" value={fmt(shown.bonus)} />
          <PayslipRow label="Allowances" value={fmt(shown.allowances)} />
          <div className="border-t border-theme mt-1 pt-1">
            <PayslipRow label="Gross Salary" value={fmt(shown.grossSalary)} bold />
          </div>
          {(shown.deductionBreakdown || []).length > 0 && (
            <div className="border-t border-theme mt-1.5 pt-1.5">
              {shown.deductionBreakdown.map((d, i) => (
                <PayslipRow key={i} label={`${d.name}${d.category === "tax" ? " (tax)" : ""}`} value={`− ${fmt(d.amount)}`} muted />
              ))}
            </div>
          )}
          <div className="border-t border-theme mt-1.5 pt-1.5">
            <PayslipRow label="Tax Deduction" value={fmt(shown.taxDeduction)} />
            <PayslipRow label="Other Deductions" value={fmt(shown.otherDeductions)} />
          </div>
          <div className="border-t border-theme mt-1.5 pt-1.5">
            <PayslipRow label="Net Salary" value={fmt(shown.netPay)} bold big />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 mt-5">
          {existingRecord && (
            <button onClick={handlePrint} className="btn-outline px-4 py-2 text-sm flex items-center gap-2"><FaPrint size={12} /> Print</button>
          )}
          <button onClick={onClose} className="btn-outline px-4 py-2 text-sm">Close</button>
          {!isPaid && (
            <>
              <button onClick={() => save("Pending")} disabled={saving} className="btn-outline px-4 py-2 text-sm disabled:opacity-60">Save Draft</button>
              <button onClick={() => save("Paid")} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">Mark Paid</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PayrollTab() {
  const currency = useSelector((s) => s.currency.baseCurrency); // item 7: admin reporting always shows the official base currency, not any personal storefront override
  const rates    = useSelector((s) => s.currency.rates);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [employees, setEmployees] = useState([]);
  const [records, setRecords]     = useState({}); // employeeId -> record
  const [rules, setRules]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modalEmp, setModalEmp]   = useState(null); // employee currently open in PayrollModal, or null

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [empR, payR, cfgR] = await Promise.all([
        Axios({ ...api.getEmployees, params: { status: "Active" } }),
        Axios({ ...api.getPayroll, params: { month } }),
        Axios({ ...api.getPayrollConfig }),
      ]);
      setEmployees(empR.data?.data?.employees || []);
      const map = {};
      (payR.data?.data || []).forEach((r) => { map[r.employeeId?._id || r.employeeId] = r; });
      setRecords(map);
      setRules(cfgR.data?.data?.rules || []);
    } catch (err) { axiosToastError(err); }
    finally { setLoading(false); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  // Before HR has run payroll for someone this month, preview what it
  // WOULD be under the current tax rules (zero overtime/bonus/allowances/
  // ad-hoc) rather than leaving the row blank — makes the table useful at
  // a glance even before anyone has touched it.
  const previewFor = (emp) => records[emp._id] || previewPayroll(emp.monthlySalary, {}, rules);

  const totalNet = employees.reduce((s, emp) => s + (previewFor(emp).netPay || 0), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth((m) => shiftMonth(m, -1))} className="icon-btn"><FaChevronLeft size={13} /></button>
          <span className="font-semibold text-sm w-36 text-center">{monthLabel(month)}</span>
          <button onClick={() => setMonth((m) => shiftMonth(m, 1))} className="icon-btn"><FaChevronRight size={13} /></button>
        </div>
        <div className="bg-[var(--color-surface)] border border-theme rounded-xl px-4 py-2.5 flex items-center gap-2">
          <span className="text-sm text-theme-muted">Total net pay this month:</span>
          <span className="font-bold text-theme-primary">{displayPrice(totalNet, currency, rates)}</span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-theme-muted">Loading payroll…</div>
      ) : employees.length === 0 ? (
        <div className="text-center py-16 text-theme-muted">No active employees. Add staff in the Employees tab first.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-theme-muted border-b border-theme">
                <th className="py-2 pr-3 font-medium">Employee</th>
                <th className="py-2 pr-3 font-medium">Base</th>
                <th className="py-2 pr-3 font-medium">Gross</th>
                <th className="py-2 pr-3 font-medium">Tax</th>
                <th className="py-2 pr-3 font-medium">Other Ded.</th>
                <th className="py-2 pr-3 font-medium">Net Pay</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const rec = records[emp._id];
                const p = previewFor(emp);
                return (
                  <tr key={emp._id} className="border-b border-theme last:border-0">
                    <td className="py-2.5 pr-3 font-medium">{emp.name}</td>
                    <td className="py-2.5 pr-3 text-theme-muted">{displayPrice(emp.monthlySalary, currency, rates)}</td>
                    <td className="py-2.5 pr-3 text-theme-muted">{displayPrice(p.grossSalary, currency, rates)}</td>
                    <td className="py-2.5 pr-3 text-theme-muted">{displayPrice(p.taxDeduction, currency, rates)}</td>
                    <td className="py-2.5 pr-3 text-theme-muted">{displayPrice(p.otherDeductions, currency, rates)}</td>
                    <td className="py-2.5 pr-3 font-bold text-theme-primary">{displayPrice(p.netPay, currency, rates)}</td>
                    <td className="py-2.5 pr-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rec?.status === "Paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                        {rec ? rec.status : "Not run"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <button onClick={() => setModalEmp(emp)} className="btn-outline px-3 py-1.5 text-xs">
                        {rec ? "Open" : "Run Payroll"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalEmp && (
        <PayrollModal
          employee={modalEmp}
          month={month}
          existingRecord={records[modalEmp._id] || null}
          rules={rules}
          onClose={() => setModalEmp(null)}
          onSaved={(rec) => setRecords((prev) => ({ ...prev, [modalEmp._id]: rec }))}
        />
      )}
    </div>
  );
}

const RULE_CATEGORY_OPTIONS = [
  { value: "tax", label: "Tax" },
  { value: "other", label: "Other (PF, pension, insurance…)" },
];

// Super-Admin-only, matching this app's established pattern for "Only
// Super Admin can configure X" (crmSettings' Routing & Queue Settings
// page uses the exact same idea). HR can still SEE current rules — the
// GET route is checkPermission("hrPayroll","view"), not superAdminOnly —
// they just can't change them, which is what lets the live preview in
// PayrollModal work correctly for HR too, not just Super Admin.
function TaxRulesTab() {
  const [rules, setRules]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await Axios({ ...api.getPayrollConfig });
      if (r.data?.success) setRules(r.data.data.rules || []);
    } catch (err) { axiosToastError(err); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const update = (i, field, val) => setRules((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));
  const addRule = () => setRules((rs) => [...rs, { name: "", type: "percentage", value: 0, appliesTo: "basic", category: "other", enabled: true }]);
  const removeRule = (i) => setRules((rs) => rs.filter((_, idx) => idx !== i));

  const save = async () => {
    if (rules.some((r) => !r.name?.trim())) { toast.error("Every rule needs a name"); return; }
    try {
      setSaving(true);
      const r = await Axios({ ...api.updatePayrollConfig, data: { rules } });
      if (r.data?.success) { toast.success(r.data.message || "Saved"); setRules(r.data.data.rules || []); }
    } catch (err) { axiosToastError(err); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <p className="text-sm text-theme-muted max-w-xl mb-5">
        These rules apply automatically to every employee's payroll each month. A percentage rule can
        be based on Basic Salary or Gross Salary. Rules marked "Tax" show as their own "Tax Deduction"
        line on the payslip; everything else (Provident Fund, Pension, Social Security, Insurance…)
        shows as "Other Deductions." One-off items like a loan repayment or salary advance are entered
        per employee when running that month's payroll, not here.
      </p>
      {loading ? (
        <div className="text-center py-16 text-theme-muted">Loading rules…</div>
      ) : (
        <div className="space-y-2">
          {rules.length === 0 && <p className="text-sm text-theme-muted mb-2">No rules configured yet — payroll will run with zero automatic deductions until you add some.</p>}
          {rules.map((rule, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 bg-[var(--color-surface)] border border-theme rounded-xl p-3">
              <input value={rule.name} onChange={(e) => update(i, "name", e.target.value)} placeholder="Rule name (e.g. Income Tax)" className="input-field py-1.5 text-sm flex-1 min-w-[160px]" />
              <select value={rule.type} onChange={(e) => update(i, "type", e.target.value)} className="input-field py-1.5 text-sm w-32">
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount</option>
              </select>
              <input type="number" min="0" value={rule.value} onChange={(e) => update(i, "value", e.target.value)} className="input-field py-1.5 text-sm w-24" />
              {rule.type === "percentage" && (
                <select value={rule.appliesTo} onChange={(e) => update(i, "appliesTo", e.target.value)} className="input-field py-1.5 text-sm w-36">
                  <option value="basic">of Basic Salary</option>
                  <option value="gross">of Gross Salary</option>
                </select>
              )}
              <select value={rule.category} onChange={(e) => update(i, "category", e.target.value)} className="input-field py-1.5 text-sm w-28">
                {RULE_CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none">
                <input type="checkbox" checked={rule.enabled} onChange={(e) => update(i, "enabled", e.target.checked)} className="h-4 w-4" /> Enabled
              </label>
              <button onClick={() => removeRule(i)} className="icon-btn icon-btn-danger"><FaTrash size={12} /></button>
            </div>
          ))}
          <button onClick={addRule} className="btn-outline flex items-center gap-2 px-4 py-2 text-sm"><FaPlus size={11} /> Add Rule</button>
        </div>
      )}
      <div className="flex justify-end mt-5">
        <button onClick={save} disabled={saving || loading} className="btn-primary px-5 py-2 text-sm disabled:opacity-60">{saving ? "Saving…" : "Save Rules"}</button>
      </div>
    </div>
  );
}

// Duplicated from documentTemplate.model.js's own DOCUMENT_TYPES export
// rather than imported — that file pulls in Mongoose (server-only) and
// can't be bundled into client code. Keep in sync manually; same
// deliberate-duplication pattern as previewPayroll mirroring
// calculatePayroll above.
const DOCUMENT_TYPES = [
  "Appointment Letter", "Employment Agreement", "Offer Letter", "Confirmation Letter",
  "Promotion Letter", "Warning Letter", "Experience Certificate", "Job Certificate",
  "Salary Certificate", "Salary Increment Letter", "Relieving Letter", "Resignation Acceptance Letter",
  "Bank Salary Transfer Application", "Leave Approval Letter", "Loan Approval Letter", "NDA",
  "Confidentiality Agreement", "Internship Certificate", "Contract Renewal", "Employee ID Card",
  "Tax Certificate", "Other",
];

// Turns a base64 string + mime type into a real browser file download.
// Used by both "Generate & Download" (fresh) and the Employee File
// drawer's per-document Download button (re-fetching something already
// generated) — see documentTemplate.controller.js's own comment for why
// the backend returns base64-in-JSON here instead of a raw binary
// response (this app's shared response layer only supports JSON/text).
function downloadBase64File(base64, fileName, mimeType) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function TemplateUploadModal({ onClose, onUploaded }) {
  const [name, setName] = useState("");
  const [documentType, setDocumentType] = useState("Other");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast.error("Give this template a name"); return; }
    if (!file) { toast.error("Choose a .docx file"); return; }
    try {
      setSaving(true);
      const fd = new FormData();
      fd.append("name", name.trim());
      fd.append("documentType", documentType);
      fd.append("file", file);
      const r = await Axios({ ...api.uploadDocumentTemplate, data: fd });
      if (r.data?.success) {
        toast.success(r.data.message || "Uploaded");
        if (!r.data.isDemoAction) onUploaded();
        onClose();
      }
    } catch (err) { axiosToastError(err); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-[var(--color-surface)] rounded-2xl w-full max-w-md p-6">
        <h2 className="font-display text-lg font-semibold mb-4">Upload Document Template</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Template name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2026 Standard Offer Letter" className="input-field py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Document type</label>
            <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="input-field py-2 text-sm w-full">
              {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">.docx file</label>
            <input type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="input-field py-2 text-sm w-full" />
            <p className="text-xs text-theme-muted mt-1">
              Use placeholders anywhere in the document, like {"{{employee_name}}"}, {"{{designation}}"}, {"{{joining_date}}"}, {"{{salary}}"} — they'll be replaced automatically when you generate it for someone.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-outline px-4 py-2 text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">{saving ? "Uploading…" : "Upload"}</button>
        </div>
      </div>
    </div>
  );
}

function GenerateDocumentModal({ template, onClose }) {
  const [employees, setEmployees] = useState([]);
  const [loadingEmps, setLoadingEmps] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [format, setFormat] = useState("docx");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await Axios({ ...api.getEmployees, params: { status: "Active" } });
        setEmployees(r.data?.data?.employees || []);
      } catch (err) { axiosToastError(err); }
      finally { setLoadingEmps(false); }
    })();
  }, []);

  const filtered = employees.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));

  const generate = async () => {
    if (!selectedEmp) { toast.error("Pick an employee first"); return; }
    try {
      setGenerating(true);
      const r = await Axios({ ...api.generateDocument, data: { templateId: template._id, employeeId: selectedEmp._id, format } });
      if (r.data?.success) {
        toast.success(r.data.message || "Generated");
        // Demo Admin: apiHandler's simulated response echoes the request
        // body, not a real generated file — there's no base64 to
        // download in that case, same reasoning as every other
        // isDemoAction handling on this page.
        if (!r.data.isDemoAction && r.data.data?.base64) {
          downloadBase64File(r.data.data.base64, r.data.data.fileName, r.data.data.mimeType);
        }
        onClose();
      }
    } catch (err) { axiosToastError(err); }
    finally { setGenerating(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-[var(--color-surface)] rounded-2xl w-full max-w-md p-6">
        <h2 className="font-display text-lg font-semibold mb-1">Generate: {template.name}</h2>
        <p className="text-sm text-theme-muted mb-4">{template.documentType}</p>

        <label className="block text-xs font-medium mb-1">Employee</label>
        {selectedEmp ? (
          <div className="flex items-center justify-between bg-[var(--color-bg)] border border-theme rounded-lg px-3 py-2 mb-3">
            <span className="text-sm font-semibold">{selectedEmp.name}</span>
            <button onClick={() => setSelectedEmp(null)} className="text-xs text-theme-primary font-semibold hover:underline">Change</button>
          </div>
        ) : (
          <>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employees…" className="input-field py-2 text-sm w-full mb-2" />
            <div className="max-h-40 overflow-y-auto border border-theme rounded-lg mb-3">
              {loadingEmps ? (
                <p className="text-xs text-theme-muted p-3">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="text-xs text-theme-muted p-3">No matches.</p>
              ) : (
                filtered.map((e) => (
                  <button key={e._id} type="button" onClick={() => setSelectedEmp(e)} className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-bg)] border-b border-theme last:border-0">
                    {e.name} <span className="text-theme-muted text-xs">· {e.designation || "—"}</span>
                  </button>
                ))
              )}
            </div>
          </>
        )}

        <label className="block text-xs font-medium mb-1">Format</label>
        <div className="flex gap-2 mb-1">
          <button type="button" onClick={() => setFormat("docx")} className={`px-3 py-1.5 text-xs rounded-lg border font-semibold ${format === "docx" ? "border-theme-primary text-theme-primary" : "border-theme text-theme-muted"}`}>Word (.docx)</button>
          <button type="button" onClick={() => setFormat("pdf")} className={`px-3 py-1.5 text-xs rounded-lg border font-semibold ${format === "pdf" ? "border-theme-primary text-theme-primary" : "border-theme text-theme-muted"}`}>PDF</button>
        </div>
        {format === "pdf" && <p className="text-xs text-theme-muted mb-4">Falls back to Word automatically if PDF conversion isn't set up on this server.</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="btn-outline px-4 py-2 text-sm">Cancel</button>
          <button onClick={generate} disabled={generating || !selectedEmp} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">{generating ? "Generating…" : "Generate & Download"}</button>
        </div>
      </div>
    </div>
  );
}

// Advanced HRMS Features spec: "HR uploads the official company template
// once. The template is stored permanently... No manual editing should
// be required." Same audience as Employees/Payroll (hrPayroll.view to
// see, .edit to upload/delete/generate) — not a new permission module.
function DocumentsTab() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [generateFor, setGenerateFor] = useState(null); // template object, or null

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await Axios({ ...api.getDocumentTemplates });
      if (r.data?.success) setTemplates(r.data.data);
    } catch (err) { axiosToastError(err); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const removeTemplate = async (id) => {
    try {
      const r = await Axios({ ...api.deleteDocumentTemplate, data: { _id: id } });
      if (r.data?.success) {
        toast.success(r.data.isDemoAction ? r.data.message : "Template deleted");
        if (!r.data.isDemoAction) load();
      }
    } catch (err) { axiosToastError(err); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-sm text-theme-muted max-w-md">
          Upload a company letter or certificate template once (.docx, with placeholders like {"{{employee_name}}"}),
          then generate it filled in for any employee in a couple of clicks.
        </p>
        <button onClick={() => setUploadOpen(true)} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm shrink-0"><FaPlus size={11} /> Upload Template</button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-theme-muted">Loading templates…</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-theme-muted">No templates yet. Upload one to get started.</div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t._id} className="flex flex-wrap items-center justify-between gap-3 bg-[var(--color-surface)] border border-theme rounded-xl p-3.5">
              <div>
                <p className="font-semibold text-sm">{t.name}</p>
                <p className="text-xs text-theme-muted mt-0.5">
                  {t.documentType} · {t.placeholders.length} placeholder{t.placeholders.length === 1 ? "" : "s"} · uploaded by {t.uploadedBy?.name || "—"}
                </p>
              </div>
              <div className="action-group">
                <button onClick={() => setGenerateFor(t)} className="btn-primary px-3 py-1.5 text-xs">Generate</button>
                <button onClick={() => removeTemplate(t._id)} className="icon-btn icon-btn-danger"><FaTrash size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {uploadOpen && <TemplateUploadModal onClose={() => setUploadOpen(false)} onUploaded={load} />}
      {generateFor && <GenerateDocumentModal template={generateFor} onClose={() => setGenerateFor(null)} />}
    </div>
  );
}

// Spec: "Update the employee dashboard. Update HR dashboard." — the
// day-to-day "who's actually in today" view, distinct from the
// Employee File drawer's per-person history (this session's Phase B).
function AttendanceOverviewTab() {
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await Axios({ ...api.getAttendanceOverview, params: { date } });
      if (r.data?.success) setRows(r.data.data.rows);
    } catch (err) { axiosToastError(err); }
    finally { setLoading(false); }
  }, [date]);
  useEffect(() => { load(); }, [load]);

  const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");
  const fmtHours = (mins) => (mins ? `${(mins / 60).toFixed(1)}h` : "—");
  const presentCount = rows.filter((r) => r.attendance?.checkIn).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field py-2 text-sm w-44" />
        <div className="bg-[var(--color-surface)] border border-theme rounded-xl px-4 py-2.5">
          <span className="text-sm text-theme-muted">Present:</span> <span className="font-bold text-theme-primary">{presentCount} / {rows.length}</span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-theme-muted">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-theme-muted">No active employees.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-theme-muted border-b border-theme">
                <th className="py-2 pr-3 font-medium">Employee</th>
                <th className="py-2 pr-3 font-medium">Check In</th>
                <th className="py-2 pr-3 font-medium">Method</th>
                <th className="py-2 pr-3 font-medium">Check Out</th>
                <th className="py-2 pr-3 font-medium">Method</th>
                <th className="py-2 pr-3 font-medium">Hours</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ employee, attendance }) => (
                <tr key={employee._id} className="border-b border-theme last:border-0">
                  <td className="py-2.5 pr-3 font-medium">{employee.name}</td>
                  <td className="py-2.5 pr-3 text-theme-muted">{fmtTime(attendance?.checkIn)}</td>
                  <td className="py-2.5 pr-3 text-theme-muted">{attendance?.checkInMethod || "—"}</td>
                  <td className="py-2.5 pr-3 text-theme-muted">{fmtTime(attendance?.checkOut)}</td>
                  <td className="py-2.5 pr-3 text-theme-muted">{attendance?.checkOutMethod || "—"}</td>
                  <td className="py-2.5 pr-3 font-bold text-theme-primary">{fmtHours(attendance?.workMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function HrPayrollPage() {
  const [tab, setTab] = useState("employees");
  const myRole = useSelector((s) => s.user.role);
  // Strict isSuperAdmin, not hasFullDashboardAccess — matches the PUT
  // route's actual superAdminOnly gate (not superAdminOrDemo), same
  // precedent as the CRM module's Routing & Queue Settings (also
  // strictSuperAdminOnly, hidden from Demo Admin entirely rather than
  // simulated): both are foundational operational configuration, not
  // day-to-day CRUD a demo tour benefits from clicking through. Using
  // the broader hasFullDashboardAccess here would let Demo Admin see
  // this tab's Save button and then hit a real 403 on click — the exact
  // UI/API mismatch bug class fixed earlier this session in Customer
  // Care's Call Center tab.
  const canManageTaxRules = isSuperAdmin(myRole);

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <FaUserTie className="text-2xl text-theme-primary" />
        <h1 className="section-heading text-2xl">HR &amp; Payroll</h1>
      </div>
      <p className="text-sm text-theme-muted -mt-4 mb-6">
        A working staff directory and monthly payroll to start with — happy to extend this further once you share more detail on what else this dashboard should cover.
      </p>

      <div className="flex gap-2 mb-6 border-b border-theme overflow-x-auto">
        <button onClick={() => setTab("employees")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors shrink-0 ${tab === "employees" ? "border-theme-primary text-theme-primary" : "border-transparent text-theme-muted hover:text-theme"}`}>
          <FaUsers size={13} /> Employees
        </button>
        <button onClick={() => setTab("payroll")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors shrink-0 ${tab === "payroll" ? "border-theme-primary text-theme-primary" : "border-transparent text-theme-muted hover:text-theme"}`}>
          <FaMoneyCheckAlt size={13} /> Payroll
        </button>
        <button onClick={() => setTab("documents")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors shrink-0 ${tab === "documents" ? "border-theme-primary text-theme-primary" : "border-transparent text-theme-muted hover:text-theme"}`}>
          <FaFileAlt size={13} /> Documents
        </button>
        <button onClick={() => setTab("attendance")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors shrink-0 ${tab === "attendance" ? "border-theme-primary text-theme-primary" : "border-transparent text-theme-muted hover:text-theme"}`}>
          <FaClock size={13} /> Attendance
        </button>
        {canManageTaxRules && (
          <button onClick={() => setTab("taxrules")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors shrink-0 ${tab === "taxrules" ? "border-theme-primary text-theme-primary" : "border-transparent text-theme-muted hover:text-theme"}`}>
            <FaReceipt size={13} /> Tax &amp; Deduction Rules
          </button>
        )}
      </div>

      {tab === "employees" ? <EmployeesTab />
        : tab === "payroll" ? <PayrollTab />
        : tab === "documents" ? <DocumentsTab />
        : tab === "attendance" ? <AttendanceOverviewTab />
        : tab === "taxrules" && canManageTaxRules ? <TaxRulesTab />
        : <EmployeesTab />}
    </div>
  );
}
