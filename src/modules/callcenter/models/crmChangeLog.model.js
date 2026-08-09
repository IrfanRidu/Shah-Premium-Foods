import mongoose from "mongoose";

// Field-level before/after change tracking with one-click undo, for the
// CRM's "Undo System" requirement (order status updates, customer notes,
// assignment changes, customer edits, follow-up updates).
//
// This is DELIBERATELY a separate collection from the pre-existing
// `auditLog` model (src/server/models/auditLog.model.js). That one is a
// generic per-REQUEST security/compliance trail — method/path/status/
// redacted body — auto-expiring after 365 days via a TTL index. It has
// no clean "field X changed from A to B" shape to revert from, and its
// retention policy is intentionally NOT "never delete." Repurposing it
// would mean either breaking its existing security-log behavior or
// building undo on a shape that doesn't fit. This collection has NO TTL
// — CRM change history is never auto-deleted, per spec.
const crmChangeLogSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ["order", "callLog", "callback", "assignment", "user"],
      required: true,
      index: true,
    },
    entityId: { type: mongoose.Schema.ObjectId, required: true, index: true },
    action: {
      type: String,
      enum: ["status_change", "note_add", "assign", "reassign", "follow_up_update", "field_update"],
      required: true,
    },
    field: { type: String, default: "" }, // dot-path if nested, e.g. "followUp.date"
    previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    performedBy: { type: mongoose.Schema.ObjectId, ref: "user", required: true },
    isUndone: { type: Boolean, default: false, index: true },
    undoneBy: { type: mongoose.Schema.ObjectId, ref: "user", default: null },
    undoneAt: { type: Date, default: null },
  },
  { timestamps: true }
);

crmChangeLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

const CrmChangeLogModel = mongoose.models.crmChangeLog || mongoose.model("crmChangeLog", crmChangeLogSchema);
export default CrmChangeLogModel;
