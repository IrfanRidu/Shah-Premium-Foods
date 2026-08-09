import mongoose from "mongoose";

// One document per call center agent, holding their LIVE presence state.
// "Agent" identity = Employee._id throughout this module (matches the
// existing callLog.model.js convention: agentId refs "employee", not
// "user" — an agent's login can change without losing their HR/agent
// identity, and callCenterAgent.controller.js already resolves this way).
const agentStatusSchema = new mongoose.Schema(
  {
    agentId: { type: mongoose.Schema.ObjectId, ref: "employee", required: true, unique: true },
    status: {
      type: String,
      enum: ["available", "busy", "on_call", "ringing", "away", "break", "offline"],
      default: "offline",
      index: true,
    },
    lastChangedAt: { type: Date, default: Date.now },
    currentCallId: { type: mongoose.Schema.ObjectId, ref: "callLog", default: null },
    // Which browser tab/socket this agent is connected on right now, so a
    // stale duplicate tab can't fight the real one for incoming-call offers.
    socketId: { type: String, default: null },
    sipRegistered: { type: Boolean, default: false },
  },
  { timestamps: true }
);

agentStatusSchema.index({ status: 1, lastChangedAt: 1 });

const AgentStatusModel = mongoose.models.agentStatus || mongoose.model("agentStatus", agentStatusSchema);
export default AgentStatusModel;
