import bcryptjs from "bcryptjs";
import UserModel from "../models/user.model.js";
import RoleModel from "../models/role.model.js";
import { EmployeeModel } from "../models/employee.model.js";

const AGENT_ROLE_NAME = "CALL_CENTER_AGENT";

// Idempotent: makes sure a role scoped to customerCare-only access exists,
// so a call center agent's login can only ever reach the Customer Care
// dashboard (see checkPermission / dashboard sidebar filtering — a role
// with only customerCare granted naturally hides every other admin page).
async function ensureAgentRole() {
  let role = await RoleModel.findOne({ name: AGENT_ROLE_NAME });
  if (!role) {
    role = await new RoleModel({
      name: AGENT_ROLE_NAME,
      label: "Call Center Agent",
      description: "Restricted role: Customer Care dashboard only (view orders, update order status, call customers).",
      isSystemRole: true,
      permissions: {
        customerCare: { view: true, edit: true },
      },
    }).save();
  }
  return role;
}

// List every employee flagged as a call center agent, with their login
// status and role.
export const listCallCenterAgentsController = async (req, res) => {
  try {
    const agents = await EmployeeModel.find({ isCallCenterAgent: true })
      .populate("userId", "name email role status")
      .sort({ createdAt: -1 });
    return res.json({ success: true, error: false, data: agents });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Create a call center agent. Two modes:
//  - createLogin: true  -> also creates a User account (email + temp password)
//                           with the CALL_CENTER_AGENT role, linked via userId
//  - createLogin: false -> employee-only record (e.g. a temp agent who
//                           shares another agent's login, or hasn't been
//                           onboarded to the dashboard yet)
export const createCallCenterAgentController = async (req, res) => {
  try {
    const { name, email, phone, password, createLogin } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: true, message: "Name is required" });
    }

    let userId = null;
    let tempPassword = null;

    if (createLogin) {
      if (!email?.trim()) {
        return res.status(400).json({ success: false, error: true, message: "Email is required to create a login" });
      }
      const existing = await UserModel.findOne({ email: email.trim().toLowerCase() });
      if (existing) {
        return res.status(400).json({ success: false, error: true, message: "That email is already registered to a user" });
      }

      await ensureAgentRole();

      tempPassword = password?.trim() || Math.random().toString(36).slice(-10);
      const salt = await bcryptjs.genSalt(10);
      const hashedPassword = await bcryptjs.hash(tempPassword, salt);

      const newUser = await new UserModel({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        mobile: phone || null,
        verify_email: true, // staff account created directly by an admin — skip the customer email-OTP flow
        status: "Active",
        role: AGENT_ROLE_NAME,
        createdBy: req.userId,
      }).save();
      userId = newUser._id;
    }

    const employee = await new EmployeeModel({
      name: name.trim(),
      email: email?.trim() || "",
      phone: phone || "",
      designation: "Call Center Agent",
      department: "Customer Care",
      isCallCenterAgent: true,
      userId,
    }).save();

    return res.status(201).json({
      success: true, error: false, data: employee,
      // Only returned once, at creation time — never stored or re-shown, same as any "first login" temp password.
      tempPassword: createLogin ? tempPassword : undefined,
      message: "Call center agent added",
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const updateCallCenterAgentController = async (req, res) => {
  try {
    const { _id, name, email, phone, status } = req.body;
    const employee = await EmployeeModel.findById(_id);
    if (!employee) return res.status(404).json({ success: false, error: true, message: "Agent not found" });

    if (name) employee.name = name.trim();
    if (email !== undefined) employee.email = email.trim();
    if (phone !== undefined) employee.phone = phone;
    if (status) employee.status = status;
    await employee.save();

    // Keep the linked login's active/inactive state in sync with the employee record
    if (employee.userId && status) {
      await UserModel.findByIdAndUpdate(employee.userId, {
        status: status === "Terminated" ? "Suspended" : "Active",
      });
    }

    return res.json({ success: true, error: false, data: employee, message: "Agent updated" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const deleteCallCenterAgentController = async (req, res) => {
  try {
    const { _id } = req.body;
    const employee = await EmployeeModel.findById(_id);
    if (!employee) return res.status(404).json({ success: false, error: true, message: "Agent not found" });

    // Suspend rather than delete the linked login, so past order status-change
    // history (changedBy references) stays attributable.
    if (employee.userId) {
      await UserModel.findByIdAndUpdate(employee.userId, { status: "Suspended" });
    }
    await EmployeeModel.findByIdAndDelete(_id);

    return res.json({ success: true, error: false, message: "Agent removed" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
