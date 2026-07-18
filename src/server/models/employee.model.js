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
