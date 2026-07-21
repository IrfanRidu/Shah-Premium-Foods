import { EmployeeModel, PayrollRecordModel } from "../models/employee.model.js";

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
    const employees = await EmployeeModel.find(query).sort({ createdAt: -1 });
    const totalMonthlySalary = employees.filter((e) => e.status === "Active").reduce((s, e) => s + (e.monthlySalary || 0), 0);
    return res.json({ success: true, error: false, data: { employees, totalMonthlySalary } });
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
    return res.json({ success: true, error: false, data: records });
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
