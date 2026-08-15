import crypto from "crypto";
import bcryptjs from "bcryptjs";
import UserModel from "../models/user.model.js";
import RoleModel from "../models/role.model.js";
import { EmployeeModel, PayrollRecordModel } from "../models/employee.model.js";
import EmployeeEventModel from "../models/employeeEvent.model.js";
import PayrollConfigModel from "../models/payrollConfig.model.js";
import { maskFieldsForDemo, maskAccountNumber, maskAmount, maskEmail, maskPhone, isDemoRole } from "../utils/demoMask.js";

// Round to 2 decimals without reintroducing binary floating-point noise
// (e.g. 0.1 + 0.2) into stored/displayed currency amounts.
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Only these fields are settable through the generic HR employee CRUD
// below. Security fix (mass assignment / OWASP A08): `createEmployeeController`
// and `updateEmployeeController` used to pass `req.body` straight into
// `new EmployeeModel(req.body)` / `findByIdAndUpdate(_id, rest)`
// unfiltered — since the schema also has `userId` (linking an employee
// record to a login account) and `isCallCenterAgent`, a caller could set
// either directly through this endpoint, bypassing the dedicated
// callCenterAgent.controller.js flow that's supposed to be the only way
// those two fields get set (it provisions the linked login + role
// together, atomically — setting `userId` here without going through that
// flow could link an employee record to an arbitrary account with no
// corresponding role/permission setup). Deliberately excluded from this
// whitelist for that reason.
const EMPLOYEE_EDITABLE_FIELDS = [
  "name", "email", "phone", "designation", "department",
  "employmentType", "monthlySalary", "joinDate", "status",
  "bankAccount", "notes",
];

