import mongoose from "mongoose";

// Singleton document (always _id: "singleton") — Super Admin: "Change
// routing settings. Configure queues. Manage hold music." Read live by
// ariClient.js at the start of each incoming call (see that file's
// getRoutingSettings()), not just once at process startup, so changes
// here take effect immediately without restarting the telephony service.
const crmSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "singleton" },
    ringTimeoutSeconds: { type: Number, default: 20, min: 5, max: 120 },
    // References an Asterisk MOH (Music On Hold) class name from
    // musiconhold.conf on the VPS — actually adding/uploading the audio
    // files themselves happens there (a real audio-file upload/transcode
    // pipeline is out of scope here; see the inline help text in the
    // settings page for exactly where this points to).
    holdMusicClass: { type: String, default: "default" },
    maxQueueSize: { type: Number, default: 20, min: 1 },
    updatedBy: { type: mongoose.Schema.ObjectId, ref: "user", default: null },
  },
  { timestamps: true }
);

const CrmSettingsModel = mongoose.models.crmSettings || mongoose.model("crmSettings", crmSettingsSchema);
export default CrmSettingsModel;
