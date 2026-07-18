"use client";
import { useEffect, useState } from "react";
import { FaExclamationTriangle, FaPlus, FaMinus, FaSearch, FaBarcode, FaList, FaShoppingCart, FaTimes } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError, displayPrice } from "@/lib/utils";
import { useSelector } from "react-redux";
import BarcodeScanner from "@/components/BarcodeScanner";
import toast from "react-hot-toast";

function AdjustModal({ product, onClose, onSaved }) {
  const [type, setType]   = useState("restock");
  const [qty,  setQty]    = useState("");
  const [note, setNote]   = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!qty || Number(qty) <= 0) { toast.error("Enter a valid quantity"); return; }
    try {
      setSaving(true);
      const r = await Axios({ ...api.adjustStock, data: { productId: product._id, type, quantity: Number(qty), note } });
      if (r.data?.success) {
        toast.success(`Stock ${type === "adjustment" ? "set to" : type === "damage" ? "reduced by" : "updated by"} ${qty}`);
        onSaved(r.data.data.newStock);
        onClose();
      }
    } catch (err) { axiosToastError(err); } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box max-w-sm" onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-xl font-semibold mb-4">Adjust Stock — {product.name}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Adjustment Type</label>
            <div className="grid grid-cols-2 gap-2">
              {[["restock","Restock"],["return","Return"],["damage","Damage"],["adjustment","Set to"]].map(([v,l]) => (
                <label key={v} className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-sm transition-all ${type===v ? "border-theme-primary bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]" : "border-theme"}`}>
                  <input type="radio" value={v} checked={type===v} onChange={() => setType(v)} className="accent-[var(--color-primary)]"/>
                  {l}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{type === "adjustment" ? "New Stock Total" : "Quantity"}</label>
            <input type="number" min="0" value={qty} onChange={e => setQty(e.target.value)} className="input-field" placeholder="Enter quantity"/>
            <p className="text-xs text-theme-muted mt-1">Current stock: <strong>{product.stock}</strong></p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Note (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} className="input-field" placeholder="e.g. Supplier delivery"/>
          </div>
        </div>
        <div className="flex gap-3 justify-end pt-4 border-t border-theme mt-4">
          <button onClick={onClose} className="btn-outline px-5 py-2">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary px-5 py-2">{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

const ORDER_STATUS_COLOR = { Pending:"bg-yellow-100 text-yellow-700", Confirmed:"bg-blue-100 text-blue-700", "On-Hold":"bg-indigo-100 text-indigo-700", "On the way":"bg-purple-100 text-purple-700", Delivered:"bg-green-100 text-green-700", Cancelled:"bg-red-100 text-red-700", Return:"bg-orange-100 text-orange-700" };

// Scan mode — works with real USB/Bluetooth scanners or manual typing.
// Resolves to either a product (SKU/shelf label) or an order (packed box label).
function ScanPanel({ currency, rates, onAdjust, onProductChanged }) {
  const [result,  setResult]  = useState(null); // { type: "product"|"order", product?, order? }
  const [loading, setLoading] = useState(false);
  const [selling, setSelling] = useState(false);

  const handleScan = async (code) => {
    try {
      setLoading(true);
      setResult(null);
      const r = await Axios({ ...api.lookupBarcode, params: { code } });
      if (r.data?.success) setResult(r.data.data);
    } catch (err) {
      axiosToastError(err);
    } finally {
      setLoading(false);
    }
  };

  const quickSale = async () => {
    if (!result?.product) return;
    try {
      setSelling(true);
      const r = await Axios({ ...api.barcodeQuickSale, data: { code: result.product.sku || result.product._id, quantity: 1 } });
      if (r.data?.success) {
        toast.success(r.data.message);
        const updated = { ...result.product, stock: r.data.data.stock };
        setResult({ ...result, product: updated });
        onProductChanged?.(updated);
      }
    } catch (err) { axiosToastError(err); } finally { setSelling(false); }
  };

  return (
    <div className="space-y-4">
      <BarcodeScanner onScan={handleScan} />

      {loading && <div className="skeleton h-32 rounded-2xl" />}

      {!loading && result?.type === "product" && (
        <div className="bg-[var(--color-surface)] border-2 border-theme-primary rounded-2xl p-5 flex gap-4 flex-wrap">
          {result.product.image?.[0] && <img src={result.product.image[0]} alt="" className="h-24 w-24 rounded-xl object-cover shrink-0" />}
          <div className="flex-1 min-w-[200px]">
            <h3 className="font-display text-lg font-semibold">{result.product.name}</h3>
            <p className="text-xs text-theme-muted font-mono mb-1">SKU: {result.product.sku || result.product._id}</p>
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <span className="font-bold text-theme-primary">{displayPrice(result.product.price, currency, rates)}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${result.product.stock === 0 ? "bg-red-100 text-red-600" : result.product.stock <= (result.product.lowStockThreshold || 10) ? "bg-orange-100 text-orange-600" : "bg-green-100 text-green-600"}`}>
                Stock: {result.product.stock}
              </span>
              {result.product.category?.[0]?.name && <span className="badge">{result.product.category[0].name}</span>}
            </div>
          </div>
          <div className="flex gap-2 items-start shrink-0">
            <button onClick={() => onAdjust(result.product)} className="btn-outline px-4 py-2 text-sm">Adjust Stock</button>
            <button onClick={quickSale} disabled={selling || result.product.stock === 0}
              className="btn-primary px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
              <FaShoppingCart size={12}/> {selling ? "Selling…" : "Quick Sale (-1)"}
            </button>
          </div>
        </div>
      )}

      {!loading && result?.type === "order" && (
        <div className="bg-[var(--color-surface)] border-2 border-theme-primary rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <p className="font-mono text-sm font-semibold">{result.order.orderId}</p>
              <p className="text-sm text-theme-muted">{result.order.userId?.name} • {result.order.userId?.mobile}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${ORDER_STATUS_COLOR[result.order.order_status] || "bg-gray-100 text-gray-700"}`}>{result.order.order_status}</span>
          </div>
          <p className="font-bold text-theme-primary mb-3">{displayPrice(result.order.totalAmt, currency, rates)}</p>
          <div className="space-y-1.5">
            {result.order.productDetails?.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {item.image?.[0] && <img src={item.image[0]} alt="" className="h-8 w-8 rounded object-cover" />}
                <span className="flex-1 truncate">{item.name}</span>
                <span className="text-theme-muted">x{item.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function InventoryPage() {
  const currency = useSelector((s) => s.currency.baseCurrency); // item 7: admin reporting always shows the official base currency, not any personal storefront override
  const rates    = useSelector((s) => s.currency.rates);
  const [view,       setView]      = useState("browse"); // "browse" | "scan"
  const [products,  setProducts]  = useState([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [totalPages,setTotalPages]= useState(1);
  const [search,    setSearch]    = useState("");
  const [lowOnly,   setLowOnly]   = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [adjusting, setAdjusting] = useState(null);
  const [logs,      setLogs]      = useState([]);
  const [logsProduct, setLogsProduct] = useState(null);
  const LIMIT = 20;

  const load = async (p = 1) => {
    try {
      setLoading(true);
      const r = await Axios({ ...api.getInventory, params: { page: p, limit: LIMIT, search, lowStock: lowOnly ? "true" : "" } });
      const d = r.data?.data;
      setProducts(d?.products || []);
      setTotal(d?.total || 0);
      setTotalPages(d?.pages || 1);
    } catch (err) { axiosToastError(err); } finally { setLoading(false); }
  };

  useEffect(() => { if (view === "browse") load(page); }, [page, lowOnly, view]);

  const loadLogs = async (product) => {
    try {
      const r = await Axios({ ...api.getInventoryLogs, params: { productId: product._id, limit: 20 } });
      setLogs(r.data?.data?.logs || []);
      setLogsProduct(product);
    } catch (err) { axiosToastError(err); }
  };

  const handleSearch = (e) => { e.preventDefault(); setPage(1); load(1); };

  const stockColor = (p) => {
    if (p.stock === 0) return "text-red-600 bg-red-50";
    if (p.stock <= (p.lowStockThreshold || 10)) return "text-orange-600 bg-orange-50";
    return "text-green-600 bg-green-50";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="section-heading text-2xl">Inventory Management</h1>
          <p className="text-sm text-theme-muted">{total} products total</p>
        </div>
        <div className="flex gap-1 bg-[var(--color-surface)] border border-theme rounded-full p-1">
          <button onClick={() => setView("browse")} className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${view === "browse" ? "bg-theme-primary text-white" : "text-theme-muted"}`}><FaList size={12}/> Browse</button>
          <button onClick={() => setView("scan")} className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${view === "scan" ? "bg-theme-primary text-white" : "text-theme-muted"}`}><FaBarcode size={12}/> Scan</button>
        </div>
      </div>

      {view === "scan" ? (
        <ScanPanel currency={currency} rates={rates} onAdjust={setAdjusting}
          onProductChanged={(updated) => setProducts((prev) => prev.map((p) => p._id === updated._id ? { ...p, stock: updated.stock } : p))} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <form onSubmit={handleSearch} className="flex gap-2 max-w-sm flex-1">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…" className="input-field"/>
              <button type="submit" className="btn-primary px-4 py-2"><FaSearch size={13}/></button>
            </form>
            <label className="flex items-center gap-2 text-sm cursor-pointer shrink-0">
              <input type="checkbox" checked={lowOnly} onChange={e => { setLowOnly(e.target.checked); setPage(1); }} className="h-4 w-4 accent-red-500"/>
              <FaExclamationTriangle className="text-orange-500" size={13}/>
              Low stock only
            </label>
          </div>

          <div className="bg-[var(--color-surface)] border border-theme rounded-2xl overflow-hidden">
            <table className="data-table">
              <thead><tr><th>Product</th><th>SKU</th><th>Stock</th><th>Alert At</th><th>Price</th><th>Actions</th></tr></thead>
              <tbody>
                {loading
                  ? Array.from({length:6}).map((_,i) => <tr key={i}><td colSpan={6}><div className="skeleton h-10 rounded my-1"/></td></tr>)
                  : products.length === 0
                    ? <tr><td colSpan={6} className="text-center py-10 text-theme-muted">No products found</td></tr>
                    : products.map(p => (
                      <tr key={p._id}>
                        <td>
                          <div className="flex items-center gap-2">
                            {p.image?.[0] && <img src={p.image[0]} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0"/>}
                            <div><p className="font-medium text-sm truncate max-w-[180px]">{p.name}</p><p className="text-xs text-theme-muted">{p.unit}</p></div>
                          </div>
                        </td>
                        <td className="font-mono text-xs text-theme-muted">{p.sku || "—"}</td>
                        <td>
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${stockColor(p)}`}>
                            {p.stock === 0 ? "Out of Stock" : p.stock}
                          </span>
                        </td>
                        <td className="text-sm text-theme-muted">{p.lowStockThreshold || 10}</td>
                        <td className="font-semibold text-sm">{displayPrice(p.price, currency, rates)}</td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setAdjusting(p)} className="row-action-btn">Adjust</button>
                            <button onClick={() => loadLogs(p)} className="row-action-btn row-action-btn-muted">Logs</button>
                          </div>
                        </td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <button disabled={page===1} onClick={() => setPage(p=>p-1)} className="px-4 py-2 rounded-lg border border-theme text-sm disabled:opacity-40">Prev</button>
              <span className="px-4 py-2 text-sm text-theme-muted">{page}/{totalPages}</span>
              <button disabled={page===totalPages} onClick={() => setPage(p=>p+1)} className="px-4 py-2 rounded-lg border border-theme text-sm disabled:opacity-40">Next</button>
            </div>
          )}
        </>
      )}

      {/* Inventory Logs panel */}
      {logsProduct && (
        <div className="modal-overlay" onClick={() => setLogsProduct(null)}>
          <div className="modal-box max-w-lg" onClick={e => e.stopPropagation()}>
            <h2 className="font-display text-xl font-semibold mb-4">Stock History — {logsProduct.name}</h2>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {logs.length === 0
                ? <p className="text-sm text-theme-muted text-center py-6">No logs yet</p>
                : logs.map((log, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm bg-[var(--color-bg)] border border-theme rounded-xl px-3 py-2">
                    <span className={`w-20 shrink-0 text-xs font-semibold capitalize px-2 py-0.5 rounded-full text-center
                      ${{ restock:"bg-green-100 text-green-700", sale:"bg-blue-100 text-blue-700", adjustment:"bg-purple-100 text-purple-700", return:"bg-yellow-100 text-yellow-700", damage:"bg-red-100 text-red-600", initial:"bg-gray-100 text-gray-600" }[log.type]}`}>
                      {log.type}
                    </span>
                    <span>{log.previousStock} → <strong>{log.newStock}</strong></span>
                    <span className="text-theme-muted truncate flex-1">{log.note}</span>
                    <span className="text-xs text-theme-muted shrink-0">{new Date(log.createdAt).toLocaleDateString()}</span>
                  </div>
                ))
              }
            </div>
            <button onClick={() => setLogsProduct(null)} className="mt-4 btn-outline w-full py-2">Close</button>
          </div>
        </div>
      )}

      {adjusting && (
        <AdjustModal product={adjusting} onClose={() => setAdjusting(null)}
          onSaved={(newStock) => {
            setProducts(prev => prev.map(p => p._id === adjusting._id ? { ...p, stock: newStock } : p));
            setAdjusting(null);
          }}/>
      )}
    </div>
  );
}
