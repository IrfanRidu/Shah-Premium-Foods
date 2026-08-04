"use client";
import { FaSort } from "react-icons/fa";

// Section 11 (Category Pages — "Mobile-friendly sorting"): this didn't
// exist anywhere before this pass (see product.controller.js for the
// matching backend addition — sortBy was previously accepted nowhere).
// Deliberately a native <select>, not a custom-built dropdown: on a
// touchscreen, a native select opens the OS's own picker (iOS wheel /
// Android bottom sheet) — genuinely more "mobile-friendly" than a custom
// popover, needs no click-outside/focus-trap logic, and is keyboard/
// screen-reader accessible for free. Styled to match the site's pill/
// rounded aesthetic via appearance-none + a custom chevron icon.
const OPTIONS = [
  { value: "newest",     label: "Newest" },
  { value: "price_asc",  label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "name_asc",   label: "Name: A to Z" },
  { value: "name_desc",  label: "Name: Z to A" },
];

export default function SortDropdown({ value, onChange, className = "" }) {
  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <FaSort className="absolute left-3 text-xs text-theme-muted pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Sort products"
        className="h-11 appearance-none pl-8 pr-8 rounded-full border border-theme bg-[var(--color-surface)] text-xs sm:text-sm font-semibold outline-none focus:border-theme-primary cursor-pointer"
      >
        {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <svg className="absolute right-3 h-3 w-3 text-theme-muted pointer-events-none" viewBox="0 0 12 12" fill="none">
        <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
