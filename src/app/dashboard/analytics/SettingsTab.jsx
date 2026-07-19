"use client";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError, displayPriceSimple, convertFromBDT, convertToBDT, CURRENCY_SYMBOLS } from "@/lib/utils";
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

// Item 1: third element flags which marketing inputs are actually monetary —
// ad/email counts (clicks, opens, sent) aren't amounts and shouldn't get a
// currency symbol or conversion preview, only adSpend/adRevenue should.
const MARKETING_FIELDS = [
  ["adSpend", "Ad Spend", true],
  ["adClicks", "Ad Clicks", false],
  ["adRevenue", "Revenue from Ads", true],
  ["emailsSent", "Emails Sent", false],
  ["emailOpens", "Email Opens", false],
  ["emailClicks", "Email Clicks", false],
];

function NumField({ label, value, onChange, suffix, isMonetary, currency, rates }) {
  // Item 1 (round 2): the admin asked for the PRIMARY number shown to
  // change with currency, not just a secondary hint next to a frozen BDT
  // value (that was the first attempt at this). Figures are still stored
  // in BDT underneath (unchanged — same convention as product prices
  // app-wide) but the input itself now displays and accepts values in
  // whatever `currency` currently is, converting on the way in and out via
  // convertFromBDT/convertToBDT. Rounded to 2dp on every conversion so
  // typing never shows floating-point noise (e.g. "100.00000000000001")
  // after a round-trip through the conversion math.
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const hasValue = value !== null && value !== undefined;
  const displayValue = isMonetary && hasValue ? round2(convertFromBDT(value, currency, rates)) : value;
  const symbol = isMonetary ? (CURRENCY_SYMBOLS[currency] || (currency ? currency + " " : "৳")) : null;
  const showBdtNote = isMonetary && hasValue && currency && currency !== "BDT";

  const handleChange = (e) => {
    if (e.target.value === "") { onChange(null); return; }
    const typed = Number(e.target.value);
    onChange(isMonetary ? round2(convertToBDT(typed, currency, rates)) : typed);
  };

  return (
    <div>
      <label className="block text-xs font-medium text-theme-muted mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={displayValue ?? ""}
          onChange={handleChange}
          placeholder="Not set"
          className={`input-field py-1.5 text-sm ${isMonetary ? "pl-10" : ""} ${suffix ? "input-field-suffixed" : ""}`}
        />
        {symbol && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-theme-muted font-medium pointer-events-none">
            {symbol}
          </span>
        )}
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-theme-muted font-medium pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {showBdtNote && (
        <p className="text-xs text-theme-muted mt-1">stored as {displayPriceSimple(value)}</p>
      )}
    </div>
  );
}

export default function SettingsTab() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Item 1 (round 2, then generalized): switched from `baseCurrency` to
  // `selected` on explicit request -- the admin wants amounts here to
  // react to BOTH triggers: (a) the site's base currency changing in Site
  // Settings, AND (b) picking a different currency from the navbar
  // switcher. `selected` already is exactly that union (see
  // currencySlice.js: it tracks baseCurrency automatically, but yields to
  // a personal navbar override once one is set) -- no new state needed,
  // just reading the other field.
  // Update: this was originally a deliberate departure from the other 6
  // analytics tabs, which stayed on `baseCurrency` by original design so
  // business-reporting figures wouldn't move just because an admin
  // happened to be personally browsing the storefront in a different
  // currency. That was later explicitly asked to change too -- all
  // analytics tabs now read `selected`, same as this one, so the whole
  // dashboard is consistent.
  const currency = useSelector((s) => s.currency.selected);
  const rates = useSelector((s) => s.currency.rates);

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
          of showing a wrong number. Monetary figures show a currency symbol and are stored as BDT underneath
          (same as product prices everywhere in the app) — a small note under each one always shows the exact
          BDT figure. Switch currency from the navbar, or change the site's base currency in Site Settings,
          and every amount here updates on its own, right away.
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
              onChange={(v) => set(["monthlyExpenses", key], v)} suffix="/mo"
              isMonetary currency={currency} rates={rates} />
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 mb-5">
        <h2 className="font-display text-lg font-semibold mb-4">Balance Sheet Figures</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {BALANCE_FIELDS.map(([key, label]) => (
            <NumField key={key} label={label} value={settings[key]} onChange={(v) => set([key], v)}
              isMonetary currency={currency} rates={rates} />
          ))}
          <NumField label="Sales Tax Rate" value={settings.salesTaxRate} onChange={(v) => set(["salesTaxRate"], v)} suffix="%" />
          <NumField label="Depreciation & Amortization" value={settings.depreciationAmortization} onChange={(v) => set(["depreciationAmortization"], v)} suffix="/mo"
            isMonetary currency={currency} rates={rates} />
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 mb-5">
        <h2 className="font-display text-lg font-semibold mb-1">Marketing Inputs</h2>
        <p className="text-xs text-theme-muted mb-4">Figures your ad platforms / email tool report — not tracked automatically by this site.</p>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {MARKETING_FIELDS.map(([key, label, monetary]) => (
            <NumField key={key} label={label} value={settings[key]} onChange={(v) => set([key], v)}
              isMonetary={monetary} currency={currency} rates={rates} />
          ))}
        </div>
      </div>

      <button onClick={save} disabled={saving} className="btn-primary px-8 py-2.5 disabled:opacity-60">
        {saving ? "Saving…" : "Save Settings"}
      </button>
    </div>
  );
}
