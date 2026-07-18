"use client";
export default function ConfirmBox({ title, message, onConfirm, onCancel, confirmLabel = "Confirm", danger = false }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-semibold mb-2">{title || "Are you sure?"}</h3>
        {message && <p className="text-sm text-theme-muted mb-5">{message}</p>}
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="btn-outline text-sm px-4 py-2">Cancel</button>
          <button onClick={onConfirm}
            className={`px-4 py-2 rounded-full text-sm font-semibold text-white transition-colors ${danger ? "bg-red-500 hover:bg-red-600" : "btn-primary"}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
