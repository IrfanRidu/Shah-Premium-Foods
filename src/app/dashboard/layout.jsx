"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import {
  FaUser, FaBox, FaCog, FaStore, FaClipboardList,
  FaUsers, FaUpload, FaBolt, FaTag, FaWarehouse, FaChartLine, FaUserShield,
  FaTruck, FaFileAlt, FaHeadset, FaUserTie, FaHistory, FaHeart, FaClock,
  FaTachometerAlt, FaChevronDown, FaFlask,
} from "react-icons/fa";
import { isSuperAdmin, hasFullDashboardAccess } from "@/lib/utils";
import NotificationBell from "@/components/NotificationBell";
import SafeImage from "@/components/SafeImage";
import IdleLogoutProvider from "@/components/IdleLogoutProvider";
import AgentStatusToggle from "@/modules/callcenter/components/AgentStatusToggle";
import Softphone from "@/modules/callcenter/components/Softphone";

// Personal-account section — identical set for every logged-in role
// (a Super Admin still has their own profile/orders too). Addresses used
// to be a 5th link here; it now lives inside My Profile as a tab instead
// (see dashboard/profile/page.jsx), and Wishlist is new.
const USER_LINKS = [
  { href: "/dashboard/profile",  label: "My Profile",  icon: FaUser },
  { href: "/dashboard/myorders", label: "My Orders",   icon: FaBox },
  { href: "/dashboard/submit-list", label: "Submit Shopping List", icon: FaFileAlt },
  { href: "/dashboard/wishlist", label: "Wishlist",    icon: FaHeart },
  // Phase E (Biometric Attendance) — reachable by everyone regardless of
  // role (like every other USER_LINK), not gated by hrPayroll
  // permission, since this is someone marking THEIR OWN attendance. The
  // page itself handles the common case of an account with no linked
  // Employee record (most accounts on an e-commerce site are customers,
  // not staff) with a plain "not applicable" message rather than this
  // link needing its own boot-time visibility check.
  { href: "/dashboard/my-attendance", label: "My Attendance", icon: FaClock },
];

