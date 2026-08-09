import CallLogModel from "../models/callLog.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import OrderModel from "../models/order.model.js";
import UserModel from "../models/user.model.js";

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

// --- Call Center CRM module additions (Session 2) — additive only,
// everything above this line is untouched and keeps working exactly as
// before for the plain tel:-link flow. These cover the new real-time
// (SIP/WebRTC/Asterisk) call path. ---

// Called by the client during a live call (ringing/answered/ended) and
// by the Asterisk ARI service (telephony/ariClient.js) for
// server-detected transitions. Deliberately permissive about which
// fields are present — different callers know different things at
// different moments.
export const updateCallStatusController = async (req, res) => {
  try {
    const { _id, status, asteriskChannelId, asteriskUniqueId, recording, queueWaitSeconds } = req.body;
    const log = await CallLogModel.findById(_id);
    if (!log) return res.status(404).json({ success: false, error: true, message: "Call log not found" });

    if (status) {
      log.status = status;
      if (status === "answered" && !log.answeredAt) log.answeredAt = new Date();
      if (["answered", "completed", "missed", "rejected", "abandoned"].includes(status) && !log.endedAt && (log.answeredAt || status !== "answered")) {
        if (["completed", "missed", "rejected", "abandoned"].includes(status)) {
          log.endedAt = new Date();
          if (log.answeredAt) log.durationSeconds = Math.max(0, Math.round((log.endedAt - log.answeredAt) / 1000));
        }
      }
    }
    if (asteriskChannelId !== undefined) log.asteriskChannelId = asteriskChannelId;
    if (asteriskUniqueId !== undefined) log.asteriskUniqueId = asteriskUniqueId;
    if (recording !== undefined) log.recording = recording;
    if (queueWaitSeconds !== undefined) log.queueWaitSeconds = queueWaitSeconds;

    await log.save();
    return res.json({ success: true, error: false, data: log });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Running note thread (spec: "Allow notes after the call") — separate
// from the single legacy `note` field, which the old tel:-link outcome
// flow still uses untouched.
export const addCallNoteController = async (req, res) => {
  try {
    const { _id, text } = req.body;
    if (!text?.trim()) return res.status(400).json({ success: false, error: true, message: "Note text is required" });
    const employee = await EmployeeModel.findOne({ userId: req.userId });
    const log = await CallLogModel.findByIdAndUpdate(
      _id,
      { $push: { notes: { text: text.trim(), addedBy: employee?._id || null, addedAt: new Date() } } },
      { new: true }
    );
    if (!log) return res.status(404).json({ success: false, error: true, message: "Call log not found" });
    return res.json({ success: true, error: false, data: log });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const getCallLogController = async (req, res) => {
  try {
    const { id } = req.query;
    const log = await CallLogModel.findById(id)
      .populate("agentId", "name")
      .populate("orderId")
      .populate("recording")
      .populate("notes.addedBy", "name")
      .populate("transferredFrom", "name")
      .populate("transferredTo", "name");
    if (!log) return res.status(404).json({ success: false, error: true, message: "Call log not found" });
    return res.json({ success: true, error: false, data: log });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

const SUPER_ADMIN_ROLES = ["SUPERADMIN", "ADMIN", "DEMO_ADMIN"]; // same set notification.controller.js uses

// Powers both "My Calls" and (super admin) "All Calls" — spec: "Call
// Logs... Nothing should be deleted automatically" (there is, correctly,
// no delete endpoint here at all — not even for a super admin; the spec
// only asks for undo/versioning on the CRM-managed fields, never a hard
// delete of a call log).
export const listCallLogsController = async (req, res) => {
  try {
    const { scope = "mine", status, direction, orderId, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (direction) query.direction = direction;
    // Spec: "Every order should clearly display: ... Call History" — a
    // specific order's call history is visible regardless of scope
    // (whoever can see the order can see its call history), so this
    // bypasses the mine/all split below when present.
    if (orderId) query.orderId = orderId;

    // scope=all is only honored for actual super-admin-tier roles —
    // never trust the query string alone (a regular agent requesting
    // scope=all must NOT see every other agent's calls). Skipped
    // entirely when orderId is present, per the comment above.
    if (!orderId) {
      let effectiveScope = scope;
      if (scope === "all") {
        const caller = await UserModel.findById(req.userId).select("role");
        if (!SUPER_ADMIN_ROLES.includes(caller?.role)) effectiveScope = "mine";
      }

      if (effectiveScope === "mine") {
        const employee = await EmployeeModel.findOne({ userId: req.userId });
        if (!employee) return res.json({ success: true, error: false, data: { logs: [], total: 0, page: 1, pages: 0 } });
        query.agentId = employee._id;
      }
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

    const [logs, total] = await Promise.all([
      CallLogModel.find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate("agentId", "name")
        .populate("orderId", "orderId order_status")
        .populate("recording"),
      CallLogModel.countDocuments(query),
    ]);

    return res.json({ success: true, error: false, data: { logs, total, page: pageNum, pages: Math.ceil(total / limitNum) } });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
