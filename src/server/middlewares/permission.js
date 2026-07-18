import UserModel from "../models/user.model.js";
import RoleModel from "../models/role.model.js";

/**
 * checkPermission("products", "create")
 * - SUPERADMIN always passes
 * - Legacy "ADMIN" role with no matching Role doc falls back to full access
 *   (keeps old seeded admins working before they assign a formal role doc)
 * - Everyone else needs an explicit Role document granting permissions[module][action]
 */
export const checkPermission = (module, action = "view") => {
  return async (req, res, next) => {
    try {
      const userId = req.userId;
      const user = await UserModel.findById(userId);

      if (!user) {
        return res.status(401).json({ message: "Unauthorized", error: true, success: false });
      }
      if (user.status !== "Active") {
        return res.status(403).json({ message: "Account is not active", error: true, success: false });
      }

      if (user.role === "SUPERADMIN") {
        req.userRole = user.role;
        return next();
      }

      const roleDoc = await RoleModel.findOne({ name: user.role });

      // Legacy fallback: plain "ADMIN" with no custom role doc gets full access
      if (!roleDoc) {
        if (user.role === "ADMIN") {
          req.userRole = user.role;
          return next();
        }
        return res.status(403).json({ message: "Permission denied. No role assigned.", error: true, success: false });
      }

      const modulePerm = roleDoc.permissions?.[module];
      const allowed = modulePerm?.[action] === true;

      if (!allowed) {
        return res.status(403).json({
          message: `Permission denied. You do not have ${action} access to ${module}.`,
          error: true,
          success: false,
        });
      }

      req.userRole = user.role;
      req.rolePermissions = roleDoc.permissions;
      next();
    } catch (error) {
      return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
    }
  };
};

// Strict: only the SUPERADMIN account can pass
export const superAdminOnly = async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.userId);
    if (!user || user.role !== "SUPERADMIN") {
      return res.status(403).json({ message: "Permission denied. Super Admin access only.", error: true, success: false });
    }
    next();
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};
