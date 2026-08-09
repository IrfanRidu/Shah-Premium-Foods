import QueueEntryModel from "../models/queueEntry.model.js";
import AgentStatusModel from "../models/agentStatus.model.js";
import CallLogModel from "../../../server/models/callLog.model.js";
import { emitToSuperAdmins, emitToAll } from "../socket/socketServer.js";

// Every caller currently on hold, oldest first (spec: "Play hold music.
// Inform them they are waiting... connect the OLDEST waiting customer").
export async function getQueueSnapshot() {
  return QueueEntryModel.find({ status: "waiting" }).sort({ enteredAt: 1 }).populate("callLogId");
}

export async function enqueueCustomer({ callLogId, customerPhone }) {
  const entry = await QueueEntryModel.create({ callLogId, customerPhone, status: "waiting" });
  await CallLogModel.findByIdAndUpdate(callLogId, { status: "queued" });
  const snapshot = await getQueueSnapshot();
  emitToSuperAdmins("queue:alert", { queueLength: snapshot.length, newest: entry });
  emitToAll("queue:updated", { queueLength: snapshot.length });
  return entry;
}

// Finds the single best agent to offer the next call to, right now
// (spec: "Check all online agents. Ignore Busy/Offline/Away/Break. Find
// the first available agent" — "first" = whoever has been Available the
// longest, so the same person isn't always hit first).
export async function findNextAvailableAgent() {
  return AgentStatusModel.findOne({ status: "available" }).sort({ lastChangedAt: 1 }).populate("agentId", "name userId");
}

// Called the moment an agent's status flips to "available" — hands them
// the longest-waiting caller, if there is one (spec: "As soon as an
// agent becomes available: Automatically connect the oldest waiting
// customer"). Returns the QueueEntry that was connected, or null if the
// queue was empty (nothing to do, agent just stays available).
export async function connectOldestWaiterTo(agentId) {
  const oldest = await QueueEntryModel.findOneAndUpdate(
    { status: "waiting" },
    { status: "connected", connectedAgentId: agentId, connectedAt: new Date() },
    { sort: { enteredAt: 1 }, new: true }
  ).populate("callLogId");
  if (oldest) {
    await CallLogModel.findByIdAndUpdate(oldest.callLogId, {
      $set: { queueWaitSeconds: Math.round((oldest.connectedAt - oldest.enteredAt) / 1000) },
    });
    const snapshot = await getQueueSnapshot();
    emitToSuperAdmins("queue:updated", { queueLength: snapshot.length });
    emitToAll("queue:updated", { queueLength: snapshot.length });
  }
  return oldest;
}

export async function markAbandoned(queueEntryId) {
  const entry = await QueueEntryModel.findByIdAndUpdate(
    queueEntryId,
    { status: "abandoned", abandonedAt: new Date() },
    { new: true }
  );
  await CallLogModel.findByIdAndUpdate(entry.callLogId, { status: "abandoned", endedAt: new Date() });
  return entry;
}
