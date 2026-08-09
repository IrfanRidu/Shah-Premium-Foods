"use client";
import { FaWhatsapp } from "react-icons/fa";
import { buildWhatsAppLink } from "../utils/phoneUtils";

// Sits directly beside the existing Call button — spec: "Add a Call
// button And whatsapp message option beside every phone number."
// Renders nothing if there's no number, same graceful-degradation
// approach the existing call() handler uses.
//
// Two modes: default is a compact icon-only circle (matches icon-btn-
// call's sizing, for table rows). Pass `label` for a full text+icon
// button matching a text-style "Call Customer" sibling (e.g. in a
// detail modal).
export default function WhatsAppButton({ phone, message = "", label = null, compact = false, className = "" }) {
  const link = buildWhatsAppLink(phone, message);
  if (!link) return null;

  if (label) {
    const sizeClasses = compact ? "text-xs font-bold px-3 py-1.5 gap-1.5" : "text-sm font-semibold py-2 px-4 gap-2";
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`flex items-center rounded-full justify-center text-white shrink-0 hover:opacity-90 transition-opacity ${sizeClasses} ${className}`}
        style={{ backgroundColor: "#25d366" }}
      >
        <FaWhatsapp size={compact ? 11 : 14} /> {label}
      </a>
    );
  }

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Message on WhatsApp"
      className={`icon-btn-whatsapp ${className}`}
    >
      <FaWhatsapp size={14} />
    </a>
  );
}
