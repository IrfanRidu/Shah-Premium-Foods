"use client";
import { useEffect, useState } from "react";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError } from "@/lib/utils";
import toast from "react-hot-toast";
import { LoadingBlock } from "./shared";

const EXPENSE_FIELDS = [
  ["transportationCost", "Transportation Cost"],
  ["packagingCost", "Packaging Cost"],
  ["paymentGatewayCharges", "Payment Gateway Charges"],
  ["marketingCost", "Marketing Cost"],
  ["salaryExpense", "Salary Expense"],
  ["rent", "Rent"],
  ["warehouseCost", "Warehouse Cost"],
  ["softwareSubscription", "Software Subscription"],
  ["utilities", "Utilities"],
  ["officeExpenses", "Office Expenses"],
  ["bankCharges", "Bank Charges"],
  ["tax", "Tax"],
  ["interestExpense", "Interest Expense"],
  ["miscellaneousExpenses", "Miscellaneous Expenses"],
];

const BALANCE_FIELDS = [
  ["investment", "Investment"],
  ["equity", "Equity"],
  ["cashBalance", "Cash Balance"],
  ["bankBalance", "Bank Balance"],
  ["assets", "Assets"],
  ["liabilities", "Liabilities"],
];

const MARKETING_FIELDS = [
  ["adSpend", "Ad Spend"],
  ["adClicks", "Ad Clicks"],
  ["adRevenue", "Revenue from Ads"],
  ["emailsSent", "Emails Sent"],
  ["emailOpens", "Email Opens"],
  ["emailClicks", "Email Clicks"],
];

function NumField({ label, value, onChange, suffix }) {
  return (
    <div>
      <label className="block text-xs font-medium text-theme-muted mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          placeholder="Not set"
          className={`input-field py-1.5 text-sm ${suffix ? "input-field-suffixed" : ""}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-theme-muted font-medium pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export default function SettingsTab() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const r = await Axios({ ...api.getAnalyticsSettings });
      if (r.data?.success) setSettings(r.data.data);
    } catch (err) { axiosToastError(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const set = (path, val) => {
    setSettings((s) => {
      const next = { ...s };
      if (path[0] === "monthlyExpenses") {
        next.monthlyExpenses = { ...next.monthlyExpenses, [path[1]]: val };
      } else {
        next[path[0]] = val;
      }
      return next;
    });
  };

  const save = async () => {
    try {
      setSaving(true);
      const r = await Axios({ ...api.updateAnalyticsSettings, data: settings });
      if (r.data?.success) {
        toast.success("Analytics settings saved");
        setSettings(r.data.data);
      }
    } catch (err) { axiosToastError(err); }
    finally { setSaving(false); }
  };

  if (loading || !settings) return <LoadingBlock />;

  const filledCount = EXPENSE_FIELDS.filter(([k]) => settings.monthlyExpenses?.[k] !== null && settings.monthlyExpenses?.[k] !== undefined).length;

  return (
    <div className="max-w-4xl">
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800">
        <p>
          These are the dependency / key values every other analytics tab's formulas rely on. Leave anything
          blank if you don't have it yet — every metric that needs it will clearly say what's missing instead
          of showing a wrong number.
        </p>
      </div>

      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold">Monthly Expenses</h2>
          <span className="text-xs text-theme-muted">{filledCount} of {EXPENSE_FIELDS.length} entered</span>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {EXPENSE_FIELDS.map(([key, label]) => (
            <NumField key={key} label={label} value={settings.monthlyExpenses?.[key]}
              onChange={(v) => set(["monthlyExpenses", key], v)} suffix="/mo" />
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 mb-5">
        <h2 className="font-display text-lg font-semibold mb-4">Balance Sheet Figures</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {BALANCE_FIELDS.map(([key, label]) => (
            <NumField key={key} label={label} value={settings[key]} onChange={(v) => set([key], v)} />
          ))}
          <NumField label="Sales Tax Rate" value={settings.salesTaxRate} onChange={(v) => set(["salesTaxRate"], v)} suffix="%" />
          <NumField label="Depreciation & Amortization" value={settings.depreciationAmortization} onChange={(v) => set(["depreciationAmortization"], v)} suffix="/mo" />
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 mb-5">
        <h2 className="font-display text-lg font-semibold mb-1">Marketing Inputs</h2>
        <p className="text-xs text-theme-muted mb-4">Figures your ad platforms / email tool report — not tracked automatically by this site.</p>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {MARKETING_FIELDS.map(([key, label]) => (
            <NumField key={key} label={label} value={settings[key]} onChange={(v) => set([key], v)} />
          ))}
        </div>
      </div>

      <button onClick={save} disabled={saving} className="btn-primary px-8 py-2.5 disabled:opacity-60">
        {saving ? "Saving…" : "Save Settings"}
      </button>
    </div>
  );
}
