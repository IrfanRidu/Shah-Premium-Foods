import NotificationModel from "../models/notification.model.js";
import RoleModel from "../models/role.model.js";
import UserModel from "../models/user.model.js";

const SUPER_ADMIN_ROLES = ["SUPERADMIN", "ADMIN"];

// Called from other controllers (order placement, ticket creation) — not
// exposed as its own route. Fire-and-forget: never let a notification
// failure block the actual action (an order must still succeed even if,
// say, the DB hiccups on this write).
export async function createNotification({ type, title, message = "", link = "", targetModule = "", relatedId = null }) {
  try {
    await new NotificationModel({ type, title, message, link, targetModule, relatedId }).save();
  } catch {
    // Deliberately swallowed — see comment above.
  }
}

// Figure out which targetModule values this user is allowed to see,
// mirroring the same permission logic used for sidebar links. The `auth`
// middleware only sets req.userId (not a role) — rather than touch that
// shared middleware (used by every authenticated route in the app) just
// for this feature, look the role up directly here.
async function allowedModulesFor(req) {
  const user = await UserModel.findById(req.userId).select("role");
  const roleName = user?.role;
  if (SUPER_ADMIN_ROLES.includes(roleName)) return null; // null = no filter, sees everything

  const role = await RoleModel.findOne({ name: roleName });
  if (!role) return []; // unknown/plain-USER role, no custom permissions — sees nothing admin-related
  const perms = role.toObject().permissions || {};
  return Object.entries(perms).filter(([, perm]) => perm?.view).map(([mod]) => mod);
}

export const listNotificationsController = async (req, res) => {
  try {
    const allowed = await allowedModulesFor(req);
    const query = allowed === null ? {} : { $or: [{ targetModule: "" }, { targetModule: { $in: allowed } }] };

    const [notifications, unreadCount] = await Promise.all([
      NotificationModel.find(query).sort({ createdAt: -1 }).limit(30),
      NotificationModel.countDocuments({ ...query, readBy: { $ne: req.userId } }),
    ]);

    return res.json({
      success: true, error: false,
      data: {
        notifications: notifications.map((n) => ({ ...n.toObject(), isRead: n.readBy.some((id) => id.toString() === req.userId) })),
        unreadCount,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const markNotificationReadController = async (req, res) => {
  try {
    const { _id } = req.body;
    await NotificationModel.findByIdAndUpdate(_id, { $addToSet: { readBy: req.userId } });
    return res.json({ success: true, error: false });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const markAllNotificationsReadController = async (req, res) => {
  try {
    const allowed = await allowedModulesFor(req);
    const query = allowed === null ? {} : { $or: [{ targetModule: "" }, { targetModule: { $in: allowed } }] };
    await NotificationModel.updateMany({ ...query, readBy: { $ne: req.userId } }, { $addToSet: { readBy: req.userId } });
    return res.json({ success: true, error: false });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
