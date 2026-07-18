import CallLogModel from "../models/callLog.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import OrderModel from "../models/order.model.js";

// Fires the instant an agent clicks "Call Customer" — see the note on the
// model file for why only this part can be fully automatic.
export const logCallInitiatedController = async (req, res) => {
  try {
    const { orderId, customerName, customerPhone } = req.body;

    // Resolve the calling agent's Employee record from their logged-in user
    const employee = await EmployeeModel.findOne({ userId: req.userId });
    if (!employee) {
      // Not every customerCare staff member is necessarily set up as a
      // call-center Employee record (e.g. a super admin calling ad hoc) —
      // don't block the call over this, just skip logging it.
      return res.json({ success: true, error: false, data: null });
    }

    const log = await new CallLogModel({
      agentId: employee._id, orderId: orderId || null,
      customerName: customerName || "", customerPhone: customerPhone || "",
    }).save();

    return res.status(201).json({ success: true, error: false, data: log });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Agent fills this in after the call ends (duration + outcome can't be
// captured automatically — see model file comment).
export const logCallOutcomeController = async (req, res) => {
  try {
    const { _id, outcome, durationSeconds, note } = req.body;
    const log = await CallLogModel.findByIdAndUpdate(
      _id,
      { outcome, durationSeconds: Number(durationSeconds) || 0, note: note || "", outcomeLogged: true },
      { new: true }
    );
    if (!log) return res.status(404).json({ success: false, error: true, message: "Call log not found" });
    return res.json({ success: true, error: false, data: log });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Calls this agent hasn't logged an outcome for yet — shown as a small
// prompt list so nothing gets forgotten.
export const getMyPendingCallLogsController = async (req, res) => {
  try {
    const employee = await EmployeeModel.findOne({ userId: req.userId });
    if (!employee) return res.json({ success: true, error: false, data: [] });
    const pending = await CallLogModel.find({ agentId: employee._id, outcomeLogged: false })
      .sort({ createdAt: -1 }).limit(10);
    return res.json({ success: true, error: false, data: pending });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Super-admin view: per-agent totals + full recent history.
export const getCallHistoryController = async (req, res) => {
  try {
    const { from, to } = req.query;
    const start = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end   = to   ? new Date(to)   : new Date();
    end.setHours(23, 59, 59, 999);

    const [perAgent, recentLogs] = await Promise.all([
      CallLogModel.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: {
            _id: "$agentId",
            totalCalls: { $sum: 1 },
            loggedCalls: { $sum: { $cond: ["$outcomeLogged", 1, 0] } },
            totalDurationSeconds: { $sum: "$durationSeconds" },
            confirmed: { $sum: { $cond: [{ $eq: ["$outcome", "Confirmed"] }, 1, 0] } },
            noAnswer:  { $sum: { $cond: [{ $eq: ["$outcome", "No Answer"] }, 1, 0] } },
          } },
        { $lookup: { from: "employees", localField: "_id", foreignField: "_id", as: "agent" } },
        { $unwind: { path: "$agent", preserveNullAndEmptyArrays: true } },
        { $project: {
            agentName: "$agent.name", totalCalls: 1, loggedCalls: 1, totalDurationSeconds: 1, confirmed: 1, noAnswer: 1,
            avgDurationSeconds: {
              $cond: [{ $gt: ["$loggedCalls", 0] }, { $divide: ["$totalDurationSeconds", "$loggedCalls"] }, 0],
            },
          } },
        { $sort: { totalCalls: -1 } },
      ]),
      CallLogModel.find({ createdAt: { $gte: start, $lte: end } })
        .sort({ createdAt: -1 }).limit(100)
        .populate("agentId", "name")
        .populate("orderId", "orderId"),
    ]);

    return res.json({
      success: true, error: false,
      data: {
        period: { from: start, to: end },
        perAgent,
        totalCalls: perAgent.reduce((s, a) => s + a.totalCalls, 0),
        recentLogs,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