// The flat 17-link admin list used to just dump everything one after
// another with no grouping at all. Regrouped into the exact 6 categories
// from the spec — every link below maps to exactly one category, nothing
// dropped, nothing duplicated. Each link still declares the
// permission module/action it needs, same mechanism as before, just now
// nested one level under its category.
const ADMIN_CATEGORIES = [
  {
    title: "Products",
    links: [
      { href: "/dashboard/category",         label: "Categories",       icon: FaStore,         module: "categories", action: "view" },
      { href: "/dashboard/subcategory",      label: "Sub-Categories",   icon: FaStore,         module: "categories", action: "view" },
      { href: "/dashboard/product",          label: "Products",         icon: FaBox,           module: "products",   action: "view" },
      { href: "/dashboard/upload-product",   label: "Upload Product",   icon: FaUpload,        module: "products",   action: "create" },
      { href: "/dashboard/inventory",        label: "Inventory",        icon: FaWarehouse,     module: "inventory",  action: "view" },
      { href: "/dashboard/product-requests", label: "Product Requests", icon: FaFileAlt,       module: "inventory",  action: "view" },
    ],
  },
  {
    title: "Analytics",
    links: [
      { href: "/dashboard/analytics", label: "Analytics", icon: FaChartLine, module: "analytics", action: "view" },
    ],
  },
  {
    title: "Customer care and call center",
    links: [
      { href: "/dashboard/call-center",   label: "Agent Dashboard", icon: FaHeadset,       module: "customerCare", action: "view" },
      { href: "/dashboard/call-center/orders", label: "My Order Queue", icon: FaClipboardList, module: "customerCare", action: "view" },
      { href: "/dashboard/admin-orders",  label: "All Orders",    icon: FaClipboardList, module: "orders",       action: "view" },
      { href: "/dashboard/customer-care", label: "Customer Care", icon: FaHeadset,       module: "customerCare", action: "view" },
      { href: "/dashboard/admin-users",   label: "Customers",     icon: FaUsers,         module: "customers",    action: "view" },
      // Session 2 additions — genuinely hidden from everyone but a real
      // Super Admin (same strictSuperAdminOnly pattern as Audit Log
      // below), matching the spec's explicit "Only Super Admin can:
      // Monitor every active call, Monitor all agents... View all
      // analytics... View audit logs" list.
      { href: "/dashboard/call-center-admin",             label: "Live Agent Monitor", icon: FaHeadset, strictSuperAdminOnly: true },
      { href: "/dashboard/call-center-admin/reports",     label: "CRM Reports",        icon: FaChartLine, strictSuperAdminOnly: true },
      { href: "/dashboard/call-center-admin/change-log",  label: "CRM Change History", icon: FaHistory, strictSuperAdminOnly: true },
      { href: "/dashboard/call-center-admin/settings",    label: "Routing & Queue Settings", icon: FaHeadset, strictSuperAdminOnly: true },
    ],
  },
  {
    title: "Website Maintenance",
    links: [
      { href: "/dashboard/campaigns",      label: "Campaigns",      icon: FaBolt, module: "campaigns", action: "view" },
      { href: "/dashboard/coupons",        label: "Coupons",        icon: FaTag,  module: "coupons",   action: "view" },
      { href: "/dashboard/delivery-zones", label: "Delivery Zones", icon: FaTruck, module: "settings",  action: "view" },
      { href: "/dashboard/site-settings",  label: "Site Settings",  icon: FaCog,  module: "settings",  action: "view" },
    ],
  },
  {
    title: "HR and Payroll",
    links: [
      { href: "/dashboard/hr-payroll", label: "HR & Payroll", icon: FaUserTie, module: "hrPayroll", action: "view" },
      // Phase E (Biometric Attendance) — a device's API key is a real
      // credential, not day-to-day CRUD a Demo Admin tour benefits from
      // simulating, same reasoning as Audit Log directly below and this
      // module's own Tax & Deduction Rules — genuinely hidden from Demo
      // Admin too, not just shown and simulated.
      { href: "/dashboard/biometric-devices", label: "Biometric Devices", icon: FaTachometerAlt, strictSuperAdminOnly: true },
    ],
  },
  {
    title: "Security and permissions",
    links: [
      { href: "/dashboard/roles", label: "Roles & Staff", icon: FaUserShield, module: "roles", action: "view" },
      // No `module`/`action` — Audit Log isn't part of the RoleModel
      // permission schema at all, it's gated purely by the strict flag
      // below. Deliberately kept hidden from Demo Admin too (see
      // strictSuperAdminOnly in canSee()) — a real trail of other
      // people's activity isn't "functionality" a demo tour should show.
      { href: "/dashboard/audit-log", label: "Audit Log", icon: FaHistory, strictSuperAdminOnly: true },
    ],
  },
];

