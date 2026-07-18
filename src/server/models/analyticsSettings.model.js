import mongoose from "mongoose";

// Fix 34: Every "Dependency / Key Value" the analytics dashboard's formulas need.
// If a field is left null/undefined, it means "admin hasn't set this yet" — the
// analytics controller must detect that and return a friendly "missing value" flag
// for any metric that depends on it, rather than silently computing with 0 or crashing.

const expenseFieldSchema = {
  transportationCost:      { type: Number, default: null },
  packagingCost:           { type: Number, default: null },
  paymentGatewayCharges:   { type: Number, default: null },
  marketingCost:           { type: Number, default: null },
  salaryExpense:           { type: Number, default: null },
  rent:                    { type: Number, default: null },
  warehouseCost:           { type: Number, default: null },
  softwareSubscription:    { type: Number, default: null },
  utilities:               { type: Number, default: null },
  officeExpenses:          { type: Number, default: null },
  bankCharges:             { type: Number, default: null },
  tax:                     { type: Number, default: null },
  interestExpense:         { type: Number, default: null },
  miscellaneousExpenses:   { type: Number, default: null },
};

const analyticsSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "main", unique: true },

    // Monthly recurring expenses (admin enters a monthly figure for each — Fix 34 / 39)
    monthlyExpenses: expenseFieldSchema,

    // Balance-sheet style figures (Fix 34 / 35 ROI/ROE/ROA)
    investment:   { type: Number, default: null },
    equity:       { type: Number, default: null },
    cashBalance:  { type: Number, default: null },
    bankBalance:  { type: Number, default: null },
    assets:       { type: Number, default: null },
    liabilities:  { type: Number, default: null },

    // Marketing / traffic inputs that can't be derived from orders alone (Fix 38)
    adSpend:              { type: Number, default: null },
    adClicks:              { type: Number, default: null },
    adRevenue:              { type: Number, default: null },
    emailsSent:             { type: Number, default: null },
    emailOpens:              { type: Number, default: null },
    emailClicks:              { type: Number, default: null },

    // Sales tax rate (%) applied to gross revenue to estimate "Tax Collected" (Fix 35)
    salesTaxRate: { type: Number, default: null },
    // Depreciation & Amortization — optional add-back for EBITDA (Fix 35)
    depreciationAmortization: { type: Number, default: null },

    // Fix 40: Business Analysis tab — per-metric on/off toggles.
    // Keyed by metric id (see analyticsMetricRegistry on the frontend) → boolean.
    enabledMetrics: {
      type: Map,
      of: Boolean,
      default: {},
    },
  },
  { timestamps: true }
);

const AnalyticsSettingsModel =
  mongoose.models.analyticsSettings || mongoose.model("analyticsSettings", analyticsSettingsSchema);

export default AnalyticsSettingsModel;
