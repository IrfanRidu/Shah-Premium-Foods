import mongoose from "mongoose";
import CrmChangeLogModel from "../models/crmChangeLog.model.js";
import OrderModel from "../../../server/models/order.model.js";
import CallLogModel from "../../../server/models/callLog.model.js";
import CallbackModel from "../models/callback.model.js";

// Which model a given entityType reverts against. Kept as a lookup here
// (rather than in the model file) so the model stays a pure schema and
// this stays the one place that knows how to actually apply an undo.
const ENTITY_MODELS = {
  order: OrderModel,
  callLog: CallLogModel,
  callback: CallbackModel,
};

// Records a field-level change. Call this AFTER the change has already
// been saved (previousValue/newValue are both known at that point) —
// mirrors how the existing order.model.js statusHistory is appended.
export async function logChange({ entityType, entityId, action, field = "", previousValue = null, newValue = null, performedBy }) {
  return CrmChangeLogModel.create({ entityType, entityId, action, field, previousValue, newValue, performedBy });
}

// Super Admin one-click undo (spec: "restore previous values with one
// click"). Reverts the single field this log entry recorded, then logs
// the undo itself as a NEW change-log entry (spec: "never permanently
// overwrite important data" — the fact that an undo happened is itself
// preserved, not just silently applied).
export async function undoChange(changeLogId, undoneBy) {
  const entry = await CrmChangeLogModel.findById(changeLogId);
  if (!entry) throw Object.assign(new Error("Change not found"), { status: 404 });
  if (entry.isUndone) throw Object.assign(new Error("This change was already undone"), { status: 400 });
  if (!entry.field) throw Object.assign(new Error("This change has no single field to revert"), { status: 400 });

  const Model = ENTITY_MODELS[entry.entityType];
  if (!Model) throw Object.assign(new Error(`Cannot undo entityType "${entry.entityType}"`), { status: 400 });

  const doc = await Model.findById(entry.entityId);
  if (!doc) throw Object.assign(new Error("The original record no longer exists"), { status: 404 });

  setDeepField(doc, entry.field, entry.previousValue);
  await doc.save();

  entry.isUndone = true;
  entry.undoneBy = undoneBy;
  entry.undoneAt = new Date();
  await entry.save();

  // The undo itself is a change too — logged so the full back-and-forth
  // stays visible, never just silently reverted with no trace.
  await logChange({
    entityType: entry.entityType, entityId: entry.entityId, action: "field_update",
    field: entry.field, previousValue: entry.newValue, newValue: entry.previousValue,
    performedBy: undoneBy,
  });

  return doc;
}

// Supports simple dot-paths ("followUp.date") since several of the
// fields this needs to revert (Order.followUp.*) are nested.
function setDeepField(doc, path, value) {
  const parts = path.split(".");
  let target = doc;
  for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
  target[parts[parts.length - 1]] = value;
  doc.markModified(parts[0]);
}

export async function getChangeHistory({ entityType, entityId, limit = 50 } = {}) {
  const query = {};
  if (entityType) query.entityType = entityType;
  if (entityId) query.entityId = new mongoose.Types.ObjectId(entityId);
  return CrmChangeLogModel.find(query).sort({ createdAt: -1 }).limit(limit).populate("performedBy", "name email").populate("undoneBy", "name email");
}
