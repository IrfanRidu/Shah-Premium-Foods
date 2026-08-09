import mongoose from "mongoose";

// Fix 26: Foundation model for the HR & Payroll dashboard. Intentionally lean —
// the user indicated further commands will refine this dashboard. This gives
// admins a working staff directory + monthly salary figure so it can already
// feed the "Salary Expense" analytics dependency (Fix 34/39).
const employeeSchema = new mongoose.Schema(
  {
    userId:      { type: mongoose.Schema.ObjectId, ref: "user", default: null }, // linked login account, if any
    name:        { type: String, required: true },
    email:       { type: String, default: "" },
    phone:       { type: String, default: "" },
    designation: { type: String, default: "" },
    department:  { type: String, default: "" },
    employmentType: { type: String, enum: ["Full-time", "Part-time", "Contract", "Intern"], default: "Full-time" },
    monthlySalary: { type: Number, default: 0 },
    joinDate:    { type: Date, default: Date.now },
    status:      { type: String, enum: ["Active", "On Leave", "Terminated"], default: "Active" },
    bankAccount: { type: String, default: "" },
    notes:       { type: String, default: "" },
    // Fix (call center): marks this employee as a Customer Care call agent.
    // Their linked userId (if any) is assigned the CALL_CENTER_AGENT role,
    // which is scoped to customerCare-only dashboard access.
    isCallCenterAgent: { type: Boolean, default: false },
    // Call Center CRM module (Session 2): PJSIP registration credentials
    // for this agent's WebRTC softphone — deliberately separate from
    // their site login (userId/password above). sipUsername is stable
    // and derived from _id at provisioning time; sipPassword is a
    // generated secret, not something the agent picks. SECURITY NOTE:
    // stored in plaintext here for now — the agent needs the actual
    // value back (not just a hash) to register, same constraint a PBX
    // credential always has. For a real production deployment, encrypt
    // this at rest (e.g. via a KMS-backed field encryption) rather than
    // storing it in the clear — flagged here rather than silently
    // shipped as if it were already hardened.
    sipUsername: { type: String, default: null },
    sipPassword: { type: String, default: null },
  },
  { timestamps: true }
);

const payrollRecordSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.ObjectId, ref: "employee", required: true },
    month:      { type: String, required: true }, // "2026-07"
    baseSalary: { type: Number, default: 0 },
    bonus:      { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    netPay:     { type: Number, default: 0 },
    status:     { type: String, enum: ["Pending", "Paid"], default: "Pending" },
    paidAt:     { type: Date, default: null },
  },
  { timestamps: true }
);
payrollRecordSchema.index({ employeeId: 1, month: 1 }, { unique: true });

export const EmployeeModel = mongoose.models.employee || mongoose.model("employee", employeeSchema);
export const PayrollRecordModel = mongoose.models.payrollRecord || mongoose.model("payrollRecord", payrollRecordSchema);
export default EmployeeModel;
