import mongoose from "mongoose";

// Full history of every order↔agent assignment — never deleted or
// overwritten (spec: "Assignment history", "Never permanently overwrite
// important data"). order.assignedAgent always mirrors the most recent
// `status:"active"` row here for fast reads; this collection is the
// source of truth for history and for computing round-robin workload.
const assignmentSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.ObjectId, ref: "order", required: true, index: true },
    agentId: { type: mongoose.Schema.ObjectId, ref: "employee", required: true, index: true },
    assignedBy: { type: mongoose.Schema.ObjectId, ref: "user", default: null }, // null = system/round-robin
    method: {
      type: String,
      enum: ["round_robin", "manual", "reassignment", "abandoned_reassign"],
      default: "round_robin",
    },
    status: { type: String, enum: ["active", "reassigned", "completed"], default: "active", index: true },
    assignedAt: { type: Date, default: Date.now },
    unassignedAt: { type: Date, default: null },
    reason: { type: String, default: "" },
  },
  { timestamps: true }
);

assignmentSchema.index({ orderId: 1, assignedAt: -1 });
assignmentSchema.index({ agentId: 1, status: 1 });

const AssignmentModel = mongoose.models.assignment || mongoose.model("assignment", assignmentSchema);
export default AssignmentModel;
