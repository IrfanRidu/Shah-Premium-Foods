import { getChangeHistory, undoChange } from "../services/crmChangeLogService.js";

// Spec: "View audit logs" (Super Admin). Named getChangeHistoryController
// rather than "AuditLog" deliberately — this is the CRM's own field-level
// change history, a different thing from the pre-existing generic
// auditLog collection (see crmChangeLog.model.js's header comment).
export const getChangeHistoryController = async (req, res) => {
  try {
    const { entityType, entityId, limit } = req.query;
    const history = await getChangeHistory({ entityType, entityId, limit: limit ? Number(limit) : undefined });
    return res.json({ success: true, error: false, data: history });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Spec: "Super Admin should be able to restore previous values with one click."
export const undoChangeController = async (req, res) => {
  try {
    const { changeLogId } = req.body;
    const restored = await undoChange(changeLogId, req.userId);
    return res.json({ success: true, error: false, data: restored });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, error: true, message: err.message });
  }
};
