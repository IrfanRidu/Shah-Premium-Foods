import AuditLogModel from "../models/auditLog.model.js";

// Section 13 (Admin Panel Security) — paginated, filterable read of the
// persisted audit trail (see models/auditLog.model.js /
// lib/apiObservability.js's logAuditEvent for how entries get here).
// SUPERADMIN-only at the route level (see api/audit-log/[...segments]/
// route.js) — an audit trail of what every admin did is itself sensitive
// enough that regular ADMIN accounts shouldn't be able to browse it,
// only the account that can't be demoted/removed by anyone else.
export const getAuditLogsController = async (req, res) => {
  try {
    const { userId, method, path, from, to } = req.query || {};
    // Mirrors the clamping already applied to pagination elsewhere in
    // this app (see apiObservability.js) — never trust a client-supplied
    // page size directly.
    const page  = Math.max(1, parseInt(req.query?.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query?.limit, 10) || 25));

    const filter = {};
    if (userId) filter.userId = userId;
    if (method) filter.method = method.toUpperCase();
    if (path)   filter.path = { $regex: path, $options: "i" };
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      AuditLogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("userId", "name email role")
        .lean(),
      AuditLogModel.countDocuments(filter),
    ]);

    return res.json({
      message: "Audit logs fetched successfully",
      error: false,
      success: true,
      data: logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};
