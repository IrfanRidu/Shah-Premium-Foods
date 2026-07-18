"use client";
import { useEffect, useState } from "react";
import { FaFileAlt, FaDownload, FaPhone, FaFilePdf } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError } from "@/lib/utils";
import toast from "react-hot-toast";

const STATUSES = ["All", "Pending", "Processing", "Fulfilled", "Rejected"];
const STATUS_COLOR = { Pending:"bg-yellow-100 text-yellow-700", Processing:"bg-blue-100 text-blue-700", Fulfilled:"bg-green-100 text-green-700", Rejected:"bg-red-100 text-red-700" };

// Generates a PDF for a single request — text content typed out, or the
// uploaded photo embedded as a full page — so admin always receives the
// product list as a printable PDF regardless of how the customer sent it in.
async function downloadRequestAsPdf(request) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();

  doc.setFontSize(14);
  doc.text("Customer Product Request", 14, 18);
  doc.setFontSize(10);
  doc.text(`Customer: ${request.userId?.name || "Unknown"}  (${request.userId?.email || ""})`, 14, 26);
  doc.text(`Mobile: ${request.userId?.mobile || "—"}`, 14, 32);
  doc.text(`Submitted: ${new Date(request.createdAt).toLocaleString()}`, 14, 38);
  doc.text(`Frequency: ${request.period} | Status: ${request.status}`, 14, 44);
  if (request.customerNote) doc.text(`Customer note: ${request.customerNote}`, 14, 50);

  doc.line(14, 55, 196, 55);

  if (request.type === "text") {
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(request.textContent || "", 180);
    doc.text(lines, 14, 64);
  } else if (request.imageUrl) {
    try {
      const imgRes = await fetch(request.imageUrl);
      const blob = await imgRes.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      doc.addImage(dataUrl, "JPEG", 14, 60, 180, 0, undefined, "FAST");
    } catch {
      doc.text("(Could not embed image — view original online)", 14, 64);
      doc.textWithLink(request.imageUrl, 14, 70, { url: request.imageUrl });
    }
  }

  doc.save(`product-request-${request._id}.pdf`);
}

export default function ProductRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [statusCounts, setStatusCounts] = useState({});
  const [activeTab, setActiveTab] = useState("All");
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);

  const load = async (status = "All") => {
    try {
      setLoading(true);
      const r = await Axios({ ...api.getAllProductRequests, params: { status } });
      setRequests(r.data?.data || []);
      setStatusCounts(r.data?.statusCounts || {});
    } catch (err) { axiosToastError(err); } finally { setLoading(false); }
  };

  useEffect(() => { load(activeTab); }, [activeTab]);

  const updateStatus = async (id, status) => {
    try {
      const r = await Axios({ ...api.updateProductRequestStatus, data: { _id: id, status } });
      if (r.data?.success) {
        setRequests((prev) => prev.map((req) => req._id === id ? r.data.data : req));
        toast.success("Status updated");
      }
    } catch (err) { axiosToastError(err); }
  };

  const call = (mobile) => { if (mobile) window.location.href = `tel:${mobile}`; else toast.error("No phone number"); };

  const totalCount = Object.values(statusCounts).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="section-heading text-2xl">Product Requests</h1>
        <p className="text-sm text-theme-muted">{totalCount} shopping lists submitted by customers</p>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {STATUSES.map((s) => {
          const count = s === "All" ? totalCount : (statusCounts[s] || 0);
          return (
            <button key={s} onClick={() => setActiveTab(s)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0 ${activeTab === s ? "bg-theme-primary text-white" : "bg-[var(--color-surface)] border border-theme hover:border-theme-primary"}`}>
              {s}
              {count > 0 && <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${activeTab === s ? "bg-white/30 text-white" : "bg-[var(--color-border)]"}`}>{count}</span>}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({length:4}).map((_,i) => <div key={i} className="skeleton h-20 rounded-2xl"/>)}</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 text-theme-muted">No {activeTab !== "All" ? activeTab.toLowerCase() : ""} product requests.</div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r._id} className="bg-[var(--color-surface)] border border-theme rounded-2xl p-4 flex items-center gap-3 flex-wrap">
              <button onClick={() => setViewing(r)} className="shrink-0">
                {r.type === "image"
                  ? <img src={r.imageUrl} alt="" className="h-14 w-14 rounded-lg object-cover" />
                  : <div className="h-14 w-14 rounded-lg bg-[var(--color-bg)] border border-theme flex items-center justify-center"><FaFileAlt className="text-theme-muted" size={18}/></div>
                }
              </button>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setViewing(r)}>
                <p className="font-semibold text-sm">{r.userId?.name || "Customer"}</p>
                <p className="text-xs text-theme-muted truncate">{r.type === "text" ? r.textContent.split("\n")[0] : "Photo list"} • {r.period}</p>
                <p className="text-xs text-theme-muted">{new Date(r.createdAt).toLocaleString()}</p>
              </div>
              <div className="action-group">
                <button onClick={() => call(r.userId?.mobile)} title="Call Customer" className="icon-btn-call"><FaPhone size={12}/></button>
                <button onClick={() => downloadRequestAsPdf(r)} title="Download as PDF" className="icon-btn-pdf"><FaFilePdf size={13}/></button>
                <select value={r.status} onChange={(e) => updateStatus(r._id, e.target.value)}
                  className={`h-9 inline-flex items-center text-xs font-semibold rounded-full px-3 border-none outline-none cursor-pointer leading-none ${STATUS_COLOR[r.status] || "bg-gray-100 text-gray-700"}`}>
                  {STATUSES.slice(1).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail viewer */}
      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="modal-box max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-semibold mb-1">{viewing.userId?.name}'s List</h2>
            <p className="text-xs text-theme-muted mb-4">{viewing.userId?.email} • {viewing.userId?.mobile}</p>
            {viewing.type === "text" ? (
              <pre className="whitespace-pre-wrap text-sm bg-[var(--color-bg)] border border-theme rounded-xl p-4 max-h-80 overflow-y-auto font-sans">{viewing.textContent}</pre>
            ) : (
              <img src={viewing.imageUrl} alt="" className="w-full rounded-xl max-h-96 object-contain bg-[var(--color-bg)]" />
            )}
            {viewing.customerNote && <p className="text-sm mt-3"><strong>Customer note:</strong> {viewing.customerNote}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => downloadRequestAsPdf(viewing)} className="btn-primary flex-1 py-2 flex items-center justify-center gap-2"><FaDownload size={12}/> Download PDF</button>
              <button onClick={() => setViewing(null)} className="btn-outline flex-1 py-2">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
