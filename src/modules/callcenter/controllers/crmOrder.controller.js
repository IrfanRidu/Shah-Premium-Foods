import OrderModel from "../../../server/models/order.model.js";
import EmployeeModel from "../../../server/models/employee.model.js";
import { logChange } from "../services/crmChangeLogService.js";

// Spec: "Agents can view: All Orders, My Orders, Pending, Completed,
// Follow-up, Cancelled." "Pending"/"Completed"/"Cancelled" map onto the
// existing order_status enum (deliberately not duplicated — see
// PROGRESS_TRACKER.md design decisions); "Follow-up" is its own new
// field since it isn't a real order_status value.
export const listCrmOrdersController = async (req, res) => {
  try {
    const { scope = "mine", tab = "all", page = 1, limit = 20 } = req.query;
    const query = {};

    // "All Orders" IS available to regular agents per the spec (not
    // super-admin-restricted, unlike the stricter scope=all gates on
    // calls/callbacks elsewhere) — any value other than "mine" just
    // means no assignedAgent filter is applied below.
    if (scope !== "all") {
      const employee = await EmployeeModel.findOne({ userId: req.userId });
      if (!employee) return res.json({ success: true, error: false, data: { orders: [], total: 0, page: 1, pages: 0 } });
      query.assignedAgent = employee._id;
    }

    switch (tab) {
      case "pending":   query.order_status = { $in: ["Pending", "Confirmed", "On-Hold", "On the way"] }; break;
      case "completed": query.order_status = "Delivered"; break;
      case "cancelled": query.order_status = { $in: ["Cancelled", "Return", "Refunded"] }; break;
      case "follow-up": query["followUp.scheduled"] = true; break;
      default: break; // "all" — no extra filter
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

    const [orders, total] = await Promise.all([
      OrderModel.find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate("assignedAgent", "name")
        .populate("userId", "name email mobile"),
      OrderModel.countDocuments(query),
    ]);

    return res.json({ success: true, error: false, data: { orders, total, page: pageNum, pages: Math.ceil(total / limitNum) } });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Spec: "Every order should clearly display: Assigned Agent, Assignment
// Time, Assignment History, Customer Timeline, Call History, Notes" —
// this single endpoint returns everything the timeline view needs in
// one call rather than making the frontend orchestrate 3 separate
// fetches for what's conceptually one panel.
export const getOrderCrmDetailController = async (req, res) => {
  try {
    const { orderId } = req.query;
    const order = await OrderModel.findById(orderId)
      .populate("assignedAgent", "name")
      .populate("userId", "name email mobile")
      .populate("crmNotes.addedBy", "name email");
    if (!order) return res.status(404).json({ success: false, error: true, message: "Order not found" });
    return res.json({ success: true, error: false, data: order });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Spec: agents "Can... Update follow-up"; Super Admin undo covers
// "Follow-up updates."
export const updateFollowUpController = async (req, res) => {
  try {
    const { orderId, scheduled, date, note } = req.body;
    const order = await OrderModel.findById(orderId);
    if (!order) return res.status(404).json({ success: false, error: true, message: "Order not found" });

    const previousValue = { ...order.followUp.toObject() };
    order.followUp = {
      scheduled: scheduled ?? order.followUp.scheduled,
      date: date !== undefined ? (date ? new Date(date) : null) : order.followUp.date,
      note: note !== undefined ? note : order.followUp.note,
    };
    await order.save();

    await logChange({
      entityType: "order", entityId: order._id, action: "follow_up_update",
      field: "followUp", previousValue, newValue: order.followUp.toObject(),
      performedBy: req.userId,
    });

    return res.json({ success: true, error: false, data: order });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Spec: "Customer Notes" — general relationship notes, distinct from a
// single call's notes.
export const addOrderNoteController = async (req, res) => {
  try {
    const { orderId, text } = req.body;
    if (!text?.trim()) return res.status(400).json({ success: false, error: true, message: "Note text is required" });

    const order = await OrderModel.findByIdAndUpdate(
      orderId,
      { $push: { crmNotes: { text: text.trim(), addedBy: req.userId, addedAt: new Date() } } },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, error: true, message: "Order not found" });

    await logChange({
      entityType: "order", entityId: order._id, action: "note_add",
      field: "crmNotes", previousValue: null, newValue: text.trim(),
      performedBy: req.userId,
    });

    return res.json({ success: true, error: false, data: order });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
