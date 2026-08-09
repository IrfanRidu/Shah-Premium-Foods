import EmployeeModel from "../../../server/models/employee.model.js";
import OrderModel from "../../../server/models/order.model.js";
import AssignmentModel from "../models/assignment.model.js";
import { createNotification } from "../../../server/controllers/notification.controller.js";
import { logChange } from "./crmChangeLogService.js";
import { emitToUser } from "../socket/socketServer.js";

// "Active call center agent" — same definition callCenterAgent.controller.js
// already uses (isCallCenterAgent flag + Employee.status, the HR status,
// not the login's own Active/Suspended status).
export async function getActiveAgents() {
  return EmployeeModel.find({ isCallCenterAgent: true, status: "Active" }).select("_id name userId");
}

// Picks whichever active agent currently has the FEWEST active
// assignments (not a simple rotating pointer) — this stays correct even
// if agents come and go, and self-corrects if one agent falls behind
// (e.g. after being on Break for a while), which a naive round-robin
// index would not.
async function pickLeastLoadedAgent(agents) {
  const counts = await AssignmentModel.aggregate([
    { $match: { status: "active", agentId: { $in: agents.map((a) => a._id) } } },
    { $group: { _id: "$agentId", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(agents.map((a) => [String(a._id), 0]));
  counts.forEach((c) => countMap.set(String(c._id), c.count));

  let chosen = agents[0];
  let min = Infinity;
  for (const a of agents) {
    const c = countMap.get(String(a._id));
    if (c < min) { min = c; chosen = a; }
  }
  return chosen;
}

// Assigns one order to whichever active agent has the lightest current
// load. Returns null (does nothing) if there are no active agents right
// now — the order simply stays unassigned until one comes online; call
// reassignAbandonedOrders() later to sweep those up, or assign manually.
export async function assignOrderRoundRobin(order, { assignedBy = null, method = "round_robin", reason = "" } = {}) {
  const agents = await getActiveAgents();
  if (!agents.length) return null;

  const chosen = await pickLeastLoadedAgent(agents);
  return applyAssignment(order, chosen._id, { assignedBy, method, reason });
}

// Shared by round-robin and manual reassignment: closes out any current
// active Assignment row, opens a new one, updates the order's mirror
// fields, and notifies the newly-assigned agent.
async function applyAssignment(order, newAgentId, { assignedBy, method, reason }) {
  await AssignmentModel.updateMany(
    { orderId: order._id, status: "active" },
    { status: "reassigned", unassignedAt: new Date() }
  );

  const assignment = await AssignmentModel.create({
    orderId: order._id, agentId: newAgentId, assignedBy, method, reason,
  });

  const previousAgent = order.assignedAgent;
  order.assignedAgent = newAgentId;
  order.assignedAt = new Date();
  try {
    await order.save();
  } catch (err) {
    // optimisticConcurrency guard (order.model.js) — someone else saved
    // this order in between our read and write. Reload and retry once
    // rather than silently losing the assignment or crashing the caller.
    if (err.name !== "VersionError") throw err;
    const fresh = await OrderModel.findById(order._id);
    fresh.assignedAgent = newAgentId;
    fresh.assignedAt = new Date();
    await fresh.save();
  }

  if (previousAgent) {
    await logChange({
      entityType: "order", entityId: order._id, action: method === "manual" || method === "reassignment" ? "reassign" : "assign",
      field: "assignedAgent", previousValue: previousAgent, newValue: newAgentId,
      performedBy: assignedBy,
    });
  } else {
    await logChange({
      entityType: "order", entityId: order._id, action: "assign",
      field: "assignedAgent", previousValue: null, newValue: newAgentId,
      performedBy: assignedBy,
    });
  }

  const agent = await EmployeeModel.findById(newAgentId).select("userId");
  if (agent?.userId) {
    await createNotification({
      type: "order_assigned",
      title: "New order assigned",
      message: `Order ${order.orderId} has been assigned to you.`,
      targetModule: "customerCare",
      targetUserId: agent.userId,
      relatedId: order._id,
    });
    emitToUser(String(agent.userId), "order:assigned", { orderId: order._id, agentId: newAgentId });
  }

  return assignment;
}

// Super Admin manual reassignment (spec: "Manual reassignment").
export async function reassignOrder(order, newAgentId, { assignedBy, reason = "" } = {}) {
  return applyAssignment(order, newAgentId, { assignedBy, method: "manual", reason: reason || "Manually reassigned by super admin" });
}

// Sweeps orders that were auto-assigned but have sat untouched (no
// status change since assignment) past a threshold, and hands them to
// whichever agent is least loaded right now (spec: "Auto reassign
// abandoned orders"). Intended to be called on an interval from
// server.js (Phase 4), since this is now a persistent Node process.
export async function reassignAbandonedOrders({ olderThanMinutes = 60 } = {}) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60000);
  const stale = await AssignmentModel.find({ status: "active", assignedAt: { $lt: cutoff } }).populate("orderId");
  const results = [];
  for (const a of stale) {
    const order = a.orderId;
    if (!order || order.order_status !== "Pending") continue; // already moved on, nothing to abandon
    const result = await assignOrderRoundRobin(order, { method: "abandoned_reassign", reason: `No activity for ${olderThanMinutes}+ minutes` });
    if (result) results.push(result);
  }
  return results;
}

// Full history for one order (spec: "Assignment History").
export async function getAssignmentHistory(orderId) {
  return AssignmentModel.find({ orderId }).sort({ assignedAt: -1 }).populate("agentId", "name").populate("assignedBy", "name email");
}
