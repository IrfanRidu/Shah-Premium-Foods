"use client";
import { useEffect, useState, useRef } from "react";
import { FaChevronDown } from "react-icons/fa";

// Reusable searchable dropdown for products — combobox pattern with manual
// typing AND a clickable dropdown list, closes on selection/outside-click.
// Originally lived only in the Campaigns admin page; extracted here so the
// Coupons admin page (product-specific coupons) can use the exact same,
// already-working search/select behavior instead of a second implementation.
export default function ProductDropdown({ allProducts, excludeIds = [], onSelect, placeholder = "Search or select a product…", loading = false, error = false, onRetry }) {
  const [query, setQuery]   = useState("");
  const [open,  setOpen]    = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Defensive: allProducts should always be an array, but guard against a
  // still-loading/failed fetch upstream ever handing this a non-array (that
  // exact mistake — an un-unwrapped pagination object reaching here instead
  // of the plain product array — is what caused a hard crash once already).
  const products = Array.isArray(allProducts) ? allProducts : [];
  const matches = products
    .filter((p) => !excludeIds.includes(p._id))
    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) || p.sku?.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 30);

  return (
    <div className="relative" ref={wrapRef}>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={loading ? "Loading products…" : placeholder}
          disabled={loading}
          className="input-field pr-8 disabled:opacity-60"
        />
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-theme-muted">
          <FaChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {/* Fix: a failed product fetch used to fail completely silently — the
          picker just sat there empty forever, indistinguishable from "there
          really are no products," with no way for anyone to tell what was
          actually wrong. Now it says so, with a way to try again. */}
      {error && (
        <p className="text-xs text-red-500 mt-1.5 flex items-center gap-2">
          Couldn't load products.
          {onRetry && <button type="button" onClick={onRetry} className="underline font-semibold">Retry</button>}
        </p>
      )}
      {open && !loading && (
        <div className="absolute z-20 mt-1 w-full bg-[var(--color-bg)] border border-theme rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {matches.length === 0 ? (
            <p className="text-sm text-theme-muted text-center py-4">
              {error ? "Couldn't load the product list — see above" : products.length === 0 ? "No products found in your catalog yet" : query ? "No matching products" : "Type to search, or browse all products"}
            </p>
          ) : matches.map((p) => (
            <button key={p._id} type="button"
              onClick={() => { onSelect(p); setQuery(""); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--color-border)] text-sm text-left">
              {p.image?.[0] && <img src={p.image[0]} alt="" className="h-8 w-8 rounded object-cover shrink-0" />}
              <span className="flex-1 truncate">{p.name}</span>
              {p.sku && <span className="text-theme-muted text-xs shrink-0">{p.sku}</span>}
              <span className="text-theme-muted text-xs shrink-0">৳{p.price}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
