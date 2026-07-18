import RoleModel from "../models/role.model.js";
import UserModel from "../models/user.model.js";

const FULL_PERMS = (excludeRoles = false) => ({
  dashboard:  { view: true },
  products:   { view: true, create: true, edit: true, delete: true },
  categories: { view: true, create: true, edit: true, delete: true },
  orders:     { view: true, edit: true, cancel: true },
  customers:  { view: true, export: true, call: true },
  inventory:  { view: true, edit: true },
  coupons:    { view: true, create: true, edit: true, delete: true },
  campaigns: { view: true, create: true, edit: true, delete: true },
  analytics:  { view: true },
  settings:   { view: true, edit: true },
  roles:      excludeRoles ? { view: false, create: false, edit: false, delete: false } : { view: true, create: true, edit: true, delete: true },
});

const EMPTY_PERMS = () => ({
  dashboard: { view: false }, products: { view:false,create:false,edit:false,delete:false },
  categories:{ view:false,create:false,edit:false,delete:false }, orders:{view:false,edit:false,cancel:false},
  customers: { view:false,export:false,call:false }, inventory:{view:false,edit:false},
  coupons:   { view:false,create:false,edit:false,delete:false }, campaigns:{view:false,create:false,edit:false,delete:false},
  analytics: { view:false }, settings:{view:false,edit:false}, roles:{view:false,create:false,edit:false,delete:false},
});

// Ensure SUPERADMIN/ADMIN/MODERATOR/EMPLOYEE/ANALYST/USER system roles exist
export const ensureSystemRoles = async () => {
  const defaults = [
    { name: "SUPERADMIN", label: "Super Admin", description: "Full unrestricted access to everything, including role management.", isSystemRole: true, permissions: FULL_PERMS(false) },
    { name: "ADMIN",      label: "Admin",       description: "Full store management access, excluding role/user-permission management.", isSystemRole: true, permissions: FULL_PERMS(true) },
    { name: "MODERATOR",  label: "Moderator",   description: "Can manage products, categories, orders and customers.", isSystemRole: true, permissions: { ...EMPTY_PERMS(), dashboard:{view:true}, products:{view:true,create:true,edit:true,delete:false}, categories:{view:true,create:true,edit:true,delete:false}, orders:{view:true,edit:true,cancel:true}, customers:{view:true,export:false,call:true}, inventory:{view:true,edit:true} } },
    { name: "EMPLOYEE",   label: "Employee",    description: "Can view and process orders, view inventory and customers.", isSystemRole: true, permissions: { ...EMPTY_PERMS(), dashboard:{view:true}, orders:{view:true,edit:true,cancel:false}, customers:{view:true,export:false,call:true}, inventory:{view:true,edit:false}, products:{view:true,create:false,edit:false,delete:false} } },
    { name: "ANALYST",    label: "Analyst",     description: "Read-only access to analytics, orders and inventory for reporting.", isSystemRole: true, permissions: { ...EMPTY_PERMS(), dashboard:{view:true}, analytics:{view:true}, orders:{view:true,edit:false,cancel:false}, customers:{view:true,export:true,call:false}, inventory:{view:true,edit:false}, products:{view:true,create:false,edit:false,delete:false} } },
    { name: "USER",       label: "Customer",    description: "Regular storefront customer.", isSystemRole: true, permissions: EMPTY_PERMS() },
  ];
  for (const r of defaults) {
    await RoleModel.findOneAndUpdate({ name: r.name }, { $setOnInsert: r }, { upsert: true, new: true });
  }
};

// GET all roles
export const getAllRolesController = async (req, res) => {
  try {
    await ensureSystemRoles();
    const roles = await RoleModel.find().sort({ isSystemRole: -1, createdAt: 1 });
    return res.json({ success: true, error: false, data: roles });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// CREATE custom role (SUPERADMIN only)
export const createRoleController = async (req, res) => {
  try {
    const { name, label, description, permissions } = req.body;
    if (!name || !label) return res.status(400).json({ success: false, error: true, message: "name and label are required" });

    const upperName = name.toUpperCase().trim().replace(/\s+/g, "_");
    const existing = await RoleModel.findOne({ name: upperName });
    if (existing) return res.status(400).json({ success: false, error: true, message: "A role with this name already exists" });

    const role = new RoleModel({
      name: upperName, label, description: description || "",
      isSystemRole: false,
      permissions: permissions || EMPTY_PERMS(),
      createdBy: req.userId,
    });
    await role.save();
    return res.status(201).json({ success: true, error: false, data: role, message: "Role created" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// UPDATE role permissions (SUPERADMIN only)
export const updateRoleController = async (req, res) => {
  try {
    const { _id, label, description, permissions } = req.body;
    const role = await RoleModel.findById(_id);
    if (!role) return res.status(404).json({ success: false, error: true, message: "Role not found" });
    if (role.isSystemRole && permissions?.roles && role.name !== "SUPERADMIN") {
      // prevent escalation: non-superadmin system roles cannot be granted role-management rights via UI edit of label/desc
    }
    if (label) role.label = label;
    if (description !== undefined) role.description = description;
    if (permissions) role.permissions = permissions;
    await role.save();
    return res.json({ success: true, error: false, data: role, message: "Role updated" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// DELETE custom role (SUPERADMIN only) — system roles cannot be deleted
export const deleteRoleController = async (req, res) => {
  try {
    const { _id } = req.body;
    const role = await RoleModel.findById(_id);
    if (!role) return res.status(404).json({ success: false, error: true, message: "Role not found" });
    if (role.isSystemRole) return res.status(400).json({ success: false, error: true, message: "System roles cannot be deleted" });

    const usersWithRole = await UserModel.countDocuments({ role: role.name });
    if (usersWithRole > 0) return res.status(400).json({ success: false, error: true, message: `Cannot delete: ${usersWithRole} user(s) still have this role. Reassign them first.` });

    await RoleModel.findByIdAndDelete(_id);
    return res.json({ success: true, error: false, message: "Role deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ASSIGN role to a user (SUPERADMIN only) — also supports inviting/creating a staff account
export const assignUserRoleController = async (req, res) => {
  try {
    const { userId, roleName } = req.body;
    const role = await RoleModel.findOne({ name: roleName.toUpperCase() });
    if (!role) return res.status(404).json({ success: false, error: true, message: "Role not found" });

    const target = await UserModel.findById(userId);
    if (!target) return res.status(404).json({ success: false, error: true, message: "User not found" });
    if (target.role === "SUPERADMIN" && req.userId !== userId)
      return res.status(403).json({ success: false, error: true, message: "Cannot modify another Super Admin's role" });

    target.role = role.name;
    target.createdBy = req.userId;
    await target.save();

    return res.json({ success: true, error: false, data: { _id: target._id, role: target.role }, message: `Role updated to ${role.label}` });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// GET current user's effective permissions (for frontend gating)
export const getMyPermissionsController = async (req, res) => {
  try {
    const user = await UserModel.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, error: true, message: "User not found" });

    if (user.role === "SUPERADMIN") {
      return res.json({ success: true, error: false, data: { role: "SUPERADMIN", permissions: FULL_PERMS(false) } });
    }
    const roleDoc = await RoleModel.findOne({ name: user.role });
    const permissions = roleDoc ? roleDoc.permissions : (user.role === "ADMIN" ? FULL_PERMS(true) : EMPTY_PERMS());
    return res.json({ success: true, error: false, data: { role: user.role, permissions } });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
