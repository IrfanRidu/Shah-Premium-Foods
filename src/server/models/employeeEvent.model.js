import mongoose from "mongoose";

// Advanced HRMS Features spec: the Employee File needs "Performance
// Reviews, Warnings, Promotions, Training Records." Four near-identical
// shapes (date + title + note + who logged it) — one model with a
// `type` discriminator rather than four nearly-duplicate collections,
// decided at build time per PROGRESS_TRACKER.md's own note not to
// over-design this ahead of actually needing it. Leave History and
// Audit History (also listed in the same spec section) are deliberately
// NOT modeled here — see the Employee File UI's own inline notes for
// why (no dedicated leave-approval workflow or field-level change log
// exists yet; folding them into this shape would misrepresent both as
// more built than they are).
const employeeEventSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.ObjectId, ref: "employee", required: true },
    type: { type: String, enum: ["performance_review", "warning", "promotion", "training"], required: true },
    date: { type: Date, default: Date.now },
    title: { type: String, required: true, trim: true }, // e.g. "Q2 2026 Review", "Late attendance", "Promoted to Senior Lead", "Fire Safety Training"
    note: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.ObjectId, ref: "user", default: null },
  },
  { timestamps: true }
);
employeeEventSchema.index({ employeeId: 1, type: 1, date: -1 });

const EmployeeEventModel = mongoose.models.employeeEvent || mongoose.model("employeeEvent", employeeEventSchema);
export default EmployeeEventModel;
