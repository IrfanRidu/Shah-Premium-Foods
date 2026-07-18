"use client";
import { useEffect, useState, useCallback } from "react";
import { useSelector } from "react-redux";
import {
  FaUserTie, FaPlus, FaEdit, FaTrash, FaMoneyCheckAlt, FaUsers,
  FaSave, FaChevronLeft, FaChevronRight,
} from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { displayPrice, axiosToastError } from "@/lib/utils";
import toast from "react-hot-toast";

const STATUSES = ["Active", "On Leave", "Terminated"];
const STATUS_COLOR = {
  Active: "bg-green-100 text-green-700",
  "On Leave": "bg-yellow-100 text-yellow-700",
  Terminated: "bg-red-100 text-red-700",
};
const TYPES = ["Full-time", "Part-time", "Contract", "Intern"];

const emptyForm = {
  _id: null, name: "", email: "", phone: "", designation: "", department: "",
  employmentType: "Full-time", monthlySalary: "", status: "Active", bankAccount: "", notes: "",
};

function EmployeeModal({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial._id;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    try {
      setSaving(true);
      const payload = { ...form, monthlySalary: Number(form.monthlySalary) || 0 };
      const r = await Axios(
        isEdit ? { ...api.updateEmployee, data: payload } : { ...api.createEmployee, data: payload }
      );
      if (r.data?.success) {
        toast.success(isEdit ? "Employee updated" : "Employee added");
        onSaved();
        onClose();
      }
    } catch (err) {
      axiosToastError(err);
    } finally {
      setSaving(false);
    }
  };

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
                  <td className="py-2.5 pr-3 font-semibold">{displayPrice(emp.monthlySalary, currency, rates)}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[emp.status]}`}>{emp.status}</span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="action-group justify-end">
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

function PayrollTab() {
  const currency = useSelector((s) => s.currency.baseCurrency); // item 7: admin reporting always shows the official base currency, not any personal storefront override
  const rates    = useSelector((s) => s.currency.rates);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState({}); // employeeId -> record
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [drafts, setDrafts] = useState({}); // employeeId -> {bonus, deductions}

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [empR, payR] = await Promise.all([
        Axios({ ...api.getEmployees, params: { status: "Active" } }),
        Axios({ ...api.getPayroll, params: { month } }),
      ]);
      setEmployees(empR.data?.data?.employees || []);
      const map = {};
      (payR.data?.data || []).forEach((r) => { map[r.employeeId?._id || r.employeeId] = r; });
      setRecords(map);
    } catch (err) { axiosToastError(err); }
    finally { setLoading(false); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const getDraft = (emp) => {
    const rec = records[emp._id];
    return drafts[emp._id] || { bonus: rec?.bonus ?? 0, deductions: rec?.deductions ?? 0 };
  };
  const setDraft = (empId, field, val) => {
    setDrafts((d) => ({ ...d, [empId]: { ...getDraftFor(empId), [field]: val } }));
  };
  const getDraftFor = (empId) => {
    const emp = employees.find((e) => e._id === empId);
    return emp ? getDraft(emp) : { bonus: 0, deductions: 0 };
  };

  const savePayroll = async (emp, status) => {
    const draft = getDraft(emp);
    try {
      setSavingId(emp._id);
      const r = await Axios({
        ...api.savePayroll,
        data: {
          employeeId: emp._id, month,
          baseSalary: emp.monthlySalary,
          bonus: Number(draft.bonus) || 0,
          deductions: Number(draft.deductions) || 0,
          status,
        },
      });
      if (r.data?.success) {
        toast.success(status === "Paid" ? "Marked as paid" : "Payroll saved");
        setRecords((prev) => ({ ...prev, [emp._id]: r.data.data }));
      }
    } catch (err) { axiosToastError(err); }
    finally { setSavingId(null); }
  };

  const totalNet = employees.reduce((s, emp) => {
    const rec = records[emp._id];
    const draft = getDraft(emp);
    const net = rec ? rec.netPay : emp.monthlySalary + Number(draft.bonus || 0) - Number(draft.deductions || 0);
    return s + net;
  }, 0);

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
                <th className="py-2 pr-3 font-medium">Bonus</th>
                <th className="py-2 pr-3 font-medium">Deductions</th>
                <th className="py-2 pr-3 font-medium">Net Pay</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const rec = records[emp._id];
                const draft = getDraft(emp);
                const net = emp.monthlySalary + (Number(draft.bonus) || 0) - (Number(draft.deductions) || 0);
                const isPaid = rec?.status === "Paid";
                return (
                  <tr key={emp._id} className="border-b border-theme last:border-0">
                    <td className="py-2.5 pr-3 font-medium">{emp.name}</td>
                    <td className="py-2.5 pr-3 text-theme-muted">{displayPrice(emp.monthlySalary, currency, rates)}</td>
                    <td className="py-2.5 pr-3">
                      <input type="number" min="0" value={draft.bonus} disabled={isPaid}
                        onChange={(e) => setDraft(emp._id, "bonus", e.target.value)}
                        className="input-field py-1 text-sm w-24 disabled:opacity-60" />
                    </td>
                    <td className="py-2.5 pr-3">
                      <input type="number" min="0" value={draft.deductions} disabled={isPaid}
                        onChange={(e) => setDraft(emp._id, "deductions", e.target.value)}
                        className="input-field py-1 text-sm w-24 disabled:opacity-60" />
                    </td>
                    <td className="py-2.5 pr-3 font-bold text-theme-primary">{displayPrice(net, currency, rates)}</td>
                    <td className="py-2.5 pr-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isPaid ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                        {rec?.status || "Pending"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="action-group justify-end">
                        <button onClick={() => savePayroll(emp, "Pending")} disabled={savingId === emp._id || isPaid}
                          title="Save draft" className="icon-btn disabled:opacity-40">
                          <FaSave size={13} />
                        </button>
                        <button onClick={() => savePayroll(emp, "Paid")} disabled={savingId === emp._id || isPaid}
                          className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50">
                          {isPaid ? "Paid" : "Mark Paid"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function HrPayrollPage() {
  const [tab, setTab] = useState("employees");

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <FaUserTie className="text-2xl text-theme-primary" />
        <h1 className="section-heading text-2xl">HR &amp; Payroll</h1>
      </div>
      <p className="text-sm text-theme-muted -mt-4 mb-6">
        A working staff directory and monthly payroll to start with — happy to extend this further once you share more detail on what else this dashboard should cover.
      </p>

      <div className="flex gap-2 mb-6 border-b border-theme">
        <button onClick={() => setTab("employees")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === "employees" ? "border-theme-primary text-theme-primary" : "border-transparent text-theme-muted hover:text-theme"}`}>
          <FaUsers size={13} /> Employees
        </button>
        <button onClick={() => setTab("payroll")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === "payroll" ? "border-theme-primary text-theme-primary" : "border-transparent text-theme-muted hover:text-theme"}`}>
          <FaMoneyCheckAlt size={13} /> Payroll
        </button>
      </div>

      {tab === "employees" ? <EmployeesTab /> : <PayrollTab />}
    </div>
  );
}
