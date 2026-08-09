import EmployeeModel from "../../../server/models/employee.model.js";
import AgentStatusModel from "../models/agentStatus.model.js";

const VALID_STATUSES = ["available", "busy", "on_call", "ringing", "away", "break", "offline"];

// The socket only ever knows a userId (from the JWT) — every AgentStatus
// row is keyed by agentId (Employee._id), same identity convention as
// CallLog. This is the one place that bridges the two, so callers never
// have to.
//
// IMPORTANT — this function is reachable from TWO very different
// contexts: socketServer.js (loaded only by the plain-Node server.js)
// AND updateMyAgentStatusController (a real Next.js API route, which
// Next's OWN webpack build processes normally). It must therefore NEVER
// reference telephony/ariClient.js, not even via a dynamic import —
// webpack statically analyzes dynamic imports too, for code-splitting,
// and pulled ari-client's entire dependency tree (including ws's
// optional native bufferutil/utf-8-validate addons, which most installs
// don't have) into the ordinary app build the moment this function did
// that, breaking `next dev`/`next build` for everyone, not just
// telephony users. The "connect the oldest queued waiter via a real
// Asterisk bridge" side effect now lives ONLY in socketServer.js's own
// status-update handler (see that file), which is never processed by
// Next's webpack at all — this function just updates the status.
export async function setAgentStatusByUserId(userId, status, socketId = null) {
  if (!VALID_STATUSES.includes(status)) throw new Error(`Invalid status "${status}"`);

  const employee = await EmployeeModel.findOne({ userId, isCallCenterAgent: true }).select("_id name");
  if (!employee) throw new Error("This account is not a call center agent");

  const updated = await AgentStatusModel.findOneAndUpdate(
    { agentId: employee._id },
    { status, socketId, lastChangedAt: new Date() },
    { new: true, upsert: true }
  ).populate("agentId", "name userId sipUsername");

  return updated;
}

export async function getAgentStatusByUserId(userId) {
  const employee = await EmployeeModel.findOne({ userId, isCallCenterAgent: true }).select("_id");
  if (!employee) return null;
  return AgentStatusModel.findOne({ agentId: employee._id }).populate("agentId", "name");
}

export async function getAllAgentStatuses() {
  return AgentStatusModel.find({}).populate("agentId", "name email").populate("currentCallId");
}
