import OrderModel from "../../../server/models/order.model.js";
import { assignOrderRoundRobin, reassignOrder, getAssignmentHistory } from "../services/assignmentService.js";

// Super Admin: "Manual reassignment."
export const manualReassignController = async (req, res) => {
  try {
    const { orderId, agentId, reason } = req.body;
    if (!orderId || !agentId) {
      return res.status(400).json({ success: false, error: true, message: "orderId and agentId are required" });
    }
    const order = await OrderModel.findById(orderId);
    if (!order) return res.status(404).json({ success: false, error: true, message: "Order not found" });

    const assignment = await reassignOrder(order, agentId, { assignedBy: req.userId, reason });
    return res.json({ success: true, error: false, data: assignment });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Trigger auto-assignment for one order on demand (e.g. an admin clicks
// "Auto-assign" on an order that's still unassigned).
export const autoAssignController = async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await OrderModel.findById(orderId);
    if (!order) return res.status(404).json({ success: false, error: true, message: "Order not found" });

    const assignment = await assignOrderRoundRobin(order, { assignedBy: req.userId, method: "manual" });
    if (!assignment) {
      return res.status(409).json({ success: false, error: true, message: "No active agents available to assign right now" });
    }
    return res.json({ success: true, error: false, data: assignment });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const getOrderAssignmentHistoryController = async (req, res) => {
  try {
    const { orderId } = req.query;
    const history = await getAssignmentHistory(orderId);
    return res.json({ success: true, error: false, data: history });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
