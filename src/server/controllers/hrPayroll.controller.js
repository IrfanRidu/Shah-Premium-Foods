import crypto from "crypto";
import bcryptjs from "bcryptjs";
import UserModel from "../models/user.model.js";
import RoleModel from "../models/role.model.js";
import { EmployeeModel, PayrollRecordModel } from "../models/employee.model.js";
import { maskFieldsForDemo, maskAccountNumber, maskAmount, maskEmail, maskPhone } from "../utils/demoMask.js";

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
// new login, never invent one. CALL_CENTER_AGENT is deliberately excluded
// here — it already has its own dedicated, polished provisioning flow
// (see callCenterAgent.controller.js / the Customer Care page); adding a
// second way to create the exact same role would just create confusion
// about which one to use.
const PROVISIONABLE_ROLES = new Set(["HR", "MANAGER", "STAFF", "ANALYST"]);

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

    const employee = await new EmployeeModel({
      ...pickEmployeeFields(rest),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone || "",
      designation: designation || roleName,
      department: department || "Staff",
      userId: newUser._id,
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
    return res.json({ success: true, error: false, message: "Employee removed" });
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
      baseSalary: maskAmount, bonus: maskAmount, deductions: maskAmount, netPay: maskAmount,
    });
    return res.json({ success: true, error: false, data: safeRecords });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const upsertPayrollController = async (req, res) => {
  try {
    const { employeeId, month, baseSalary, bonus = 0, deductions = 0, status } = req.body;
    const netPay = Number(baseSalary || 0) + Number(bonus || 0) - Number(deductions || 0);
    const record = await PayrollRecordModel.findOneAndUpdate(
      { employeeId, month },
      { baseSalary, bonus, deductions, netPay, status, ...(status === "Paid" ? { paidAt: new Date() } : {}) },
      { new: true, upsert: true }
    );
    return res.json({ success: true, error: false, data: record, message: "Payroll saved" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
