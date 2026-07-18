// Fix 34: Shared helpers used by every analytics tab controller.
//
// Design: every metric that depends on an admin-entered "dependency / key value"
// (from AnalyticsSettings) must never crash or silently show 0/wrong data when
// that value hasn't been set. Instead it returns { value: null, missing: ["Investment"] }
// so the frontend can render "Enter Investment in Analytics → Settings" instead of a number.

export const round2 = (n) => Math.round((n || 0) * 100) / 100;

// pctChange handles the "divide by zero" edge case from Fix 35:
// if prev is 0 and curr > 0 → "New" (100%+ growth, undefined mathematically)
// if prev is 0 and curr is 0 → 0% (no change, both empty)
export const pctChange = (curr, prev) => {
  if (prev === 0 || prev === null || prev === undefined) {
    return curr > 0 ? { value: 100, isNew: true } : { value: 0, isNew: false };
  }
  return { value: Math.round(((curr - prev) / prev) * 1000) / 10, isNew: false };
};

// Wraps a metric that depends on one or more AnalyticsSettings fields.
// `deps` is an object of { label: rawValue } — if ANY rawValue is null/undefined,
// the metric is flagged missing and `compute` is never even called.
export function dependentMetric(deps, compute) {
  const missing = Object.entries(deps)
    .filter(([, v]) => v === null || v === undefined)
    .map(([label]) => label);
  if (missing.length > 0) {
    return { value: null, missing, ok: false };
  }
  return { value: compute(), missing: [], ok: true };
}

// Sum all monthly expense fields that ARE set; track which are missing so the
// UI can show "12 of 14 expense categories entered" instead of a silent partial total.
export function sumMonthlyExpenses(monthlyExpenses = {}) {
  const LABELS = {
    transportationCost: "Transportation Cost",
    packagingCost: "Packaging Cost",
    paymentGatewayCharges: "Payment Gateway Charges",
    marketingCost: "Marketing Cost",
    salaryExpense: "Salary Expense",
    rent: "Rent",
    warehouseCost: "Warehouse Cost",
    softwareSubscription: "Software Subscription",
    utilities: "Utilities",
    officeExpenses: "Office Expenses",
    bankCharges: "Bank Charges",
    tax: "Tax",
    interestExpense: "Interest Expense",
    miscellaneousExpenses: "Miscellaneous Expenses",
  };
  let total = 0;
  const missing = [];
  const breakdown = {};
  for (const [key, label] of Object.entries(LABELS)) {
    const v = monthlyExpenses?.[key];
    if (v === null || v === undefined) {
      missing.push(label);
      breakdown[key] = { label, value: null };
    } else {
      total += v;
      breakdown[key] = { label, value: v };
    }
  }
  return { total, missing, breakdown, allSet: missing.length === 0 };
}
