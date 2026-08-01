import mongoose from "mongoose";

// Section 13 (Admin Panel Security) — persisted counterpart to the
// Winston audit logger (lib/logger.js / apiObservability.js's
// logAuditEvent). That one is for log-aggregator/ops visibility
// (console always, rotating files when self-hosted); this is for an
// actual in-app, queryable, filterable dashboard viewer
// (dashboard/audit-log) — a different consumer with different needs
// (paginate by user, date range, action), which a log FILE can't do but
// a database collection can. Both get written from the same call in
// logAuditEvent — see that function for why a persistence failure here
// never blocks or fails the actual request that triggered it.
const auditLogSchema = new mongoose.Schema(
  {
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: "user", index: true },
    userRole: { type: String, index: true },
    method:   { type: String, required: true },
    path:     { type: String, required: true, index: true },
    status:   { type: Number, required: true },
    // Already redacted (password/token/otp/etc. stripped — see
    // apiObservability.js's redactForLogging) before it ever reaches
    // this model; Mixed since request bodies vary per endpoint.
    body: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: true }
);

// Compound index for the dashboard viewer's default "most recent audit
// entries for this user" query shape.
auditLogSchema.index({ userId: 1, createdAt: -1 });

// TTL index — auto-expires entries after 365 days, matching the Winston
// audit logger's own retention exactly (lib/logger.js) so both halves of
// this feature agree on how long an audit trail is actually kept, rather
// than one silently outliving the other.
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

const AuditLogModel = mongoose.models.auditLog || mongoose.model("auditLog", auditLogSchema);

export default AuditLogModel;
