"use client";
import { useEffect, useState } from "react";
import { FaPhone, FaDownload, FaSearch, FaFilter } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError, displayPrice, displayPriceSimple, isSuperAdmin } from "@/lib/utils";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";

// CSV export intentionally stays in BDT (the platform's settlement/base
// currency) regardless of the admin's on-screen display preference — exported
// records are for accounting/record-keeping, where a consistent base currency
// matters more than the admin's momentary viewing preference.
const exportCSV = (customers) => {
  const headers = ["Name","Email","Mobile","Status","Total Orders","Total Spent","Last Order","Member Since"];
  const rows = customers.map(c => [
    c.name, c.email, c.mobile || "",
    c.status || "Active",
    c.totalOrders, displayPriceSimple(c.totalSpent),
    c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString() : "",
    new Date(c.createdAt).toLocaleDateString()
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type:"text/csv" });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "customers.csv"; a.click();
  URL.revokeObjectURL(url);
};

const ROLES = ["USER","ADMIN","MODERATOR","EMPLOYEE","ANALYST","SUPERADMIN"];

export default function AdminUsersPage() {
  const myRole   = useSelector((s) => s.user.role);
  const currency = useSelector((s) => s.currency.baseCurrency); // item 7: admin reporting always shows the official base currency, not any personal storefront override
  const rates    = useSelector((s) => s.currency.rates);
  const [users,    setUsers]    = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const [totalPg,  setTotalPg]  = useState(1);
  const [search,   setSearch]   = useState("");
  const [sortBy,   setSortBy]   = useState("createdAt");
  const [sortDir,  setSortDir]  = useState("desc");
  const [selected, setSelected] = useState(null);

  const load = async (p = 1) => {
    try {
      setLoading(true);
      const r = await Axios({ ...api.getCustomers, params: { search, sortBy, sortDir, page: p, limit: 30 } });
      const d = r.data?.data;
      setUsers(d?.customers || []);
      setTotal(d?.total || 0);
      setTotalPg(d?.pages || 1);
    } catch (err) { axiosToastError(err); } finally { setLoading(false); }
  };

  useEffect(() => { load(page); }, [page, sortBy, sortDir]);

  const handleSearch = (e) => { e.preventDefault(); setPage(1); load(1); };

  const handleExport = async () => {
    try {
      const r = await Axios({ ...api.exportCustomers });
      exportCSV(r.data?.data || []);
      toast.success("Exported!");
    } catch (err) { axiosToastError(err); }
  };

  const changeRole = async (userId, role) => {
    if (!isSuperAdmin(myRole)) { toast.error("Only Super Admins can change roles"); return; }
    try {
      const r = await Axios({ ...api.assignUserRole, data: { userId, roleName: role } });
      if (r.data?.success) {
        setUsers(prev => prev.map(u => u._id === userId ? { ...u, role } : u));
        toast.success("Role updated");
      }
    } catch (err) { axiosToastError(err); }
  };

  const call = (mobile) => { if (mobile) window.location.href = `tel:${mobile}`; else toast.error("No phone number"); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="section-heading text-2xl">Customers</h1>
          <p className="text-sm text-theme-muted">{total} customers total</p>
        </div>
        <button onClick={handleExport} className="btn-outline flex items-center gap-2 px-4 py-2 text-sm">
          <FaDownload size={12}/> Export CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, phone…" className="input-field flex-1"/>
          <button type="submit" className="btn-primary px-4 py-2"><FaSearch size={13}/></button>
        </form>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="input-field w-40 text-sm">
          <option value="createdAt">Member Since</option>
          <option value="totalOrders">Total Orders</option>
          <option value="totalSpent">Total Spent</option>
          <option value="lastOrderDate">Last Order</option>
          <option value="name">Name</option>
        </select>
        <select value={sortDir} onChange={e => setSortDir(e.target.value)} className="input-field w-28 text-sm">
          <option value="desc">↓ Desc</option>
          <option value="asc">↑ Asc</option>
        </select>
      </div>

      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Customer</th><th>Mobile</th><th>Orders</th><th>Total Spent</th><th>Last Order</th><th>Role</th><th>Actions</th></tr></thead>
          <tbody>
            {loading
              ? Array.from({length:6}).map((_,i) => <tr key={i}><td colSpan={7}><div className="skeleton h-10 rounded my-1"/></td></tr>)
              : users.length === 0
                ? <tr><td colSpan={7} className="text-center py-10 text-theme-muted">No customers found</td></tr>
                : users.map(u => (
                  <tr key={u._id}>
                    <td>
                      <div className="flex items-center gap-2">
                        {u.avatar
                          ? <img src={u.avatar} alt="" className="h-8 w-8 rounded-full object-cover shrink-0"/>
                          : <div className="h-8 w-8 rounded-full bg-[var(--color-border)] flex items-center justify-center font-semibold text-xs shrink-0">{u.name?.[0]?.toUpperCase()}</div>
                        }
                        <div><p className="font-medium text-sm">{u.name}</p><p className="text-xs text-theme-muted">{u.email}</p></div>
                      </div>
                    </td>
                    <td className="text-sm">{u.mobile || "—"}</td>
                    <td className="font-semibold text-sm">{u.totalOrders}</td>
                    <td className="font-semibold text-sm text-theme-primary">{displayPrice(u.totalSpent, currency, rates)}</td>
                    <td className="text-xs text-theme-muted">{u.lastOrderDate ? new Date(u.lastOrderDate).toLocaleDateString() : "—"}</td>
                    <td>
                      {isSuperAdmin(myRole)
                        ? <select value={u.role} onChange={e => changeRole(u._id, e.target.value)} className="input-field py-1 text-xs w-28">
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        : <span className="badge">{u.role}</span>
                      }
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => call(u.mobile)} title="Call" className="icon-btn-call">
                          <FaPhone size={11}/>
                        </button>
                        <button onClick={() => setSelected(u)} className="row-action-btn">View</button>
                      </div>
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>

      {totalPg > 1 && (
        <div className="flex justify-center gap-2">
          <button disabled={page===1} onClick={() => setPage(p=>p-1)} className="px-4 py-2 rounded-lg border border-theme text-sm disabled:opacity-40">Prev</button>
          <span className="px-4 py-2 text-sm text-theme-muted">{page}/{totalPg}</span>
          <button disabled={page===totalPg} onClick={() => setPage(p=>p+1)} className="px-4 py-2 rounded-lg border border-theme text-sm disabled:opacity-40">Next</button>
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-box max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="font-display text-xl font-semibold mb-4">{selected.name}</h2>
            <div className="space-y-2 text-sm">
              <p><span className="text-theme-muted">Email:</span> {selected.email}</p>
              <p><span className="text-theme-muted">Mobile:</span> {selected.mobile || "—"}</p>
              <p><span className="text-theme-muted">Total Orders:</span> {selected.totalOrders}</p>
              <p><span className="text-theme-muted">Total Spent:</span> {displayPrice(selected.totalSpent, currency, rates)}</p>
              <p><span className="text-theme-muted">Member since:</span> {new Date(selected.createdAt).toLocaleDateString()}</p>
              <p><span className="text-theme-muted">Role:</span> {selected.role}</p>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => call(selected.mobile)} className="flex items-center gap-2 flex-1 py-2 bg-green-500 text-white rounded-full text-sm font-semibold justify-center">
                <FaPhone size={12}/> Call Customer
              </button>
              <button onClick={() => setSelected(null)} className="btn-outline flex-1 py-2">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
