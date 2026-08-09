import EmployeeModel from "../../../server/models/employee.model.js";
import CallLogModel from "../../../server/models/callLog.model.js";
import { getAgentDailyStats, getAgentPerformanceSeries, getCompanyWideStats } from "../services/callStatsService.js";

async function resolveAgentId(req) {
  const employee = await EmployeeModel.findOne({ userId: req.userId, isCallCenterAgent: true }).select("_id");
  return employee?._id || null;
}

// Spec: "Today's Incoming/Outgoing/Missed Calls, Answered Calls, Total
// Talk Time, Average Call Time, Assigned/Completed/Pending Orders."
export const getMyDashboardStatsController = async (req, res) => {
  try {
    const agentId = await resolveAgentId(req);
    if (!agentId) return res.status(403).json({ success: false, error: true, message: "Not a call center agent" });

    const stats = await getAgentDailyStats(agentId);
    return res.json({ success: true, error: false, data: stats });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Spec: "Recent Calls."
export const getMyRecentCallsController = async (req, res) => {
  try {
    const agentId = await resolveAgentId(req);
    if (!agentId) return res.json({ success: true, error: false, data: [] });

    const calls = await CallLogModel.find({ agentId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("orderId", "orderId")
      .populate("recording");
    return res.json({ success: true, error: false, data: calls });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Spec: "Reports — Incoming/Outgoing/Missed Calls, Talk Time, Calls Per
// Agent... Top Performing Agents." Super Admin only — enforced by the
// route's middleware.
export const getCompanyReportsController = async (req, res) => {
  try {
    const { from, to } = req.query;
    const stats = await getCompanyWideStats({ from, to });
    return res.json({ success: true, error: false, data: stats });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Spec: "Performance Statistics — Daily / Weekly / Monthly."
export const getMyPerformanceController = async (req, res) => {
  try {
    const agentId = await resolveAgentId(req);
    if (!agentId) return res.json({ success: true, error: false, data: [] });

    const period = ["daily", "weekly", "monthly"].includes(req.query.period) ? req.query.period : "weekly";
    const series = await getAgentPerformanceSeries(agentId, period);
    return res.json({ success: true, error: false, data: series });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
