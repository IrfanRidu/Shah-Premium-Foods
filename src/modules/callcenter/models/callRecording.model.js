import mongoose from "mongoose";

// Recording metadata for a call. The actual audio file lives on disk on
// the VPS (Asterisk's MixMonitor writes it there directly) — this
// document just tracks where it is and links it back to the CallLog.
// `isDeleted` is a soft flag, never a hard delete: spec explicitly says
// only a Super Admin can delete recordings, and "nothing should be
// deleted automatically."
const callRecordingSchema = new mongoose.Schema(
  {
    callLogId: { type: mongoose.Schema.ObjectId, ref: "callLog", required: true, index: true },
    filePath: { type: String, required: true }, // path on the VPS filesystem
    fileUrl: { type: String, default: "" }, // authenticated streaming URL, filled in by the API layer
    format: { type: String, default: "wav" },
    durationSeconds: { type: Number, default: 0 },
    fileSizeBytes: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
    deletedBy: { type: mongoose.Schema.ObjectId, ref: "user", default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const CallRecordingModel = mongoose.models.callRecording || mongoose.model("callRecording", callRecordingSchema);
export default CallRecordingModel;
