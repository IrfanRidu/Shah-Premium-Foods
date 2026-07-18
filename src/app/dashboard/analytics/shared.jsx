"use client";
import { FaExclamationTriangle } from "react-icons/fa";

// A metric value can be:
//  - a plain number/string
//  - a pctChange() result: { value, isNew }
//  - a dependentMetric() result: { value: null, missing: [...] } when an
//    admin-entered dependency hasn't been set yet (Fix 34's core requirement)
export function isMissing(v) {
  return v && typeof v === "object" && v.value === null && Array.isArray(v.missing);
}
export function unwrap(v) {
  if (v && typeof v === "object" && "value" in v) return v.value;
  return v;
}

// Generic metric tile. Pass `format` to control how a resolved numeric
// value is displayed (currency, percent, plain number, duration...).
export function MetricCard({ label, value, format = "number", sub, color = "text-theme-primary", currency, rates, displayPrice }) {
  if (isMissing(value)) {
    return (
      <div className="bg-[var(--color-surface)] border border-dashed border-amber-300 rounded-2xl p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-theme-muted mb-1">{label}</p>
        <div className="flex items-start gap-2 text-amber-600">
          <FaExclamationTriangle className="shrink-0 mt-0.5" size={13} />
          <p className="text-xs leading-relaxed">
            Enter <strong>{value.missing.join(", ")}</strong> in the Settings tab to calculate this.
          </p>
        </div>
      </div>
    );
  }

  let resolved = value;
  let changeBadge = null;
  // Fix 2: unwrap ANY object carrying a `.value` — not just ones with an
  // `isNew` key. A dependentMetric() result whose dependencies ARE all set
  // still comes back as `{ value: 23.5, missing: [] }` (missing is just
  // empty, not absent) — that has no `isNew` key at all, so it was falling
  // through unwrapped and getting stringified as "[object Object]%".
  // isNew is now treated as a separate, optional signal purely for whether
  // to render the ▲/▼ growth badge, independent of the unwrap itself.
  if (value && typeof value === "object" && "value" in value) {
    resolved = value.value;
    if ("isNew" in value) {
      changeBadge = value.isNew ? "New" : `${value.value >= 0 ? "▲" : "▼"} ${Math.abs(value.value)}%`;
    }
  }

  let display = resolved;
  if (resolved === null || resolved === undefined) display = "—";
  else if (format === "currency" && displayPrice) display = displayPrice(resolved, currency, rates);
  else if (format === "percent") display = `${resolved}%`;
  else if (format === "duration") {
    const mins = Math.floor(resolved / 60), secs = resolved % 60;
    display = `${mins}m ${secs}s`;
  } else if (typeof resolved === "number") display = resolved.toLocaleString();

  return (
    <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-theme-muted mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{display}</p>
      {sub && <p className="text-xs text-theme-muted mt-0.5">{sub}</p>}
      {changeBadge && (
        <p className={`text-xs font-semibold mt-1 ${changeBadge.startsWith("▼") ? "text-red-500" : "text-green-600"}`}>
          {changeBadge} {value.isNew ? "" : "vs prev period"}
        </p>
      )}
    </div>
  );
}

export function TabSection({ title, children, subtitle }) {
  return (
    <div className="mb-8">
      <div className="mb-3">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-theme-muted">{subtitle}</p>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {children}
      </div>
    </div>
  );
}

export function DateRangePicker({ from, to, setFrom, setTo }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-field py-1.5 text-sm w-auto" />
      <span className="text-theme-muted text-sm">to</span>
      <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-field py-1.5 text-sm w-auto" />
    </div>
  );
}

export function LoadingBlock() {
  return <div className="text-center py-20 text-theme-muted">Loading…</div>;
}

export function MissingBanner({ missing }) {
  if (!missing || missing.length === 0) return null;
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 text-xs text-amber-700">
      <FaExclamationTriangle className="shrink-0 mt-0.5" size={12} />
      <p>Some figures on this tab are hidden until you enter: <strong>{missing.join(", ")}</strong> in the Settings tab.</p>
    </div>
  );
}
