import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["new_order", "new_ticket", "system"],
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
    relatedId: { type: mongoose.Schema.ObjectId, default: null }, // order/ticket _id, for reference
    // Read state is tracked per-user (an order notification is "unread" for
    // an agent who hasn't opened it yet, even after another agent has).
    readBy: [{ type: mongoose.Schema.ObjectId, ref: "user" }],
  },
  { timestamps: true }
);

notificationSchema.index({ createdAt: -1 });

const NotificationModel = mongoose.models.notification || mongoose.model("notification", notificationSchema);
export default NotificationModel;
