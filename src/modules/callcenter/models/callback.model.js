import mongoose from "mongoose";

// A scheduled "call this customer back later" reminder — distinct from
// QueueEntry (a caller waiting live right now). Powers the "Callback
// reminder" notification and the agent dashboard's Callbacks list.
const callbackSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.ObjectId, ref: "user", default: null },
    customerName: { type: String, default: "" },
    customerPhone: { type: String, required: true },
    orderId: { type: mongoose.Schema.ObjectId, ref: "order", default: null },
    agentId: { type: mongoose.Schema.ObjectId, ref: "employee", required: true, index: true },
    scheduledFor: { type: Date, required: true, index: true },
    status: { type: String, enum: ["pending", "completed", "missed", "cancelled"], default: "pending", index: true },
    note: { type: String, default: "" },
    completedAt: { type: Date, default: null },
    relatedCallLogId: { type: mongoose.Schema.ObjectId, ref: "callLog", default: null }, // the call that resulted from this callback, once made
  },
  { timestamps: true }
);

callbackSchema.index({ agentId: 1, status: 1, scheduledFor: 1 });

const CallbackModel = mongoose.models.callback || mongoose.model("callback", callbackSchema);
export default CallbackModel;
