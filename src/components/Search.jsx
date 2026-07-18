"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FaSearch, FaTimes } from "react-icons/fa";
import { useSelector } from "react-redux";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { validURLConvert, displayPrice } from "@/lib/utils";
import { useGlobalContext } from "@/providers/GlobalProvider";
import { useTranslation } from "@/lib/i18n";

// Bolds the portion of `name` that matches the typed query, so suggestions
// visibly respond to what the customer is typing as they type it.
function HighlightMatch({ text, query }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <strong className="text-theme-primary">{text.slice(idx, idx + query.length)}</strong>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function Search() {
  const { t }    = useTranslation();
  const [q, setQ]         = useState("");
  const [results, setRes] = useState([]);
  const [open, setOpen]   = useState(false);
  const [loading, setLoading] = useState(false);
  const router   = useRouter();
  const currency = useSelector((s) => s.currency.selected);
  const rates    = useSelector((s) => s.currency.rates);
  const { logActivity } = useGlobalContext();
  const timer  = useRef(null);
  const wrapRef= useRef(null);

  const search = useCallback(async (val) => {
    if (!val.trim()) { setRes([]); return; }
    try {
      setLoading(true);
      const r = await Axios({ ...api.searchProduct, data: { search: val, page: 1, limit: 8 } });
      setRes(r.data?.data || []);
    } catch { setRes([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim()) {
      // Suggestions update live as the customer types — short debounce just
      // enough to avoid firing a request on every single keystroke.
      timer.current = setTimeout(() => {
        search(q);
        setOpen(true);
        logActivity?.("search", { searchQuery: q });
      }, 250);
    } else { setRes([]); setOpen(false); }
    return () => clearTimeout(timer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, search]);

  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const goSearch = (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const goProduct = (p) => {
    setOpen(false); setQ("");
    router.push(`/product/${validURLConvert(p.name, p._id)}`);
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <form onSubmit={goSearch} className="flex items-center gap-2 bg-[var(--color-surface)] border border-theme rounded-full px-4 py-2">
        <FaSearch className="text-theme-muted shrink-0 text-sm" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder={t("search.placeholder")}
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-theme-muted"
        />
        {q && (
          <button type="button" onClick={() => { setQ(""); setRes([]); setOpen(false); }} className="text-theme-muted hover:text-theme-primary">
            <FaTimes size={12} />
          </button>
        )}
      </form>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--color-surface)] border border-theme rounded-xl shadow-xl z-50 overflow-hidden animate-slide-up max-h-96 overflow-y-auto">
          {loading && (
            <div className="px-4 py-3 text-sm text-theme-muted">{t("search.searching")}</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-theme-muted">{t("search.noResults", { q })}</div>
          )}
          {!loading && results.map((p) => (
            <button key={p._id} onClick={() => goProduct(p)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--color-border)] text-left transition-colors">
              {p.image?.[0] && <img src={p.image[0]} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />}
              <span className="flex-1 min-w-0">
                <span className="text-sm font-medium truncate block"><HighlightMatch text={p.name} query={q} /></span>
                {p.unit && <span className="text-xs text-theme-muted">{p.unit}</span>}
              </span>
              <span className="text-sm font-semibold text-theme-primary shrink-0">{displayPrice(p.price, currency, rates)}</span>
            </button>
          ))}
          {!loading && results.length > 0 && (
            <button onClick={goSearch} className="w-full text-center text-xs font-semibold text-theme-primary py-2.5 border-t border-theme hover:bg-[var(--color-border)] transition-colors">
              {t("search.seeAll", { q })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
