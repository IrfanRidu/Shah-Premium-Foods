import mongoose from "mongoose";

const callLogSchema = new mongoose.Schema(
  {
    agentId: { type: mongoose.Schema.ObjectId, ref: "employee", required: true },
    orderId: { type: mongoose.Schema.ObjectId, ref: "order", default: null },
    // Resolved registered account for the caller/callee when known (optional
    // — customerName/customerPhone below remain the primary snapshot fields,
    // same "snapshot is king" pattern order.model.js already uses).
    customerId: { type: mongoose.Schema.ObjectId, ref: "user", default: null },
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

    // --- Call Center CRM module additions (Session 2) — additive only,
    // every field above still works exactly as before for a plain tel:
    // link call, where these all stay at their defaults. ---
    direction: { type: String, enum: ["inbound", "outbound"], default: "outbound" },
    // Real-time lifecycle for a browser-mediated (SIP/WebRTC) call. null =
    // this call never went through the real-time path (legacy tel: flow).
    status: {
      type: String,
      enum: ["ringing", "answered", "missed", "rejected", "transferred", "completed", "queued", "abandoned", null],
      default: null,
    },
    answeredAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    queueWaitSeconds: { type: Number, default: 0 },
    asteriskChannelId: { type: String, default: null, index: true },
    asteriskUniqueId: { type: String, default: null },
    recording: { type: mongoose.Schema.ObjectId, ref: "callRecording", default: null },
    transferredFrom: { type: mongoose.Schema.ObjectId, ref: "employee", default: null },
    transferredTo: { type: mongoose.Schema.ObjectId, ref: "employee", default: null },
    // Running note thread for the new flow (multiple notes over time, each
    // attributed) — deliberately separate from the single legacy `note`
    // field above so old callers/readers of `note` are unaffected.
    notes: {
      type: [
        {
          text: { type: String, required: true },
          addedBy: { type: mongoose.Schema.ObjectId, ref: "employee" },
          addedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

callLogSchema.index({ agentId: 1, createdAt: -1 });
callLogSchema.index({ status: 1, createdAt: -1 });
callLogSchema.index({ customerPhone: 1, createdAt: -1 });

const CallLogModel = mongoose.models.callLog || mongoose.model("callLog", callLogSchema);
export default CallLogModel;
