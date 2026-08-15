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
    // Phase C (Dynamic Document Generation) template-engine placeholders
    // — {{address}}, {{passport_number}}, {{nid_number}}, {{tax_id}},
    // {{manager_name}} per the Advanced HRMS Features spec's exact
    // placeholder list. All optional/blank by default on existing
    // records (a purely additive schema change, nothing to migrate) —
    // HR fills these in via the existing Employee edit form, and Phase D
    // (Smart Document Processing / OCR) will be able to auto-populate
    // address/passportNumber/nidNumber from an uploaded ID document once
    // that phase exists. managerName is a plain text field rather than a
    // relational reference to another employee — a full reporting-
    // hierarchy feature wasn't asked for; this only needs to fill a
    // placeholder on a printed letter.
    address:        { type: String, default: "" },
    passportNumber: { type: String, default: "" },
    nidNumber:      { type: String, default: "" },
    taxId:          { type: String, default: "" },
    managerName:    { type: String, default: "" },
    // Phase D (Smart Document Processing / OCR) additions — the spec's
    // own examples are explicit that these get auto-populated from an
    // uploaded passport or National ID: "Uploading a passport should
    // automatically populate: ...Nationality, Date of Birth, Gender...",
    // "Uploading a National ID should populate: ...Father's Name,
    // Mother's Name, Date of Birth...". Document-specific dates (a
    // passport's own issue/expiry dates) deliberately stay on that
    // document's own EmployeeDocument record rather than duplicated
    // here — those describe the DOCUMENT, not the person, and a renewed
    // passport shouldn't silently overwrite a still-accurate profile
    // field with a new document's dates.
    dateOfBirth: { type: Date, default: null },
    gender:      { type: String, default: "" },
    nationality: { type: String, default: "" },
    fatherName:  { type: String, default: "" },
    motherName:  { type: String, default: "" },
    // Phase E (Biometric Attendance). Spec: "Store facial embeddings
    // instead of raw images when possible." A face-api.js descriptor is
    // 128 floating-point numbers, NOT a photo — this is what makes that
    // requirement true here rather than just claimed; there is no raw
    // enrollment image stored anywhere in this schema or model.
    // "Allow HR to re-enroll employees" — re-enrollment simply
    // overwrites both fields, no history of prior descriptors is kept
    // (an old descriptor has no legitimate use once superseded).
    faceDescriptor: { type: [Number], default: [] },
    faceEnrolledAt: { type: Date, default: null },
    // The spec's own fingerprint section is explicit that this needs
    // "scanners that expose SDKs or local APIs" — this field is NOT a
    // raw fingerprint template (this app never receives or stores one;
    // vendor hardware keeps that on-device), just the STRING identifier
    // that vendor's device/bridge reports back for a match, which this
    // app maps to an employee. See biometricDevice.model.js's own notes
    // for the fuller architecture reasoning.
    fingerprintTemplateId: { type: String, default: "" },
    fingerprintEnrolledAt: { type: Date, default: null },
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
    // Advanced HRMS Features spec: "Each payroll calculation must show:
    // Basic Salary, Overtime, Bonuses, Allowances, Gross Salary, Tax
    // Deduction, Other Deductions, Net Salary." overtime/allowances are
    // new HR-entered inputs; grossSalary/taxDeduction/otherDeductions/
    // deductionBreakdown are computed by calculatePayroll() (below, in
    // hrPayroll.controller.js) from the company-wide PayrollConfig rules
    // plus any per-record ad-hoc items, and stored at save time — a past
    // payslip must stay historically accurate even if Super Admin changes
    // the tax rules next month, so this is never recomputed from current
    // rules after the fact, only from what was configured at the time.
    overtime:   { type: Number, default: 0 },
    bonus:      { type: Number, default: 0 },
    allowances: { type: Number, default: 0 },
    grossSalary: { type: Number, default: 0 },
    // adHocDeductions: per-employee, per-month one-off items HR enters at
    // generation time — Loan deduction / Advance salary deduction / any
    // other custom line that ISN'T a standing company-wide rule (those
    // live in PayrollConfig instead and apply automatically every month).
    adHocDeductions: [{ name: String, amount: Number }],
    // Full itemization — every line that fed into taxDeduction/
    // otherDeductions below, whether from a PayrollConfig rule or an
    // ad-hoc item — this is what the printable salary slip renders.
    deductionBreakdown: [{ name: String, amount: Number, category: { type: String, enum: ["tax", "other"] } }],
    taxDeduction:    { type: Number, default: 0 },
    otherDeductions: { type: Number, default: 0 },
    // Kept as the flat total (taxDeduction + otherDeductions) rather than
    // removed — listPayrollController's existing demo-masking and any
    // other current reader of a single "deductions" number keeps working
    // unchanged; deductionBreakdown above is the new itemized source.
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
