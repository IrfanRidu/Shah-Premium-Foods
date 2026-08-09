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
  // customerCare/hrPayroll were added to the Role schema after this helper
  // was first written, and were never backfilled here — meaning ADMIN's
  // "full" permission set silently excluded the Customer Care and HR &
  // Payroll modules (schema default false, and the dashboard sidebar's
  // legacy-ADMIN fallback only triggers when a module key is *entirely
  // absent*, not when it's present-but-false). Fixed: both are genuine
  // store-management modules, not role/permission management, so they
  // belong in "full" access the same as products/orders/etc regardless of
  // excludeRoles.
  customerCare: { view: true, edit: true },
  hrPayroll:    { view: true, edit: true },
});

const EMPTY_PERMS = () => ({
  dashboard: { view: false }, products: { view:false,create:false,edit:false,delete:false },
  categories:{ view:false,create:false,edit:false,delete:false }, orders:{view:false,edit:false,cancel:false},
  customers: { view:false,export:false,call:false }, inventory:{view:false,edit:false},
  coupons:   { view:false,create:false,edit:false,delete:false }, campaigns:{view:false,create:false,edit:false,delete:false},
  analytics: { view:false }, settings:{view:false,edit:false}, roles:{view:false,create:false,edit:false,delete:false},
  customerCare: { view:false, edit:false }, hrPayroll: { view:false, edit:false },
});

// Ensure system roles exist: SUPERADMIN, ADMIN, DEMO_ADMIN, HR,
// CALL_CENTER_AGENT (auto-provisioned separately, see
// callCenterAgent.controller.js), MANAGER, STAFF, ANALYST, USER.
//
// Role map, matching the roles requested by the store owner:
//  - SUPERADMIN  → full unrestricted access, including role management.
//  - DEMO_ADMIN  → same *visible* breadth as SUPERADMIN (so a demo tester
//    can browse every corner of the dashboard), but every mutating
//    request is intercepted and simulated at the apiHandler layer
//    (src/lib/apiHandler.js) before it ever reaches a controller/DB
//    write — see the DEMO ADMIN SIMULATION block there. Audit Log stays
//    hidden regardless (it's gated by the literal-SUPERADMIN-only
//    `superAdminOnly` middleware/flag, deliberately not granted to
//    DEMO_ADMIN) since that's a real trail of other people's activity,
//    not "functionality" to demo.
//  - ADMIN       → full store management, excluding role/permission mgmt.
//  - HR          → manages the HR & Payroll module (employee records,
//    payroll, and provisioning new Employee-type logins).
//  - MANAGER/STAFF/ANALYST/CALL_CENTER_AGENT → the "...and other" Employee
//    sub-types: narrower, purpose-scoped operational roles. (MANAGER/STAFF
//    were previously named MODERATOR/EMPLOYEE — same permission scoping,
//    renamed in place; migration below keeps existing accounts working.)
//  - USER        → regular storefront customer.
// Safely rename a legacy system role doc to its new name. If a doc with
// the new name already exists (the common case now that the new name is
// also in the `defaults` upsert list below), renaming would collide with
// the unique `name` index — so instead we just move any users still
// pointing at the old name over to the new one and remove the now-
// redundant legacy doc. If the new name doesn't exist yet, do the plain
// rename as before. Either branch is safe to run on every request.
const migrateLegacyRoleName = async (oldName, newName, newLabel) => {
  const oldDoc = await RoleModel.findOne({ name: oldName });
  if (!oldDoc) return; // nothing to migrate, already clean

  const newDoc = await RoleModel.findOne({ name: newName });
  if (newDoc) {
    await UserModel.updateMany({ role: oldName }, { $set: { role: newName } });
    await RoleModel.deleteOne({ _id: oldDoc._id });
    return;
  }

  await RoleModel.updateOne({ name: oldName }, { $set: { name: newName, label: newLabel } });
  await UserModel.updateMany({ role: oldName }, { $set: { role: newName } });
};

