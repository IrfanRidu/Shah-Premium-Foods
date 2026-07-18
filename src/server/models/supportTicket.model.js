import mongoose from "mongoose";

// Fix 26: Foundation model for the Customer Care dashboard. Kept intentionally
// lean — the user said further commands will refine this dashboard, so this
// gives admins a working ticket list (view/status/assign/note) without
// overbuilding a workflow that's about to be redesigned.
const supportTicketSchema = new mongoose.Schema(
  {
    userId:      { type: mongoose.Schema.ObjectId, ref: "user", default: null },
    customerName:  { type: String, default: "" },
    customerEmail: { type: String, default: "" },
    customerPhone: { type: String, default: "" },
    orderId:     { type: mongoose.Schema.ObjectId, ref: "order", default: null },
    subject:     { type: String, required: true },
    message:     { type: String, default: "" },
    status:      { type: String, enum: ["Open", "In Progress", "Resolved", "Closed"], default: "Open" },
    priority:    { type: String, enum: ["Low", "Normal", "High", "Urgent"], default: "Normal" },
    assignedTo:  { type: mongoose.Schema.ObjectId, ref: "user", default: null },
    notes: [
      {
        note: String,
        addedBy: { type: mongoose.Schema.ObjectId, ref: "user" },
        addedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

supportTicketSchema.index({ status: 1, createdAt: -1 });

const SupportTicketModel = mongoose.models.supportTicket || mongoose.model("supportTicket", supportTicketSchema);
export default SupportTicketModel;
