import CrmSettingsModel from "../models/crmSettings.model.js";

export async function getSettings() {
  // upsert-on-read: the singleton always exists after the first call,
  // no separate seed script needed.
  return CrmSettingsModel.findOneAndUpdate({ _id: "singleton" }, {}, { new: true, upsert: true, setDefaultsOnInsert: true });
}

export const getSettingsController = async (req, res) => {
  try {
    const settings = await getSettings();
    return res.json({ success: true, error: false, data: settings });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const updateSettingsController = async (req, res) => {
  try {
    const { ringTimeoutSeconds, holdMusicClass, maxQueueSize } = req.body;
    const update = { updatedBy: req.userId };
    if (ringTimeoutSeconds !== undefined) update.ringTimeoutSeconds = Math.max(5, Math.min(120, Number(ringTimeoutSeconds)));
    if (holdMusicClass !== undefined) update.holdMusicClass = String(holdMusicClass).trim() || "default";
    if (maxQueueSize !== undefined) update.maxQueueSize = Math.max(1, Number(maxQueueSize));

    const settings = await CrmSettingsModel.findOneAndUpdate({ _id: "singleton" }, update, { new: true, upsert: true, setDefaultsOnInsert: true });
    return res.json({ success: true, error: false, data: settings });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
