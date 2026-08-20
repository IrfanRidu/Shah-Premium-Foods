"use client";
import { FaExclamationTriangle } from "react-icons/fa";

// Session 4 (Luxury redesign — design-system gap fill). Companion to
// EmptyState.jsx — the brief's design-system list asks for both "Empty
// states" and "Error states" as first-class, documented pieces. Uses
// the same color-mix() pattern as the new badge-danger variant in
// globals.css for its icon circle, so a failed-fetch state and a
// "danger" badge read as visually related concepts rather than two
// unrelated shades of red invented independently.
export default function ErrorState({
  title = "Something went wrong",
  description = "Please try again in a moment.",
  onRetry,
  className = "",
}) {
  return (
    <div className={`text-center py-10 px-4 ${className}`}>
      <div
        className="mx-auto mb-3 h-12 w-12 rounded-full flex items-center justify-center"
        style={{ background: "color-mix(in srgb, #dc2626 12%, transparent)", color: "#dc2626" }}
      >
        <FaExclamationTriangle size={18} aria-hidden="true" />
      </div>
      <h3 className="font-semibold text-theme mb-1">{title}</h3>
      <p className="text-sm text-theme-muted max-w-sm mx-auto">{description}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-outline mt-4 px-6 py-2.5 text-sm">
          Try Again
        </button>
      )}
    </div>
  );
}
