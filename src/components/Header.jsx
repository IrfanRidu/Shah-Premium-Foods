"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import {
  FaRegUserCircle, FaShoppingCart, FaBars, FaTimes,
  FaChevronRight, FaChevronDown,
} from "react-icons/fa";
import Search from "./Search";
import UserMenu from "./UserMenu";
import PreferenceSelector from "./PreferenceSelector";
import { validURLConvert, displayPrice, priceWithDiscount } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export default function Header() {
  const { t }          = useTranslation();
  const user          = useSelector((s) => s.user);
  const settings      = useSelector((s) => s.siteSettings);
  const cart          = useSelector((s) => s.cartItem.cart);
  const categories    = useSelector((s) => s.product.allCategory);
  const subCategories = useSelector((s) => s.product.allSubCategory);
  const currency      = useSelector((s) => s.currency.selected);
  const rates         = useSelector((s) => s.currency.rates);
  const router        = useRouter();

  // Dropdown states: null = closed, "hover" = open via hover only, "pinned" = locked open by click
  const [megaState,   setMegaState]   = useState(null); // null | "hover" | "pinned"
  const [userState,   setUserState]   = useState(null); // null | "hover" | "pinned"
  const [activecat,   setActiveCat]   = useState(null);
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [mobileExp,   setMobileExp]   = useState(null);

  const megaRef = useRef(null);
  const userRef = useRef(null);
  const megaHoverTimer = useRef(null);
  const userHoverTimer = useRef(null);

  const megaOpen = megaState !== null;
  const userOpen = userState !== null;

  useEffect(() => {
    if (categories.length && !activecat) setActiveCat(categories[0]);
  }, [categories, activecat]);

  // Click-outside closes pinned dropdowns
  useEffect(() => {
    const handler = (e) => {
      if (megaRef.current && !megaRef.current.contains(e.target)) setMegaState(null);
      if (userRef.current && !userRef.current.contains(e.target)) setUserState(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const clearMegaTimer = () => { if (megaHoverTimer.current) clearTimeout(megaHoverTimer.current); };
  const clearUserTimer = () => { if (userHoverTimer.current) clearTimeout(userHoverTimer.current); };

  // Products dropdown handlers
  const onMegaMouseEnter = () => {
    clearMegaTimer();
    if (megaState !== "pinned") setMegaState("hover");
  };
  const onMegaMouseLeave = () => {
    clearMegaTimer();
    // Only close if not pinned
    megaHoverTimer.current = setTimeout(() => {
      setMegaState((s) => s === "pinned" ? "pinned" : null);
    }, 150);
  };
  const onMegaClick = () => {
    if (megaState === "pinned") {
      setMegaState(null); // second click closes
    } else {
      setMegaState("pinned"); // first click pins open
    }
  };

  // User dropdown handlers
  const onUserMouseEnter = () => {
    clearUserTimer();
    if (userState !== "pinned") setUserState("hover");
  };
  const onUserMouseLeave = () => {
    clearUserTimer();
    userHoverTimer.current = setTimeout(() => {
      setUserState((s) => s === "pinned" ? "pinned" : null);
    }, 150);
  };
  const onUserClick = () => {
    if (userState === "pinned") {
      setUserState(null);
    } else {
      setUserState("pinned");
    }
  };

  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
  const totalAmt = cart.reduce((s, i) => {
    const p = i.productId; if (!p) return s;
    return s + priceWithDiscount(p.price, p.discount) * i.quantity;
  }, 0);

  const subsForActive = subCategories.filter((sub) =>
    sub.category?.some((c) => (c._id || c) === activecat?._id)
  );

  const goSub = (cat, sub) => {
    setMegaState(null); setMobileOpen(false);
    router.push(`/${validURLConvert(cat.name, cat._id)}/${validURLConvert(sub.name, sub._id)}`);
  };

  return (
    <header className="sticky top-0 z-40 bg-[var(--color-header-bg)] border-b border-theme shadow-sm">
      {settings.header?.showAnnouncement && settings.header?.announcementText && (
        <div className="bg-theme-primary text-white text-xs overflow-hidden whitespace-nowrap py-1.5">
          <span className="animate-marquee inline-block px-4">
            {settings.header.announcementText}&nbsp;&nbsp;&nbsp;&nbsp;
            {settings.header.announcementText}
          </span>
        </div>
      )}

      <div className="container mx-auto px-4 py-3 flex items-center gap-3 lg:gap-6">
        <button onClick={() => setMobileOpen(true)} className="lg:hidden text-2xl" aria-label="Menu">
          <FaBars />
        </button>

        <Link href="/" className="flex items-center gap-2 shrink-0">
          {settings.logo
            ? <img src={settings.logo} alt={settings.siteName} className="h-9 w-auto" />
            : <span className="font-display text-xl md:text-2xl font-bold text-theme-primary">
                {settings.siteName || "Shah Premium Foods"}
              </span>
          }
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1 relative" ref={megaRef}>
          <Link href="/" className="px-3 py-2 text-sm font-medium rounded-md hover:bg-[var(--color-border)] transition-colors">
            {t("nav.home")}
          </Link>
          <Link href="/products" className="px-3 py-2 text-sm font-medium rounded-md hover:bg-[var(--color-border)] transition-colors">
            {t("nav.allProducts")}
          </Link>
          <div
            onMouseEnter={onMegaMouseEnter}
            onMouseLeave={onMegaMouseLeave}
            className="relative"
          >
            <button
              onClick={onMegaClick}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md hover:bg-[var(--color-border)] transition-colors"
            >
              {t("nav.categories")} <FaChevronDown className={`text-xs transition-transform ${megaOpen ? "rotate-180" : ""}`} />
            </button>

            {megaOpen && categories.length > 0 && (
              <div className="absolute top-full left-0 mt-2 w-[640px] max-w-[90vw] bg-theme-surface border border-theme rounded-xl shadow-xl flex overflow-hidden animate-slide-up">
                <ul className="w-48 border-r border-theme py-2 max-h-96 overflow-y-auto">
                  {categories.map((cat) => (
                    <li key={cat._id}>
                      <button
                        onMouseEnter={() => setActiveCat(cat)}
                        onClick={() => { setMegaState(null); router.push(`/category/${validURLConvert(cat.name, cat._id)}`); }}
                        className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-left transition-colors ${activecat?._id === cat._id ? "bg-theme-primary text-white" : "hover:bg-[var(--color-border)]"}`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          {cat.image && <img src={cat.image} alt="" className="h-6 w-6 rounded-full object-cover" />}
                          {cat.name}
                        </span>
                        <FaChevronRight className="text-xs shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex-1 p-4 grid grid-cols-2 gap-2 max-h-96 overflow-y-auto content-start">
                  {subsForActive.length === 0
                    ? <p className="text-sm text-theme-muted col-span-2">No sub-categories yet.</p>
                    : subsForActive.map((sub) => (
                      <button key={sub._id} onClick={() => goSub(activecat, sub)}
                        className="flex items-center gap-2 text-sm text-left px-3 py-2 rounded-lg hover:bg-[var(--color-border)] transition-colors">
                        {sub.image && <img src={sub.image} alt="" className="h-8 w-8 rounded-md object-cover shrink-0" />}
                        <span className="truncate">{sub.name}</span>
                      </button>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        </nav>

        <div className="flex-1 hidden md:block max-w-md mx-auto"><Search /></div>

        <div className="flex items-center gap-3 lg:gap-5 ml-auto">
          <PreferenceSelector />
          <Link href="/cart" className="relative flex items-center gap-2 text-theme-primary">
            <span className="relative text-2xl">
              <FaShoppingCart />
              {totalQty > 0 && (
                <span className="absolute -top-2 -right-2 bg-[var(--color-secondary)] text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {totalQty}
                </span>
              )}
            </span>
            {totalQty > 0 && (
              <span className="hidden lg:inline text-sm font-semibold">{displayPrice(totalAmt, currency, rates)}</span>
            )}
          </Link>

          {user._id ? (
            <div
              className="relative"
              ref={userRef}
              onMouseEnter={onUserMouseEnter}
              onMouseLeave={onUserMouseLeave}
            >
              <button onClick={onUserClick} className="text-2xl flex items-center" aria-label="Account">
                {user.avatar
                  ? <img src={user.avatar} alt={user.name} className="h-8 w-8 rounded-full object-cover" />
                  : <FaRegUserCircle />
                }
              </button>
              {userOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 animate-slide-up">
                  <UserMenu close={() => setUserState(null)} />
                </div>
              )}
            </div>
          ) : (
            <Link href="/login" className="btn-primary text-sm">{t("nav.login")}</Link>
          )}
        </div>
      </div>

      <div className="px-4 pb-3 md:hidden"><Search /></div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative w-72 max-w-[85vw] bg-theme-surface h-full overflow-y-auto p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <span className="font-display text-lg font-bold text-theme-primary">
                {settings.siteName || "Shah Premium Foods"}
              </span>
              <button onClick={() => setMobileOpen(false)} className="text-2xl" aria-label="Close"><FaTimes /></button>
            </div>
            <Link href="/" onClick={() => setMobileOpen(false)} className="block px-3 py-2 rounded-lg font-medium hover:bg-[var(--color-border)] mb-1">{t("nav.home")}</Link>
            <Link href="/products" onClick={() => setMobileOpen(false)} className="block px-3 py-2 rounded-lg font-medium hover:bg-[var(--color-border)] mb-1">{t("nav.allProducts")}</Link>
            <p className="mt-3 mb-2 px-3 text-xs uppercase tracking-widest text-theme-muted font-semibold">{t("nav.categories")}</p>
            {categories.map((cat) => {
              const subs = subCategories.filter((s) => s.category?.some((c) => (c._id || c) === cat._id));
              const open = mobileExp === cat._id;
              return (
                <div key={cat._id}>
                  <button onClick={() => setMobileExp(open ? null : cat._id)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[var(--color-border)] text-sm font-medium">
                    {cat.name}
                    <FaChevronDown className={`text-xs transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <div className="pl-5 flex flex-col gap-0.5 mb-1">
                      {subs.map((sub) => (
                        <button key={sub._id} onClick={() => goSub(cat, sub)}
                          className="text-left text-sm py-1.5 px-2 text-theme-muted hover:text-theme-primary rounded">
                          {sub.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="mt-5 pt-5 border-t border-theme">
              {user._id
                ? <Link href="/dashboard/profile" onClick={() => setMobileOpen(false)}
                    className="block px-3 py-2 rounded-lg font-medium hover:bg-[var(--color-border)]">{t("nav.myAccount")}</Link>
                : <Link href="/login" onClick={() => setMobileOpen(false)}
                    className="block text-center btn-primary">{t("nav.login")}</Link>
              }
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
