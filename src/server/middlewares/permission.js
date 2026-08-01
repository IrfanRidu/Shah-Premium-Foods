import UserModel from "../models/user.model.js";
import RoleModel from "../models/role.model.js";
import SiteSettingsModel from "../models/siteSettings.model.js";
import dataCache from "../../lib/cache.js";
import { getClientIpFromPlainHeaders } from "../../lib/security.js";
import { logSecurityEvent } from "../../lib/apiObservability.js";

const ADMIN_ROLES = new Set(["ADMIN", "SUPERADMIN"]);

// Section 13 (Admin Panel Security) — IP whitelist, admin-configurable via
// Site Settings → Security (dashboard/site-settings/page.jsx). Enforced
// HERE rather than in middleware.js on purpose: Middleware runs on the
// Edge runtime (a Next.js requirement, not a choice — noted elsewhere in
// this codebase too), and Edge can't use Mongoose to read whatever the
// admin saved. This file already does a fresh per-request `UserModel`
// lookup for role/permission checking below — the natural, already-
// paid-for integration point for a check that's specifically about
// admin-privileged actions, not the whole API surface. Customer-facing
// endpoints are completely untouched by this — a customer browsing from
// an arbitrary residential IP is not what this feature exists to guard
// against. Settings are read through the same TTL cache
// (lib/cache.js/"settings:main") every other settings read already uses,
// so this doesn't add a fresh DB hit to every single admin request.
async function enforceIpWhitelist(req, res, user) {
  if (!ADMIN_ROLES.has(user.role)) return true; // only gates admin-tier accounts

  const settings = await dataCache.getOrSet(
    "settings:main",
    () => SiteSettingsModel.findOne({ key: "main" }).lean(),
    dataCache.TTL.LONG
  );
  const { ipWhitelistEnabled, ipWhitelist } = settings?.security || {};
  if (!ipWhitelistEnabled || !Array.isArray(ipWhitelist) || ipWhitelist.length === 0) return true;

  const ip = getClientIpFromPlainHeaders(req.headers);
  if (ipWhitelist.includes(ip)) return true;

  logSecurityEvent({
    type: "ip_whitelist_blocked",
    severity: "warn",
    ip,
    path: req.url,
    method: req.method,
    details: { userId: user._id?.toString(), role: user.role },
  });
  res.status(403).json({
    message: "Admin access is restricted from this network. Contact a super admin if you believe this is a mistake.",
    error: true,
    success: false,
  });
  return false;
}

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

      // Checked before the SUPERADMIN early-return below — an IP
      // restriction is meant to apply to every admin-tier account
      // including SUPERADMIN, not be bypassed by the highest-privilege
      // role specifically.
      if (!(await enforceIpWhitelist(req, res, user))) return; // response already sent

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
    if (!(await enforceIpWhitelist(req, res, user))) return; // response already sent
    next();
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};
