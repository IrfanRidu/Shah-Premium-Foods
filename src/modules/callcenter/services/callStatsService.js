import CallLogModel from "../../../server/models/callLog.model.js";
import OrderModel from "../../../server/models/order.model.js";

function dayBounds(date = new Date()) {
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  const end = new Date(date); end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Spec: "Today's Incoming Calls, Today's Outgoing Calls, Today's Missed
// Calls, Answered Calls, Total Talk Time, Average Call Time, Assigned
// Orders, Completed Orders, Pending Orders."
export async function getAgentDailyStats(agentId) {
  const { start, end } = dayBounds();
  const range = { agentId, createdAt: { $gte: start, $lte: end } };

  const [incoming, outgoing, missed, answered, talk, assigned, completed, pending] = await Promise.all([
    CallLogModel.countDocuments({ ...range, direction: "inbound" }),
    CallLogModel.countDocuments({ ...range, direction: "outbound" }),
    CallLogModel.countDocuments({ ...range, status: "missed" }),
    CallLogModel.countDocuments({ ...range, $or: [{ status: { $in: ["answered", "completed"] } }, { outcome: "Confirmed" }] }),
    CallLogModel.aggregate([
      { $match: range },
      { $group: { _id: null, total: { $sum: "$durationSeconds" }, count: { $sum: { $cond: [{ $gt: ["$durationSeconds", 0] }, 1, 0] } } } },
    ]),
    OrderModel.countDocuments({ assignedAgent: agentId }),
    OrderModel.countDocuments({ assignedAgent: agentId, order_status: "Delivered" }),
    OrderModel.countDocuments({ assignedAgent: agentId, order_status: { $in: ["Pending", "Confirmed", "On-Hold", "On the way"] } }),
  ]);

  const totalTalkTimeSeconds = talk[0]?.total || 0;
  const callsWithDuration = talk[0]?.count || 0;

  return {
    incoming, outgoing, missed, answered,
    totalTalkTimeSeconds,
    averageCallTimeSeconds: callsWithDuration ? Math.round(totalTalkTimeSeconds / callsWithDuration) : 0,
    assignedOrders: assigned, completedOrders: completed, pendingOrders: pending,
  };
}

// Spec: "Performance Statistics — Daily / Weekly / Monthly", charted.
export async function getAgentPerformanceSeries(agentId, period = "daily") {
  const now = new Date();
  let start;
  if (period === "weekly") { start = new Date(now); start.setDate(now.getDate() - 7); }
  else if (period === "monthly") { start = new Date(now); start.setMonth(now.getMonth() - 1); }
  else { start = dayBounds(now).start; }

  return CallLogModel.aggregate([
    { $match: { agentId, createdAt: { $gte: start } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        calls: { $sum: 1 },
        talkTimeSeconds: { $sum: "$durationSeconds" },
        missed: { $sum: { $cond: [{ $eq: ["$status", "missed"] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);
}

// Company-wide, for the Super Admin reports dashboard (spec: "Calls Per
// Agent, Orders Closed, Orders Pending, Average Resolution Time, Top
// Performing Agents").
export async function getCompanyWideStats({ from, to } = {}) {
  const match = {};
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);
  }

  const [byStatus, byAgent, totals] = await Promise.all([
    CallLogModel.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    CallLogModel.aggregate([
      { $match: match },
      { $group: { _id: "$agentId", calls: { $sum: 1 }, talkTimeSeconds: { $sum: "$durationSeconds" } } },
      { $sort: { calls: -1 } },
      { $limit: 10 },
      { $lookup: { from: "employees", localField: "_id", foreignField: "_id", as: "agent" } },
      { $unwind: { path: "$agent", preserveNullAndEmptyArrays: true } },
      { $project: { agentId: "$_id", agentName: "$agent.name", calls: 1, talkTimeSeconds: 1, _id: 0 } },
    ]),
    CallLogModel.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: 1 }, talkTimeSeconds: { $sum: "$durationSeconds" } } }]),
  ]);

  return { byStatus, topAgents: byAgent, totalCalls: totals[0]?.total || 0, totalTalkTimeSeconds: totals[0]?.talkTimeSeconds || 0 };
}
