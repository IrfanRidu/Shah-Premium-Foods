"use client";
import { useEffect } from "react";

export default function ConfirmBox({ title, message, onConfirm, onCancel, confirmLabel = "Confirm", danger = false }) {
  // Accessibility pass (requirement #14 — "keyboard accessibility"): same
  // gap as the header's mobile drawer — no keyboard-only way to dismiss
  // this without Escape support.
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === "Escape") onCancel?.(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel} role="dialog" aria-modal="true" aria-label={title || "Confirm"}>
      <div className="modal-box max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-semibold mb-2">{title || "Are you sure?"}</h3>
        {message && <p className="text-sm text-theme-muted mb-5">{message}</p>}
        <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:justify-end">
          <button onClick={onCancel} className="btn-outline text-sm w-full sm:w-auto">Cancel</button>
          <button onClick={onConfirm}
            className={`h-11 w-full sm:w-auto px-5 rounded-full text-sm font-semibold text-white transition-colors active:scale-[0.98] ${danger ? "bg-red-500 hover:bg-red-600" : "btn-primary"}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
