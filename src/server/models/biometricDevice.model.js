import mongoose from "mongoose";
import crypto from "crypto";

// Advanced HRMS Features spec: "Design the system so it can integrate
// with fingerprint scanners that expose SDKs or local APIs... The
// architecture should make it easy to support multiple biometric device
// vendors." No specific vendor/model was named, so this app can't
// contain real vendor SDK code (there's nothing concrete to integrate
// against) — instead, this is the RECEIVING side of a generic local-
// webhook contract: any vendor's terminal, or a small bridge script
// translating that vendor's local SDK/API into an HTTP POST, can call
// attendance.controller.js's fingerprintWebhookController as long as it
// authenticates with a registered device's apiKey. This document is
// that registration — what proves a given request actually came from a
// device HR has approved, not an arbitrary caller.
const biometricDeviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Main Entrance Fingerprint Scanner"
    deviceType: { type: String, enum: ["Fingerprint", "Facial Recognition", "Other"], default: "Fingerprint" },
    apiKey: { type: String, required: true, unique: true, default: () => crypto.randomBytes(24).toString("hex") },
    lastSeenAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.ObjectId, ref: "user", default: null },
  },
  { timestamps: true }
);

const BiometricDeviceModel = mongoose.models.biometricDevice || mongoose.model("biometricDevice", biometricDeviceSchema);
export default BiometricDeviceModel;
