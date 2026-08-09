"use client";
import { FaPhone, FaPhoneSlash } from "react-icons/fa";

// Rendered by Softphone.jsx whenever phoneState === "incoming". A
// simple overlay rather than a full page — an agent could be anywhere
// in the dashboard when a call comes in.
export default function IncomingCallModal({ callerNumber, onAnswer, onReject }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-8 w-full max-w-sm text-center shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto mb-4 animate-bounce">
          <FaPhone size={24} />
        </div>
        <p className="text-xs uppercase tracking-widest text-theme-muted mb-1">Incoming Call</p>
        <h2 className="text-2xl font-bold mb-6">{callerNumber || "Unknown number"}</h2>

        <div className="flex items-center justify-center gap-6">
          <button
            onClick={onReject}
            title="Decline"
            className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
          >
            <FaPhoneSlash size={20} />
          </button>
          <button
            onClick={onAnswer}
            title="Answer"
            className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 transition-colors"
          >
            <FaPhone size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
