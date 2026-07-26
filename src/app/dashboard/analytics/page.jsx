"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import {
  FaChartLine, FaCog, FaMoneyBillWave, FaWarehouse, FaUsers,
  FaBullhorn, FaReceipt, FaThLarge,
} from "react-icons/fa";

// Section 9 (Performance) — "Dynamic imports" / "Code splitting" /
// "Optimize bundle size". These 8 tabs were previously ALL statically
// imported below — meaning every one of them (6 of the 8 pull in
// recharts, a genuinely heavy charting library) loaded as part of this
// page's initial JS bundle even though only ONE tab is ever visible at a
// time. next/dynamic defers each tab's own code — and recharts along
// with it — until the moment its tab is actually clicked, the single
// highest-value code-splitting opportunity in this app. Admin-only page,
// so this doesn't touch storefront SEO/LCP at all — pure bundle-size win
// for whoever's using the dashboard.
const tabLoading = () => (
  <div className="space-y-4 animate-pulse" aria-label="Loading tab" role="status">
    <div className="h-8 w-48 bg-[var(--color-border)] rounded-lg" />
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 bg-[var(--color-border)] rounded-xl" />
      ))}
    </div>
    <div className="h-64 bg-[var(--color-border)] rounded-xl" />
  </div>
);

const DashboardTab      = dynamic(() => import("./DashboardTab"),      { loading: tabLoading });
const SettingsTab       = dynamic(() => import("./SettingsTab"),       { loading: tabLoading });
const FinancialTab      = dynamic(() => import("./FinancialTab"),      { loading: tabLoading });
const InventorySalesTab = dynamic(() => import("./InventorySalesTab"), { loading: tabLoading });
const CustomerOrderTab  = dynamic(() => import("./CustomerOrderTab"),  { loading: tabLoading });
const MarketingTab      = dynamic(() => import("./MarketingTab"),      { loading: tabLoading });
const ExpenseTab        = dynamic(() => import("./ExpenseTab"),        { loading: tabLoading });
const BusinessTab       = dynamic(() => import("./BusinessTab"),       { loading: tabLoading });

// Fix 34–40: the analytics dashboard is now a tabbed suite. Settings sits
// first (right after the original overview) since every other tab depends
// on the dependency values entered there — the same order recommended in
// STATUS.md.
const TABS = [
  { id: "dashboard", label: "Overview",              icon: FaThLarge,       Comp: DashboardTab },
  { id: "settings",  label: "Settings",               icon: FaCog,           Comp: SettingsTab },
  { id: "financial", label: "Financial & Growth",     icon: FaMoneyBillWave, Comp: FinancialTab },
  { id: "invsales",  label: "Inventory & Sales",      icon: FaWarehouse,     Comp: InventorySalesTab },
  { id: "custorder", label: "Customer & Order",       icon: FaUsers,         Comp: CustomerOrderTab },
  { id: "marketing", label: "Marketing & Website",    icon: FaBullhorn,      Comp: MarketingTab },
  { id: "expense",   label: "Expense Analysis",       icon: FaReceipt,       Comp: ExpenseTab },
  { id: "business",  label: "Business Analysis",      icon: FaChartLine,     Comp: BusinessTab },
];

export default function AnalyticsPage() {
  const [active, setActive] = useState("dashboard");
  const ActiveComp = TABS.find((t) => t.id === active)?.Comp || DashboardTab;

  return (
    <div>
      <h1 className="section-heading text-2xl mb-1">Analytics</h1>
      <p className="text-sm text-theme-muted mb-6">
        Start in Settings if metrics elsewhere say a value is missing — everything downstream reads from there.
      </p>

      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1 border-b border-theme">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0 ${
              active === id
                ? "border-theme-primary text-theme-primary"
                : "border-transparent text-theme-muted hover:text-theme"
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      <ActiveComp />
    </div>
  );
}
