import CallbackModel from "../models/callback.model.js";
import EmployeeModel from "../../../server/models/employee.model.js";
import UserModel from "../../../server/models/user.model.js";
import { createNotification } from "../../../server/controllers/notification.controller.js";
import { emitToUser } from "../socket/socketServer.js";

const SUPER_ADMIN_ROLES = ["SUPERADMIN", "ADMIN", "DEMO_ADMIN"];

async function resolveAgent(req) {
  return EmployeeModel.findOne({ userId: req.userId }).select("_id userId name");
}

export const createCallbackController = async (req, res) => {
  try {
    const agent = await resolveAgent(req);
    if (!agent) return res.status(403).json({ success: false, error: true, message: "Not a call center agent" });

    const { customerId, customerName, customerPhone, orderId, scheduledFor, note } = req.body;
    if (!customerPhone || !scheduledFor) {
      return res.status(400).json({ success: false, error: true, message: "customerPhone and scheduledFor are required" });
    }

    const callback = await CallbackModel.create({
      customerId: customerId || null, customerName: customerName || "", customerPhone,
      orderId: orderId || null, agentId: agent._id, scheduledFor: new Date(scheduledFor), note: note || "",
    });

    return res.status(201).json({ success: true, error: false, data: callback });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// scope=mine (default) or scope=all (only honored for actual
// super-admin-tier roles — never trust the query string alone).
export const listCallbacksController = async (req, res) => {
  try {
    const { scope = "mine", status } = req.query;
    const query = {};
    if (status) query.status = status;

    let effectiveScope = scope;
    if (scope === "all") {
      const caller = await UserModel.findById(req.userId).select("role");
      if (!SUPER_ADMIN_ROLES.includes(caller?.role)) effectiveScope = "mine";
    }

    if (effectiveScope === "mine") {
      const agent = await resolveAgent(req);
      if (!agent) return res.json({ success: true, error: false, data: [] });
      query.agentId = agent._id;
    }

    const callbacks = await CallbackModel.find(query).sort({ scheduledFor: 1 }).populate("agentId", "name").populate("orderId", "orderId");
    return res.json({ success: true, error: false, data: callbacks });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const completeCallbackController = async (req, res) => {
  try {
    const { _id, relatedCallLogId } = req.body;
    const callback = await CallbackModel.findByIdAndUpdate(
      _id,
      { status: "completed", completedAt: new Date(), relatedCallLogId: relatedCallLogId || null },
      { new: true }
    );
    if (!callback) return res.status(404).json({ success: false, error: true, message: "Callback not found" });
    return res.json({ success: true, error: false, data: callback });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const cancelCallbackController = async (req, res) => {
  try {
    const { _id } = req.body;
    const callback = await CallbackModel.findByIdAndUpdate(_id, { status: "cancelled" }, { new: true });
    if (!callback) return res.status(404).json({ success: false, error: true, message: "Callback not found" });
    return res.json({ success: true, error: false, data: callback });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Called from a periodic sweep (server.js) — anything due now gets a
// notification fired, then flipped to "missed" once its window passes
// so it doesn't fire twice. Exported so server.js can wire it into an
// interval the same way it does reassignAbandonedOrders().
export async function sweepDueCallbacks() {
  const now = new Date();
  const due = await CallbackModel.find({ status: "pending", scheduledFor: { $lte: now } }).populate("agentId", "userId name");
  for (const cb of due) {
    if (cb.agentId?.userId) {
      await createNotification({
        type: "callback_reminder",
        title: "Callback due",
        message: `Time to call ${cb.customerName || cb.customerPhone} back.`,
        targetModule: "customerCare",
        targetUserId: cb.agentId.userId,
        relatedId: cb._id,
      });
      emitToUser(String(cb.agentId.userId), "notification:new", { type: "callback_reminder", callbackId: cb._id });
    }
    // Grace window before marking missed, so a callback due "now" doesn't
    // immediately flip to missed before the agent has a chance to see it.
    if (now - cb.scheduledFor > 15 * 60 * 1000) {
      cb.status = "missed";
      await cb.save();
    }
  }
}
