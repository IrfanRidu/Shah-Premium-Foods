import mongoose from "mongoose";

// A caller currently on hold, waiting for the next available agent.
// Short-lived by nature (entries move to "connected"/"abandoned" within
// minutes), but never hard-deleted — kept for queue-wait-time reporting.
const queueEntrySchema = new mongoose.Schema(
  {
    callLogId: { type: mongoose.Schema.ObjectId, ref: "callLog", required: true },
    customerPhone: { type: String, required: true },
    status: { type: String, enum: ["waiting", "connected", "abandoned"], default: "waiting", index: true },
    enteredAt: { type: Date, default: Date.now },
    connectedAgentId: { type: mongoose.Schema.ObjectId, ref: "employee", default: null },
    connectedAt: { type: Date, default: null },
    abandonedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

queueEntrySchema.index({ status: 1, enteredAt: 1 });

const QueueEntryModel = mongoose.models.queueEntry || mongoose.model("queueEntry", queueEntrySchema);
export default QueueEntryModel;