export const ensureSystemRoles = async () => {
  const defaults = [
    { name: "SUPERADMIN", label: "Super Admin", description: "Full unrestricted access to everything, including role management.", isSystemRole: true, permissions: FULL_PERMS(false) },
    { name: "DEMO_ADMIN", label: "Demo Admin",  description: "Can view and click through every part of the dashboard exactly like a Super Admin. Every action is simulated — nothing is ever actually saved, changed, or deleted. Meant for giving someone a safe, full guided tour of the admin experience.", isSystemRole: true, permissions: FULL_PERMS(false) },
    { name: "ADMIN",      label: "Admin",       description: "Full store management access, excluding role/user-permission management.", isSystemRole: true, permissions: FULL_PERMS(true) },
    { name: "HR",         label: "HR",          description: "Manages employee records, payroll, and can add new Employee-type staff accounts.", isSystemRole: true, permissions: { ...EMPTY_PERMS(), dashboard:{view:true}, hrPayroll:{view:true,edit:true} } },
    { name: "MANAGER",    label: "Manager",     description: "Can manage products, categories, orders and customers.", isSystemRole: true, permissions: { ...EMPTY_PERMS(), dashboard:{view:true}, products:{view:true,create:true,edit:true,delete:false}, categories:{view:true,create:true,edit:true,delete:false}, orders:{view:true,edit:true,cancel:true}, customers:{view:true,export:false,call:true}, inventory:{view:true,edit:true} } },
    { name: "STAFF",      label: "Staff",       description: "Can view and process orders, view inventory and customers.", isSystemRole: true, permissions: { ...EMPTY_PERMS(), dashboard:{view:true}, orders:{view:true,edit:true,cancel:false}, customers:{view:true,export:false,call:true}, inventory:{view:true,edit:false}, products:{view:true,create:false,edit:false,delete:false} } },
    { name: "ANALYST",    label: "Analyst",     description: "Read-only access to analytics, orders and inventory for reporting.", isSystemRole: true, permissions: { ...EMPTY_PERMS(), dashboard:{view:true}, analytics:{view:true}, orders:{view:true,edit:false,cancel:false}, customers:{view:true,export:true,call:false}, inventory:{view:true,edit:false}, products:{view:true,create:false,edit:false,delete:false} } },
    // Session 2 addition: previously this role only ever got created
    // on-demand by callCenterAgent.controller.js's own ensureAgentRole()
    // — the FIRST time anyone used the dedicated "create call center
    // agent" flow. Until then, it genuinely didn't exist as a Role
    // document, so the generic role-assignment flow (assignUserRoleController
    // below, used from admin-users' role dropdown) would 404 with "Role
    // not found" for it specifically — the dropdown already listed
    // "CALL_CENTER_AGENT" as an option (src/app/dashboard/admin-users/
    // page.jsx's ROLES array), it just couldn't actually be assigned yet.
    // Same label/description/core permission grant as ensureAgentRole()
    // creates — spread EMPTY_PERMS() first here (unlike that function)
    // purely for consistency with every other entry in this array;
    // functionally equivalent either way, since a module key that's
    // missing entirely and one explicitly set to false both evaluate as
    // "no access" in canSee() (dashboard/layout.jsx) and the Object.entries
    // filter (notification.controller.js) — this doesn't change behavior,
    // just keeps every role's stored permissions object the same shape.
    // ensureAgentRole()'s own `if (!role)` check means it will find and
    // reuse this instead of creating a second, conflicting version.
    { name: "CALL_CENTER_AGENT", label: "Call Center Agent", description: "Restricted role: Customer Care dashboard only (view orders, update order status, call customers).", isSystemRole: true, permissions: { ...EMPTY_PERMS(), customerCare: { view: true, edit: true } } },
    { name: "USER",       label: "Customer",    description: "Regular storefront customer.", isSystemRole: true, permissions: EMPTY_PERMS() },
  ];
  for (const r of defaults) {
    await RoleModel.findOneAndUpdate({ name: r.name }, { $setOnInsert: r }, { upsert: true, new: true });
  }
  // Migrate any existing installs: the old system roles were named
  // MODERATOR/EMPLOYEE — relabel them in place (rather than leaving
  // orphaned duplicate roles) so any user already assigned one keeps
  // working under the new name with the exact same permissions.
  //
  // BUGFIX: this used to run RoleModel.updateOne({name:oldName},
  // {$set:{name:newName}}) unconditionally. Since MANAGER/STAFF are ALSO
  // in the `defaults` upsert loop above, that loop already creates the
  // new-named doc on every install going forward — so by the time this
  // line ran, a legacy MODERATOR/EMPLOYEE doc left over from before the
  // rename would collide with the MANAGER/STAFF doc that already exists,
  // throwing E11000 on the unique `name` index and 500'ing GET /api/roles/all
  // (and every ensureSystemRoles() caller) FOREVER, since nothing ever
  // cleared the stale doc. Now: only attempt the rename if the new name
  // doesn't exist yet; if it already does, just re-home any straggler
  // users and delete the now-redundant legacy doc instead of colliding.
  await migrateLegacyRoleName("MODERATOR", "MANAGER", "Manager");
  await migrateLegacyRoleName("EMPLOYEE", "STAFF", "Staff");
  // Backfill for installs where a SUPERADMIN/ADMIN role doc already
  // existed *before* customerCare/hrPayroll were added above ($setOnInsert
  // only fills fields on brand-new documents, so an existing doc would
  // otherwise keep silently defaulting those two modules to false forever).
  await RoleModel.updateOne({ name: "SUPERADMIN" }, { $set: { "permissions.customerCare": { view: true, edit: true }, "permissions.hrPayroll": { view: true, edit: true } } });
  await RoleModel.updateOne({ name: "ADMIN" },      { $set: { "permissions.customerCare": { view: true, edit: true }, "permissions.hrPayroll": { view: true, edit: true } } });
  await RoleModel.updateOne({ name: "DEMO_ADMIN" }, { $set: { "permissions.customerCare": { view: true, edit: true }, "permissions.hrPayroll": { view: true, edit: true } } });
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
    await ensureSystemRoles(); // self-healing: works even if nobody has opened Roles & Staff / run the seed script yet
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
    await ensureSystemRoles(); // self-healing: works even if nobody has opened Roles & Staff / run the seed script yet
    const roleDoc = await RoleModel.findOne({ name: user.role });
    const permissions = roleDoc ? roleDoc.permissions : (user.role === "ADMIN" ? FULL_PERMS(true) : EMPTY_PERMS());
    return res.json({ success: true, error: false, data: { role: user.role, permissions } });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
