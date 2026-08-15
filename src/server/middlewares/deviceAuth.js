import BiometricDeviceModel from "../models/biometricDevice.model.js";

// Same middleware shape as auth.js ((req,res,next), same failure-response
// format) but for a genuinely different caller: an external biometric
// device or its bridge script, which has no user session/JWT cookie at
// all — it authenticates with a per-device API key instead (see
// biometricDevice.model.js's own notes on why this is the receiving
// side of a generic webhook contract, not a specific vendor's SDK).
// Sets req.deviceId on success rather than req.userId — this route has
// no concept of "logged in as a user," so downstream code (the
// controller, audit logging) should not expect one.
//
// Does NOT need any special CSRF exemption to work: apiHandler.js's
// same-origin check (src/lib/security.js's isSameOriginRequest) already
// allows requests through when Origin/Referer are absent entirely —
// which is what an ordinary HTTP client (curl, a Python/Node bridge
// script, most vendor SDKs) sends by default, since those are browser-
// specific header conventions, not something a generic HTTP POST sets.
// Confirmed by reading that function before writing this, rather than
// assuming a webhook would need a bypass added.
const deviceAuth = async (req, res, next) => {
  try {
    const provided = req.headers?.authorization?.replace(/^Bearer\s+/i, "") || req.body?.apiKey;
    if (!provided) {
      return res.status(401).json({ message: "Missing device API key.", error: true, success: false });
    }
    const device = await BiometricDeviceModel.findOne({ apiKey: provided });
    if (!device) {
      return res.status(401).json({ message: "Unrecognized device API key.", error: true, success: false });
    }
    req.deviceId = device._id;
    BiometricDeviceModel.updateOne({ _id: device._id }, { lastSeenAt: new Date() }).catch(() => {}); // best-effort, never block the actual attendance marking on this
    next();
  } catch (error) {
    return res.status(401).json({ message: "Device authentication failed. " + (error.message || ""), error: true, success: false });
  }
};

export default deviceAuth;
