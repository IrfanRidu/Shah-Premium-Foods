"use client";
import { useState, useRef, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { FaGlobe, FaChevronDown } from "react-icons/fa";
import { setSelectedCurrency, clearUserCurrencyOverride } from "@/store/currencySlice";
import { setActiveTheme, setActiveLanguage } from "@/store/siteSettingsSlice";
import { useTranslation, LANGUAGES } from "@/lib/i18n";

const CURRENCIES = [
  { code: "BDT", label: "৳ BDT", name: "Bangladeshi Taka" },
  { code: "USD", label: "$ USD", name: "US Dollar" },
  { code: "EUR", label: "€ EUR", name: "Euro" },
  { code: "INR", label: "₹ INR", name: "Indian Rupee" },
  { code: "PKR", label: "₨ PKR", name: "Pakistani Rupee" },
  { code: "GBP", label: "£ GBP", name: "British Pound" },
];

const THEMES = [
  { code: "default", label: "Default", swatch: "#4A7860" },
  { code: "dark",     label: "Dark",    swatch: "#62a07f" },
  { code: "ocean",    label: "Ocean",   swatch: "#1E6FA8" },
  { code: "festive",  label: "Festive", swatch: "#C0392B" },
];

// Fix 48: currency / theme / language panel now follows the same
// hover-opens → click-pins → click-again-closes pattern as the header's
// mega-menu and user-menu (see Header.jsx for the canonical version of
// this state machine). null = closed, "hover" = open-but-not-pinned,
// "pinned" = locked open by an explicit click.
export default function PreferenceSelector() {
  const dispatch  = useDispatch();
  const { t }     = useTranslation();
  const currency  = useSelector((s) => s.currency.selected);
  const isOverride = useSelector((s) => s.currency.isUserOverride);
  const baseCurrency = useSelector((s) => s.currency.baseCurrency);
  const theme     = useSelector((s) => s.siteSettings.theme?.activeTheme);
  const lang      = useSelector((s) => s.siteSettings.language?.activeLanguage);
  const availableThemes = useSelector((s) => s.siteSettings.theme?.availableThemes) || ["default","dark","ocean","festive"];

  const [panelState, setPanelState] = useState(null); // null | "hover" | "pinned"
  const open = panelState !== null;
  const ref = useRef(null);
  const hoverTimer = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setPanelState(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const clearTimer = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); };
  const onMouseEnter = () => {
    clearTimer();
    if (panelState !== "pinned") setPanelState("hover");
  };
  const onMouseLeave = () => {
    clearTimer();
    hoverTimer.current = setTimeout(() => {
      setPanelState((s) => (s === "pinned" ? "pinned" : null));
    }, 150);
  };
  const onTriggerClick = () => {
    setPanelState((s) => (s === "pinned" ? null : "pinned"));
  };

  // Personal preference — stored in Redux only. The unified localStorageMiddleware
  // (src/store/localStorageMiddleware.js) already persists the whole `siteSettings`
  // slice — including theme/language — on every action, and setSiteSettings()
  // now preserves these two leaf fields across every settings refetch (Fix 44),
  // so no separate/duplicate localStorage bookkeeping is needed here anymore.
  const setPersonalTheme = (code) => dispatch(setActiveTheme(code));
  const setPersonalLang  = (code) => dispatch(setActiveLanguage(code));

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button onClick={onTriggerClick}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-theme text-xs font-semibold hover:bg-[var(--color-border)] transition-colors">
        <FaGlobe size={12} />
        {currency}
        <FaChevronDown size={9} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-[var(--color-surface)] border border-theme rounded-xl shadow-xl z-50 p-3 animate-slide-up">
          {/* Currency */}
          <p className="text-xs font-semibold uppercase tracking-widest text-theme-muted mb-2">{t("common.currency")}</p>
          <div className="grid grid-cols-3 gap-1.5 mb-1.5">
            {CURRENCIES.map((c) => (
              <button key={c.code} onClick={() => dispatch(setSelectedCurrency(c.code))}
                className={`text-xs font-semibold px-2 py-1.5 rounded-lg border transition-all ${currency === c.code ? "border-theme-primary bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] text-theme-primary" : "border-theme hover:border-theme-primary/50"}`}
                title={c.name}>
                {c.label}
              </button>
            ))}
          </div>
          {isOverride && (
            <button onClick={() => dispatch(clearUserCurrencyOverride())}
              className="text-[11px] text-theme-muted hover:text-theme-primary hover:underline mb-4 inline-block">
              Use site default ({baseCurrency})
            </button>
          )}
          {!isOverride && <div className="mb-4" />}

          {/* Theme */}
          <p className="text-xs font-semibold uppercase tracking-widest text-theme-muted mb-2">{t("common.theme")}</p>
          <div className="grid grid-cols-2 gap-1.5 mb-4">
            {THEMES.filter((th) => availableThemes.includes(th.code)).map((th) => (
              <button key={th.code} onClick={() => setPersonalTheme(th.code)}
                className={`flex items-center gap-2 text-xs font-medium px-2 py-1.5 rounded-lg border transition-all ${theme === th.code ? "border-theme-primary" : "border-theme hover:border-theme-primary/50"}`}>
                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: th.swatch }} />
                {th.label}
              </button>
            ))}
          </div>

          {/* Language */}
          <p className="text-xs font-semibold uppercase tracking-widest text-theme-muted mb-2">{t("common.language")}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {LANGUAGES.map((l) => (
              <button key={l.code} onClick={() => setPersonalLang(l.code)}
                className={`text-xs font-medium px-2 py-1.5 rounded-lg border transition-all ${lang === l.code ? "border-theme-primary text-theme-primary" : "border-theme hover:border-theme-primary/50"}`}>
                {l.nativeLabel}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
