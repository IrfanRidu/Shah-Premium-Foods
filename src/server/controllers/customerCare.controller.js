import SupportTicketModel from "../models/supportTicket.model.js";
import UserModel from "../models/user.model.js";
import OrderModel from "../models/order.model.js";
import { createNotification } from "./notification.controller.js";

// LIST tickets (admin) — filter by status
export const listTicketsController = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status && status !== "All") query.status = status;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [tickets, total, counts] = await Promise.all([
      SupportTicketModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
        .populate("userId", "name email").populate("assignedTo", "name").populate("orderId", "orderId"),
      SupportTicketModel.countDocuments(query),
      SupportTicketModel.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);
    const statusCounts = counts.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {});
    return res.json({ success: true, error: false, data: { tickets, total, statusCounts, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// CREATE ticket (customer-facing, or admin on behalf of customer)
export const createTicketController = async (req, res) => {
  try {
    const { customerName, customerEmail, customerPhone, orderId, subject, message } = req.body;
    if (!subject) return res.status(400).json({ success: false, error: true, message: "Subject is required" });
    const ticket = new SupportTicketModel({
      userId: req.userId || null,
      customerName: customerName || "", customerEmail: customerEmail || "", customerPhone: customerPhone || "",
      orderId: orderId || null, subject, message: message || "",
    });
    await ticket.save();
    createNotification({
      type: "new_ticket",
      title: `New support ticket: ${subject}`,
      message: `From ${customerName || "a customer"}`,
      link: "/dashboard/customer-care",
      targetModule: "customerCare",
      relatedId: ticket._id,
    });
    return res.status(201).json({ success: true, error: false, data: ticket, message: "Ticket created" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// UPDATE ticket status / assignment (admin)
export const updateTicketController = async (req, res) => {
  try {
    const { _id, status, priority, assignedTo, note } = req.body;
    const ticket = await SupportTicketModel.findById(_id);
    if (!ticket) return res.status(404).json({ success: false, error: true, message: "Ticket not found" });
    if (status) ticket.status = status;
    if (priority) ticket.priority = priority;
    if (assignedTo !== undefined) ticket.assignedTo = assignedTo || null;
    if (note) ticket.notes.push({ note, addedBy: req.userId, addedAt: new Date() });
    await ticket.save();
    return res.json({ success: true, error: false, data: ticket, message: "Ticket updated" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// DELETE ticket (admin)
export const deleteTicketController = async (req, res) => {
  try {
    const { _id } = req.body;
    await SupportTicketModel.findByIdAndDelete(_id);
    return res.json({ success: true, error: false, message: "Ticket deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
