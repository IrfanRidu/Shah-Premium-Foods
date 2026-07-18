import mongoose from "mongoose";

const callLogSchema = new mongoose.Schema(
  {
    agentId: { type: mongoose.Schema.ObjectId, ref: "employee", required: true },
    orderId: { type: mongoose.Schema.ObjectId, ref: "order", default: null },
    customerName:  { type: String, default: "" },
    customerPhone: { type: String, default: "" },
    // Auto-set the instant the agent clicks "Call Customer" — this part is
    // fully automatic and reliable, since it's just a click event.
    initiatedAt: { type: Date, default: Date.now },
    // Everything below can only come from the agent, since a `tel:` link
    // hands the call off to the device's own phone app — the browser gets
    // no event back for answered/duration/outcome. Defaults to "logged"
    // until the agent fills this in.
    outcomeLogged: { type: Boolean, default: false },
    outcome: { type: String, enum: ["Confirmed", "No Answer", "Rescheduled", "Cancelled", "Other"], default: null },
    durationSeconds: { type: Number, default: 0 },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

callLogSchema.index({ agentId: 1, createdAt: -1 });

const CallLogModel = mongoose.models.callLog || mongoose.model("callLog", callLogSchema);
export default CallLogModel;
