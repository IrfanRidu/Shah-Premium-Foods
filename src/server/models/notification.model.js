import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "new_order", "new_ticket", "system",
        // Call Center CRM module additions (Session 2):
        "incoming_call", "missed_call", "callback_reminder", "order_assigned", "queue_alert",
      ],
      required: true,
    },
    title:   { type: String, required: true },
    message: { type: String, default: "" },
    link:    { type: String, default: "" }, // where clicking this notification navigates to
    // Fix 4: rather than a per-user recipient list (which would need
    // fan-out writes on every event), a notification declares which
    // permission module its audience needs — anyone with view access to
    // that module (or a super admin) sees it, mirroring the existing
    // permission system instead of building a parallel one.
    targetModule: { type: String, default: "" }, // e.g. "orders", "customerCare" — "" = every admin
    // Session 2 addition: some CRM events are for exactly one agent (their
    // new assignment, their callback reminder), not the whole customerCare
    // audience. When set, this notification is ALSO visible to this one
    // user regardless of their module permissions, in addition to (not
    // instead of) the targetModule broadcast rule above. null preserves
    // the original broadcast-only behavior exactly.
    targetUserId: { type: mongoose.Schema.ObjectId, ref: "user", default: null, index: true },
    relatedId: { type: mongoose.Schema.ObjectId, default: null }, // order/ticket _id, for reference
    // Read state is tracked per-user (an order notification is "unread" for
    // an agent who hasn't opened it yet, even after another agent has).
    readBy: [{ type: mongoose.Schema.ObjectId, ref: "user" }],
  },
  { timestamps: true }
);

// Database security audit (Section 7 — indexes): the actual query pattern
// here filters by `targetModule` (or matches "" = everyone) and sorts by
// `createdAt` — a `createdAt`-only index doesn't help the filter step.
// Kept the standalone `createdAt` index too since the "every admin" case
// (`targetModule: ""`) still needs a plain recency sort.
notificationSchema.index({ targetModule: 1, createdAt: -1 });
notificationSchema.index({ createdAt: -1 });

const NotificationModel = mongoose.models.notification || mongoose.model("notification", notificationSchema);
export default NotificationModel;
