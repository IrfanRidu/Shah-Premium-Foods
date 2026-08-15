import mongoose from "mongoose";

// Advanced HRMS Features spec: "The payroll system must support
// configurable tax rules... Tax rules should be configurable by Super
// Admin so they can adapt to local laws without modifying code." A fixed
// schema with named fields (taxPercent, pfPercent, ...) would fail that
// requirement the moment a jurisdiction needs a rule shape this doesn't
// have — instead, an ordered array of named rules Super Admin can add/
// edit/remove/toggle freely, each independently configurable. Singleton
// document pattern (always _id: "singleton"), same precedent as
// src/modules/callcenter/models/crmSettings.model.js.
const payrollRuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // "Income Tax", "Provident Fund", "Pension", "Social Security", "Health Insurance", ...
    type: { type: String, enum: ["percentage", "fixed"], default: "percentage" },
    value: { type: Number, default: 0, min: 0 }, // percent (e.g. 10 = 10%) or a flat currency amount, depending on `type`
    // What a percentage rule is calculated against. "basic" = Basic
    // Salary only; "gross" = Basic + Overtime + Bonus + Allowances.
    // Ignored for `type:"fixed"` rules.
    appliesTo: { type: String, enum: ["basic", "gross"], default: "basic" },
    // Spec explicitly separates "Tax Deduction" from "Other Deductions"
    // as distinct payslip line items — this is what sorts each rule's
    // computed amount into the right bucket at calculation time.
    category: { type: String, enum: ["tax", "other"], default: "other" },
    enabled: { type: Boolean, default: true },
  },
  { _id: true, timestamps: false }
);

const payrollConfigSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "singleton" },
    rules: { type: [payrollRuleSchema], default: [] },
    updatedBy: { type: mongoose.Schema.ObjectId, ref: "user", default: null },
  },
  { timestamps: true }
);

const PayrollConfigModel = mongoose.models.payrollConfig || mongoose.model("payrollConfig", payrollConfigSchema);
export default PayrollConfigModel;
