"use client";
import { useState } from "react";
import {
  FaChartLine, FaCog, FaMoneyBillWave, FaWarehouse, FaUsers,
  FaBullhorn, FaReceipt, FaThLarge,
} from "react-icons/fa";
import DashboardTab from "./DashboardTab";
import SettingsTab from "./SettingsTab";
import FinancialTab from "./FinancialTab";
import InventorySalesTab from "./InventorySalesTab";
import CustomerOrderTab from "./CustomerOrderTab";
import MarketingTab from "./MarketingTab";
import ExpenseTab from "./ExpenseTab";
import BusinessTab from "./BusinessTab";

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
