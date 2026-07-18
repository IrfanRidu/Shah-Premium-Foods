"use client";
import { useEffect, useState } from "react";
import { FaFileAlt, FaCamera, FaPaperPlane, FaClock } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError } from "@/lib/utils";
import toast from "react-hot-toast";

const STATUS_COLOR = { Pending:"bg-yellow-100 text-yellow-700", Processing:"bg-blue-100 text-blue-700", Fulfilled:"bg-green-100 text-green-700", Rejected:"bg-red-100 text-red-700" };
const PERIODS = [["once","One-time"],["daily","Daily"],["weekly","Weekly"],["monthly","Monthly"]];

export default function SubmitListPage() {
  const [mode,    setMode]    = useState("text"); // "text" | "image"
  const [text,    setText]    = useState("");
  const [period,  setPeriod]  = useState("once");
  const [note,    setNote]    = useState("");
  const [imgFile, setImgFile] = useState(null);
  const [imgPreview, setImgPreview] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = async () => {
    try {
      const r = await Axios({ ...api.getMyProductRequests });
      setHistory(r.data?.data || []);
    } catch {} finally { setLoadingHistory(false); }
  };

  useEffect(() => { loadHistory(); }, []);

  const handleImagePick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImgFile(f);
    setImgPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (mode === "text" && !text.trim()) { toast.error("Please type your product list"); return; }
    if (mode === "image" && !imgFile) { toast.error("Please choose a photo of your list"); return; }

    try {
      setSubmitting(true);
      let imageUrl = "";
      if (mode === "image") {
        const fd = new FormData();
        fd.append("image", imgFile);
        const up = await Axios({ ...api.uploadImage, data: fd });
        imageUrl = up.data?.data?.url || up.data?.data?.secure_url;
        if (!imageUrl) throw new Error("Image upload failed");
      }

      const r = await Axios({
        ...api.submitProductRequest,
        data: {
          type: mode,
          textContent: mode === "text" ? text.trim() : "",
          imageUrl: mode === "image" ? imageUrl : "",
          period, customerNote: note.trim(),
        },
      });
      if (r.data?.success) {
        toast.success("Your list has been sent to the store!");
        setText(""); setImgFile(null); setImgPreview(""); setNote("");
        loadHistory();
      }
    } catch (err) {
      axiosToastError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="section-heading text-2xl">Submit Shopping List</h1>
        <p className="text-sm text-theme-muted">Send us your daily, weekly, or monthly product list — type it out or just snap a photo, and we'll get it ready for delivery.</p>
      </div>

      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 space-y-4">
        {/* Mode toggle */}
        <div className="flex gap-2">
          <button onClick={() => setMode("text")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all ${mode === "text" ? "border-theme-primary bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)] text-theme-primary" : "border-theme text-theme-muted"}`}>
            <FaFileAlt size={13}/> Type my list
          </button>
          <button onClick={() => setMode("image")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all ${mode === "image" ? "border-theme-primary bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)] text-theme-primary" : "border-theme text-theme-muted"}`}>
            <FaCamera size={13}/> Upload a photo
          </button>
        </div>

        {mode === "text" ? (
          <div>
            <label className="block text-sm font-medium mb-1.5">Your Product List</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className="input-field resize-none"
              placeholder={"e.g.\n2kg Rice\n1L Soybean Oil\n1 dozen Eggs\n500g Lentils"} />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium mb-1.5">Photo of Your List</label>
            <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-theme rounded-xl cursor-pointer hover:border-theme-primary transition-colors overflow-hidden bg-[var(--color-bg)]">
              {imgPreview
                ? <img src={imgPreview} alt="preview" className="h-full w-full object-contain" />
                : <span className="text-sm text-theme-muted flex flex-col items-center gap-2"><FaCamera size={24}/> Tap to choose or take a photo</span>
              }
              <input type="file" accept="image/*" capture="environment" onChange={handleImagePick} className="hidden" />
            </label>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1.5">How often is this list?</label>
          <div className="flex gap-2 flex-wrap">
            {PERIODS.map(([val, label]) => (
              <button key={val} onClick={() => setPeriod(val)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${period === val ? "border-theme-primary bg-theme-primary text-white" : "border-theme text-theme-muted"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Note for the store (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="input-field" placeholder="e.g. Please deliver before 6pm" />
        </div>

        <button onClick={submit} disabled={submitting} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
          <FaPaperPlane size={13}/> {submitting ? "Sending…" : "Send List to Store"}
        </button>
      </div>

      {/* History */}
      <div>
        <h2 className="font-display text-lg font-semibold mb-3">Your Submitted Lists</h2>
        {loadingHistory ? (
          <div className="space-y-2">{Array.from({length:2}).map((_,i) => <div key={i} className="skeleton h-16 rounded-xl"/>)}</div>
        ) : history.length === 0 ? (
          <p className="text-sm text-theme-muted">No lists submitted yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h._id} className="bg-[var(--color-surface)] border border-theme rounded-xl p-3 flex items-center gap-3">
                {h.type === "image"
                  ? <img src={h.imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" />
                  : <div className="h-12 w-12 rounded-lg bg-[var(--color-bg)] flex items-center justify-center shrink-0"><FaFileAlt className="text-theme-muted"/></div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{h.type === "text" ? h.textContent.split("\n")[0] : "Photo list"}</p>
                  <p className="text-xs text-theme-muted flex items-center gap-1"><FaClock size={9}/> {new Date(h.createdAt).toLocaleString()} • {h.period}</p>
                  {h.adminNote && <p className="text-xs text-theme-primary mt-0.5">Store note: {h.adminNote}</p>}
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${STATUS_COLOR[h.status] || "bg-gray-100 text-gray-600"}`}>{h.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