function SideLink({ href, label, icon: Icon }) {
  const path = usePathname();
  const active = path === href;
  return (
    <Link href={href}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? "bg-theme-primary text-white shadow-sm" : "hover:bg-[var(--color-border)] text-theme"}`}>
      <Icon size={15} />
      {label}
    </Link>
  );
}

// Collapsible category — starts CLOSED. Clicking the header toggles it
// open/shut. (Previously defaulted open; changed per updated spec so the
// sidebar loads compact and the user opens only the section they need.)
function SidebarCategory({ title, links }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-start justify-between gap-2 px-4 pt-3 pb-1 text-xs uppercase tracking-widest text-theme-muted font-semibold hover:text-theme transition-colors text-left"
      >
        <span className="text-left">{title}</span>
        <FaChevronDown size={10} className={`shrink-0 mt-0.5 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-1">
          {links.map((l) => <SideLink key={l.href} {...l} />)}
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout({ children }) {
  const user        = useSelector((s) => s.user);
  const permissions = useSelector((s) => s.permissions);
  const demoMode    = user.role === "DEMO_ADMIN";
  const pathname    = usePathname();
  const router      = useRouter();

  const canSee = (link) => {
    // Audit Log: genuinely hidden from Demo Admin too, not just shown
    // and simulated — see Phase 3 notes in PROGRESS_TRACKER.md.
    if (link.strictSuperAdminOnly) return isSuperAdmin(user.role);
    // Super Admin AND Demo Admin see the same full breadth everywhere else.
    if (hasFullDashboardAccess(user.role)) return true;
    if (user.role === "ADMIN" && !permissions.permissions?.[link.module]) return true; // legacy admin fallback (full access)
    return !!permissions.permissions?.[link.module]?.[link.action];
  };

  const visibleCategories = ADMIN_CATEGORIES
    .map((cat) => ({ ...cat, links: cat.links.filter(canSee) }))
    .filter((cat) => cat.links.length > 0);

  const showAdminSection = visibleCategories.length > 0;

  // Access guard: previously the sidebar simply hid links a role
  // couldn't see, but nothing stopped someone from typing a restricted
  // URL directly — the page would render, its data fetches would 401/
  // 403, and whoever was looking at it saw a half-broken page with a
  // raw "Unauthorized"/"Permission denied" toast. This finds the most
  // specific matching entry from the exact same ADMIN_CATEGORIES list
  // already used for the sidebar (so there's one source of truth for
  // "what does this route need", not two), and once the permissions
  // state has actually finished loading (not before — redirecting
  // during that brief window would incorrectly boot a legitimate,
  // still-loading Super Admin session), sends anyone who can't see it
  // to the home page with a generic message instead of confirming to
  // a logged-out or under-privileged visitor that the page exists at
  // all.
  const allAdminLinks = ADMIN_CATEGORIES.flatMap((c) => c.links);
  const matchedLink = allAdminLinks
    .filter((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]; // longest/most-specific match wins

  const accessPending = !!matchedLink && !permissions.loaded;
  const accessDenied = !!matchedLink && permissions.loaded && !canSee(matchedLink);

  useEffect(() => {
    if (accessDenied) {
      toast.error("Page not found");
      router.replace("/");
    }
  }, [accessDenied, pathname]);

  return (
    <IdleLogoutProvider>
    {user.role === "CALL_CENTER_AGENT" && <Softphone />}
    <div className="container mx-auto px-4 py-8">
      {/* Fix 4: on mobile the sidebar (and its notification bell) is
          hidden, so surface the bell here too. */}
      <div className="flex md:hidden justify-end mb-3">
        <NotificationBell />
      </div>
      <div className="flex gap-6">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col gap-1 w-60 shrink-0">
          <div className="relative bg-[var(--color-surface)] border border-theme rounded-2xl p-3 mb-2">
            <div className="absolute top-2.5 right-2.5">
              <NotificationBell />
            </div>
            <div className="flex items-center gap-2.5 pr-7">
              {user.avatar
                ? <SafeImage src={user.avatar} alt={user.name} width={40} height={40} className="h-10 w-10 rounded-full object-cover shrink-0" />
                : <div className="h-10 w-10 rounded-full bg-[var(--color-border)] flex items-center justify-center text-theme-muted shrink-0"><FaUser /></div>
              }
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{user.name}</p>
                <p className="text-xs text-theme-muted truncate">{user.email}</p>
                {user.role && user.role !== "USER" && (
                  demoMode ? (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] mt-0.5 badge"
                      style={{ backgroundColor: "color-mix(in srgb, var(--color-secondary) 16%, transparent)", color: "var(--color-secondary)" }}
                    >
                      <FaFlask size={8} /> DEMO ADMIN
                    </span>
                  ) : (
                    <span className="badge text-[10px] mt-0.5">{user.role}</span>
                  )
                )}
              </div>
            </div>
            {demoMode && (
              <p className="text-[11px] text-theme-muted mt-2 pt-2 border-t border-theme leading-snug">
                You're exploring a demo account — nothing you do here changes the real site.
              </p>
            )}
            {/* Call Center CRM module (Session 2): live status toggle,
                shown only for the dedicated agent role — not every
                dashboard user needs an Available/Busy/Break control. */}
            {user.role === "CALL_CENTER_AGENT" && (
              <div className="mt-2 pt-2 border-t border-theme">
                <AgentStatusToggle />
              </div>
            )}
          </div>

          <nav className="flex flex-col gap-1">
            {USER_LINKS.map((l) => <SideLink key={l.href} {...l} />)}

            {showAdminSection && (
              <>
                <SideLink href="/dashboard" label="Dashboard Overview" icon={FaTachometerAlt} />
                {visibleCategories.map((cat) => (
                  <SidebarCategory key={cat.title} title={cat.title} links={cat.links} />
                ))}
              </>
            )}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {accessPending || accessDenied ? (
            <div className="p-12 text-center text-theme-muted text-sm">Loading…</div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
    </IdleLogoutProvider>
  );
}