function pickEmployeeFields(source) {
  const out = {};
  for (const key of EMPLOYEE_EDITABLE_FIELDS) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

// ── Employees ──────────────────────────────────────────────────
export const listEmployeesController = async (req, res) => {
  try {
    const { status, department } = req.query;
    const query = {};
    if (status && status !== "All") query.status = status;
    if (department && department !== "All") query.department = department;
    const employees = await EmployeeModel.find(query).sort({ createdAt: -1 }).populate("userId", "email role status");
    const totalMonthlySalary = employees.filter((e) => e.status === "Active").reduce((s, e) => s + (e.monthlySalary || 0), 0);
    const safeEmployees = maskFieldsForDemo(req.userRole, employees, {
      monthlySalary: maskAmount,
      bankAccount: maskAccountNumber,
      email: maskEmail,
      phone: maskPhone,
    });
    return res.json({
      success: true, error: false,
      data: { employees: safeEmployees, totalMonthlySalary: req.userRole === "DEMO_ADMIN" ? 0 : totalMonthlySalary },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const createEmployeeController = async (req, res) => {
  try {
    const emp = new EmployeeModel(pickEmployeeFields(req.body));
    await emp.save();
    return res.status(201).json({ success: true, error: false, data: emp, message: "Employee added" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Employee "types" HR/Admin/Super Admin can hand a real dashboard login to
// directly from the Add Employee form here — "Employee will have
// different types – HR, Call center agent, and others which Super admin,
// HR, admin can add." Deliberately whitelist-only, same reasoning as
// callCenterAgent.controller.js's own ensureAgentRole(): only a Super
// Admin may ever hand-author a brand new permission combination (that
// stays confined to the Roles & Staff page) — this endpoint can only ever
// attach one of these pre-existing, already-permission-scoped roles to a
// new login, never invent one.
//
// CALL_CENTER_AGENT (Session 2): now supported here too, not just via
// the dedicated Customer Care page flow — the two provisioning paths
// were creating a real gap otherwise (this form's dropdown either had
// to hide the role entirely, or offer it without the SIP credentials
// that make it actually work). See the isCallCenterAgent/sipUsername/
// sipPassword handling below, mirroring callCenterAgent.controller.js's
// ensureAgentRole()+creation flow exactly rather than duplicating a
// second, divergent implementation of the same thing.
const PROVISIONABLE_ROLES = new Set(["HR", "MANAGER", "STAFF", "ANALYST", "CALL_CENTER_AGENT"]);

export const createEmployeeWithLoginController = async (req, res) => {
  try {
    const { name, email, phone, password, roleName, designation, department, ...rest } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: true, message: "Name is required" });
    }
    if (!PROVISIONABLE_ROLES.has(roleName)) {
      return res.status(400).json({ success: false, error: true, message: `Role must be one of: ${[...PROVISIONABLE_ROLES].join(", ")}` });
    }
    if (!email?.trim()) {
      return res.status(400).json({ success: false, error: true, message: "Email is required to create a login" });
    }
    const existingUser = await UserModel.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, error: true, message: "That email is already registered to a user" });
    }

    // Roles are provisioned by ensureSystemRoles() at boot / on first
    // permission-check (role.controller.js) — this just confirms the
    // target role genuinely exists before linking a brand new login to
    // it, same defensive check callCenterAgent.controller.js's own
    // ensureAgentRole() does for CALL_CENTER_AGENT.
    const roleDoc = await RoleModel.findOne({ name: roleName });
    if (!roleDoc) {
      return res.status(400).json({ success: false, error: true, message: `The "${roleName}" role hasn't been initialized yet — open Roles & Staff once first, then try again.` });
    }

    // Security audit: crypto.randomBytes is the correct source of
    // randomness for a generated password (Math.random() is not
    // cryptographically secure) — same reasoning + bcrypt cost (12) as
    // callCenterAgent.controller.js's identical temp-password flow.
    const tempPassword = password?.trim() || crypto.randomBytes(8).toString("base64url");
    const salt = await bcryptjs.genSalt(12);
    const hashedPassword = await bcryptjs.hash(tempPassword, salt);

    const newUser = await new UserModel({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      mobile: phone || null,
      verify_email: true, // staff account created directly by HR/admin — skip the customer email-OTP flow
      status: "Active",
      role: roleName,
      createdBy: req.userId,
    }).save();

    // Call Center CRM module (Session 2): an agent needs PJSIP
    // credentials + isCallCenterAgent:true for the softphone and every
    // telephony code path (which all resolve "the agent" via
    // isCallCenterAgent:true — see agentPresenceService.js) to work at
    // all. Same crypto.randomBytes generation as
    // callCenterAgent.controller.js's own createCallCenterAgentController,
    // so an agent provisioned from either form ends up in an identical,
    // fully-working state — not a second, lesser version.
    const isAgent = roleName === "CALL_CENTER_AGENT";
    const agentFields = isAgent
      ? { isCallCenterAgent: true, sipUsername: `agent-${crypto.randomBytes(4).toString("hex")}`, sipPassword: crypto.randomBytes(12).toString("base64url") }
      : {};

    const employee = await new EmployeeModel({
      ...pickEmployeeFields(rest),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone || "",
      designation: designation || roleName,
      department: department || "Staff",
      userId: newUser._id,
      ...agentFields,
    }).save();

    return res.status(201).json({
      success: true, error: false, data: employee,
      // Only returned once, at creation time — never stored or re-shown, same as any "first login" temp password.
      tempPassword,
      message: `Employee added with a ${roleName} dashboard login`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const updateEmployeeController = async (req, res) => {
  try {
    const { _id } = req.body;
    const updated = await EmployeeModel.findByIdAndUpdate(_id, pickEmployeeFields(req.body), { new: true });
    return res.json({ success: true, error: false, data: updated, message: "Employee updated" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const deleteEmployeeController = async (req, res) => {
  try {
    const { _id } = req.body;
    await EmployeeModel.findByIdAndDelete(_id);
    await PayrollRecordModel.deleteMany({ employeeId: _id });
    await EmployeeEventModel.deleteMany({ employeeId: _id });
    return res.json({ success: true, error: false, message: "Employee removed" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ── Payroll & Tax config ─────────────────────────────────────────
// Advanced HRMS Features spec: "Each payroll calculation must show: Basic
// Salary, Overtime, Bonuses, Allowances, Gross Salary, Tax Deduction,
// Other Deductions, Net Salary." Pure function (no I/O) — takes the
// current company-wide rules + this month's per-employee inputs, returns
// the full itemized breakdown. Kept pure and separately exported so it
// can be unit-tested and so upsertPayrollController never has to guess
// at the math inline.
//   - baseSalary: employee.monthlySalary at calculation time
//   - inputs: { overtime, bonus, allowances, adHocDeductions:[{name,amount}] }
//     (adHocDeductions = spec's "Loan deduction / Advance salary
//     deduction / Other custom deductions" — one-off, per-employee,
//     per-month items HR enters directly, as opposed to `rules` below,
//     which are standing company-wide percentages/amounts that apply to
//     every employee every month until a Super Admin disables them)
//   - rules: PayrollConfigModel's current `rules` array
export function calculatePayroll(baseSalary, inputs = {}, rules = []) {
  const base = round2(baseSalary);
  const overtime = round2(inputs.overtime);
  const bonus = round2(inputs.bonus);
  const allowances = round2(inputs.allowances);
  const grossSalary = round2(base + overtime + bonus + allowances);

  const deductionBreakdown = [];

  for (const rule of rules) {
    if (!rule?.enabled) continue;
    const ruleBase = rule.appliesTo === "gross" ? grossSalary : base;
    const amount = round2(rule.type === "fixed" ? rule.value : (ruleBase * (Number(rule.value) || 0)) / 100);
    if (amount <= 0) continue;
    deductionBreakdown.push({ name: rule.name, amount, category: rule.category === "tax" ? "tax" : "other" });
  }

  // Ad-hoc items are always company-external, per-employee one-offs
  // (loan/advance/custom) — the spec groups these with "Other
  // Deductions", never with Tax Deduction, which is reserved for
  // standing, config-driven tax rules above.
  for (const item of Array.isArray(inputs.adHocDeductions) ? inputs.adHocDeductions : []) {
    const amount = round2(item?.amount);
    if (!item?.name?.trim() || amount <= 0) continue;
    deductionBreakdown.push({ name: item.name.trim(), amount, category: "other" });
  }

  const taxDeduction = round2(deductionBreakdown.filter((d) => d.category === "tax").reduce((s, d) => s + d.amount, 0));
  const otherDeductions = round2(deductionBreakdown.filter((d) => d.category === "other").reduce((s, d) => s + d.amount, 0));
  const deductions = round2(taxDeduction + otherDeductions); // flat total — kept so any existing reader of a single "deductions" number keeps working
  const netPay = round2(grossSalary - taxDeduction - otherDeductions);

  return { baseSalary: base, overtime, bonus, allowances, grossSalary, deductionBreakdown, taxDeduction, otherDeductions, deductions, netPay };
}

// upsert-on-read: the singleton always exists after the first call, no
// separate seed/migration step needed — same pattern as
// callcenter/controllers/settings.controller.js's getSettings().
async function getOrCreatePayrollConfig() {
  return PayrollConfigModel.findOneAndUpdate({ _id: "singleton" }, {}, { new: true, upsert: true, setDefaultsOnInsert: true });
}

// Readable by anyone who can see Payroll at all (so HR understands what a
// number came from, and the client can compute a live preview before
// saving) — only WRITING the rules is Super-Admin-only, enforced at the
// route level, not here.
export const getPayrollConfigController = async (req, res) => {
  try {
    const config = await getOrCreatePayrollConfig();
    return res.json({ success: true, error: false, data: config });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const updatePayrollConfigController = async (req, res) => {
  try {
    const { rules } = req.body;
    if (!Array.isArray(rules)) {
      return res.status(400).json({ success: false, error: true, message: "rules must be an array" });
    }
    // Whitelist fields explicitly rather than trusting req.body's shape
    // directly — same mass-assignment discipline as pickEmployeeFields
    // above (only the fields this schema actually defines get through).
    const cleanRules = rules.map((r) => ({
      name: String(r?.name || "").trim().slice(0, 100),
      type: r?.type === "fixed" ? "fixed" : "percentage",
      value: Math.max(0, Number(r?.value) || 0),
      appliesTo: r?.appliesTo === "gross" ? "gross" : "basic",
      category: r?.category === "tax" ? "tax" : "other",
      enabled: r?.enabled !== false,
    })).filter((r) => r.name);

    const config = await PayrollConfigModel.findOneAndUpdate(
      { _id: "singleton" },
      { rules: cleanRules, updatedBy: req.userId },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return res.json({ success: true, error: false, data: config, message: "Tax & deduction rules saved" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ── Payroll ────────────────────────────────────────────────────
export const listPayrollController = async (req, res) => {
  try {
    const { month } = req.query; // "2026-07"
    const query = month ? { month } : {};
    const records = await PayrollRecordModel.find(query).populate("employeeId", "name designation department").sort({ createdAt: -1 });
    const safeRecords = maskFieldsForDemo(req.userRole, records, {
      baseSalary: maskAmount, bonus: maskAmount, overtime: maskAmount, allowances: maskAmount,
      grossSalary: maskAmount, taxDeduction: maskAmount, otherDeductions: maskAmount,
      deductions: maskAmount, netPay: maskAmount,
    });
    // maskFieldsForDemo only masks flat top-level fields (see its own
    // comment — this app's documents are otherwise all flat); without
    // this second pass a Demo Admin would see every OTHER amount
    // correctly zeroed while the real per-line figures inside
    // deductionBreakdown leaked through untouched. Names/categories stay
    // visible (not sensitive on their own), only the amount is masked,
    // same as every other amount field in this response.
    const fullySafeRecords = isDemoRole(req.userRole)
      ? safeRecords.map((r) => ({ ...r, deductionBreakdown: (r.deductionBreakdown || []).map((d) => ({ ...d, amount: 0 })) }))
      : safeRecords;
    return res.json({ success: true, error: false, data: fullySafeRecords });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const upsertPayrollController = async (req, res) => {
  try {
    const { employeeId, month, bonus = 0, overtime = 0, allowances = 0, adHocDeductions = [], status } = req.body;
    if (!employeeId || !month) {
      return res.status(400).json({ success: false, error: true, message: "employeeId and month are required" });
    }
    const employee = await EmployeeModel.findById(employeeId);
    if (!employee) return res.status(404).json({ success: false, error: true, message: "Employee not found" });

    const config = await getOrCreatePayrollConfig();
    const computed = calculatePayroll(employee.monthlySalary, { overtime, bonus, allowances, adHocDeductions }, config.rules);

    const record = await PayrollRecordModel.findOneAndUpdate(
      { employeeId, month },
      {
        ...computed,
        adHocDeductions: Array.isArray(adHocDeductions) ? adHocDeductions.filter((i) => i?.name?.trim() && Number(i.amount) > 0) : [],
        status,
        ...(status === "Paid" ? { paidAt: new Date() } : {}),
      },
      { new: true, upsert: true }
    );
    return res.json({ success: true, error: false, data: record, message: "Payroll saved" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ── Employee Digital File ─────────────────────────────────────────
// Advanced HRMS Features spec: "Each employee should have a complete
// digital personnel file... This becomes the employee's permanent
// digital record within the HRMS." One aggregating endpoint — the
// frontend drawer needs one loading state, not several racing fetches.
//
// Scope honesty (also stated inline in the UI, not just here): of the
// spec's 13 listed sections, this returns real data for Personal Info,
// Employment Details, Payroll & Tax History, Performance Reviews,
// Warnings, Promotions, and Training Records. Attendance and Generated/
// Uploaded Documents are legitimately empty — those are Phases E/C/D of
// the wider roadmap and don't exist yet. Leave History and a field-level
// Audit History for HR records were deliberately NOT built as part of
// this phase (no dedicated leave-approval workflow or employee-record
// change-log exists) — surfacing them as empty-but-present sections
// with an honest inline note, rather than silently omitting them or
// pretending an empty array means "no leave ever taken."
export const getEmployeeFileController = async (req, res) => {
  try {
    const { employeeId } = req.query;
    const employee = await EmployeeModel.findById(employeeId).populate("userId", "email role status");
    if (!employee) return res.status(404).json({ success: false, error: true, message: "Employee not found" });

    const [payrollHistory, events] = await Promise.all([
      PayrollRecordModel.find({ employeeId }).sort({ month: -1 }),
      EmployeeEventModel.find({ employeeId }).sort({ date: -1 }).populate("createdBy", "name"),
    ]);

    const safeEmployee = maskFieldsForDemo(req.userRole, employee, {
      monthlySalary: maskAmount, bankAccount: maskAccountNumber, email: maskEmail, phone: maskPhone,
    });
    const safePayroll = maskFieldsForDemo(req.userRole, payrollHistory, {
      baseSalary: maskAmount, bonus: maskAmount, overtime: maskAmount, allowances: maskAmount,
      grossSalary: maskAmount, taxDeduction: maskAmount, otherDeductions: maskAmount,
      deductions: maskAmount, netPay: maskAmount,
    });
    // Same nested-array masking gap as listPayrollController — see that
    // function's comment, identical reasoning applies here.
    const fullySafePayroll = isDemoRole(req.userRole)
      ? safePayroll.map((r) => ({ ...r, deductionBreakdown: (r.deductionBreakdown || []).map((d) => ({ ...d, amount: 0 })) }))
      : safePayroll;

    const byType = (t) => events.filter((e) => e.type === t);

    return res.json({
      success: true, error: false,
      data: {
        employee: safeEmployee,
        payrollHistory: fullySafePayroll,
        performanceReviews: byType("performance_review"),
        warnings: byType("warning"),
        promotions: byType("promotion"),
        training: byType("training"),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

const EVENT_TYPES = new Set(["performance_review", "warning", "promotion", "training"]);

export const addEmployeeEventController = async (req, res) => {
  try {
    const { employeeId, type, title, note, date } = req.body;
    if (!EVENT_TYPES.has(type)) {
      return res.status(400).json({ success: false, error: true, message: `type must be one of: ${[...EVENT_TYPES].join(", ")}` });
    }
    if (!title?.trim()) return res.status(400).json({ success: false, error: true, message: "Title is required" });
    const employeeExists = await EmployeeModel.exists({ _id: employeeId });
    if (!employeeExists) return res.status(404).json({ success: false, error: true, message: "Employee not found" });

    const event = await new EmployeeEventModel({
      employeeId, type, title: title.trim(), note: note?.trim() || "",
      date: date ? new Date(date) : new Date(),
      createdBy: req.userId,
    }).save();
    const populated = await event.populate("createdBy", "name");
    return res.status(201).json({ success: true, error: false, data: populated, message: "Added to employee file" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const deleteEmployeeEventController = async (req, res) => {
  try {
    const { _id } = req.body;
    await EmployeeEventModel.findByIdAndDelete(_id);
    return res.json({ success: true, error: false, message: "Removed" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
