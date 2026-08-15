import "server-only";
import AttendanceModel from "../models/attendance.model.js";
import BiometricDeviceModel from "../models/biometricDevice.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { markCheckIn, markCheckOut, matchFace, computeWorkMinutes, todayString } from "../services/attendanceService.js";

// ── Employee self-service ──────────────────────────────────────
// Advanced HRMS Features spec: "Manual Check-In / Manual Check-Out."
// Deliberately NOT gated by hrPayroll permission — this is someone
// marking THEIR OWN attendance, not an HR management action, so any
// authenticated user with an Employee record linked to their account
// can reach these three endpoints regardless of role.
async function findMyEmployeeRecord(userId) {
  return EmployeeModel.findOne({ userId, status: "Active" });
}

export const selfCheckInController = async (req, res) => {
  try {
    const employee = await findMyEmployeeRecord(req.userId);
    if (!employee) return res.status(404).json({ success: false, error: true, message: "No employee record is linked to your account." });
    const record = await markCheckIn(employee._id, { method: "Manual" });
    return res.json({ success: true, error: false, data: record, message: "Checked in" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const selfCheckOutController = async (req, res) => {
  try {
    const employee = await findMyEmployeeRecord(req.userId);
    if (!employee) return res.status(404).json({ success: false, error: true, message: "No employee record is linked to your account." });
    const record = await markCheckOut(employee._id, { method: "Manual" });
    if (!record) return res.status(400).json({ success: false, error: true, message: "You haven't checked in today yet." });
    return res.json({ success: true, error: false, data: record, message: "Checked out" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const getMyAttendanceController = async (req, res) => {
  try {
    const employee = await findMyEmployeeRecord(req.userId);
    if (!employee) return res.json({ success: true, error: false, data: { isEmployee: false, employee: null, today: null, history: [] } });
    const [today, history] = await Promise.all([
      AttendanceModel.findOne({ employeeId: employee._id, date: todayString() }),
      AttendanceModel.find({ employeeId: employee._id }).sort({ date: -1 }).limit(30),
    ]);
    return res.json({
      success: true, error: false,
      data: { isEmployee: true, employee: { _id: employee._id, name: employee.name, faceEnrolled: !!employee.faceEnrolledAt, fingerprintEnrolled: !!employee.fingerprintEnrolledAt }, today, history },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ── HR management ───────────────────────────────────────────────
export const getAttendanceOverviewController = async (req, res) => {
  try {
    const date = req.query?.date || todayString();
    const [employees, records] = await Promise.all([
      EmployeeModel.find({ status: "Active" }).select("name designation department").sort({ name: 1 }),
      AttendanceModel.find({ date }),
    ]);
    const byEmployee = {};
    records.forEach((r) => { byEmployee[r.employeeId.toString()] = r; });
    const rows = employees.map((emp) => ({ employee: emp, attendance: byEmployee[emp._id.toString()] || null }));
    return res.json({ success: true, error: false, data: { date, rows } });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Spec: "If biometric hardware is unavailable, manual attendance must
// continue to work" — read by this session as including HR's ability
// to add a forgotten check-in or correct a mistaken one, not just an
// employee's own self-service buttons. Upserts (creates the day's
// record if it doesn't exist yet) so HR can backfill a missed day.
export const manualAttendanceOverrideController = async (req, res) => {
  try {
    const { employeeId, date, checkIn, checkOut } = req.body;
    if (!employeeId || !date) return res.status(400).json({ success: false, error: true, message: "employeeId and date are required" });

    const update = { markedBy: req.userId };
    if (checkIn !== undefined) { update.checkIn = checkIn ? new Date(checkIn) : null; update.checkInMethod = checkIn ? "Manual" : null; }
    if (checkOut !== undefined) { update.checkOut = checkOut ? new Date(checkOut) : null; update.checkOutMethod = checkOut ? "Manual" : null; }

    const existing = await AttendanceModel.findOne({ employeeId, date });
    const finalCheckIn = checkIn !== undefined ? update.checkIn : existing?.checkIn;
    const finalCheckOut = checkOut !== undefined ? update.checkOut : existing?.checkOut;
    update.workMinutes = computeWorkMinutes(finalCheckIn, finalCheckOut);

    const record = await AttendanceModel.findOneAndUpdate({ employeeId, date }, { $set: update }, { new: true, upsert: true });
    return res.json({ success: true, error: false, data: record, message: "Attendance updated" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Employee File drawer's "Attendance" section.
export const getEmployeeAttendanceHistoryController = async (req, res) => {
  try {
    const { employeeId, month } = req.query; // month: "2026-08", optional
    const query = { employeeId };
    if (month) query.date = { $regex: `^${month}` };
    const records = await AttendanceModel.find(query).sort({ date: -1 }).limit(60);
    return res.json({ success: true, error: false, data: records });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ── Facial recognition ──────────────────────────────────────────
// Advanced HRMS Features spec: "Employee face enrollment... Allow HR to
// re-enroll employees." The actual descriptor EXTRACTION (photo -> 128
// numbers) happens in the browser via face-api.js — this just stores
// what the browser already computed. Re-enrolling simply overwrites the
// old descriptor (see employee.model.js's own note on why no history of
// prior descriptors is kept).
export const enrollFaceController = async (req, res) => {
  try {
    const { employeeId, descriptor } = req.body;
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({ success: false, error: true, message: "Invalid face descriptor — expected 128 numbers from face-api.js." });
    }
    await EmployeeModel.findByIdAndUpdate(employeeId, { faceDescriptor: descriptor, faceEnrolledAt: new Date() });
    return res.json({ success: true, error: false, message: "Face enrolled" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Spec: "Attendance only after successful verification." The browser
// sends a freshly-captured descriptor + which employee is claiming to
// check in/out; this compares it against that employee's stored
// enrollment and only marks attendance if it's actually a match — an
// unrecognized face never reaches markCheckIn/markCheckOut at all.
export const verifyFaceController = async (req, res) => {
  try {
    const { employeeId, descriptor, action } = req.body; // action: "checkin" | "checkout"
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({ success: false, error: true, message: "Invalid face descriptor." });
    }
    const employee = await EmployeeModel.findById(employeeId).select("faceDescriptor name");
    if (!employee?.faceDescriptor?.length) {
      return res.status(400).json({ success: false, error: true, message: "This employee hasn't enrolled facial recognition yet." });
    }
    const result = matchFace(descriptor, employee.faceDescriptor);
    if (!result.isMatch) {
      return res.status(401).json({ success: false, error: true, message: "Face not recognized.", data: { distance: result.distance, confidence: result.confidence } });
    }
    const record = action === "checkout"
      ? await markCheckOut(employeeId, { method: "Facial Recognition", confidence: result.confidence })
      : await markCheckIn(employeeId, { method: "Facial Recognition", confidence: result.confidence });
    return res.json({ success: true, error: false, data: { record, confidence: result.confidence }, message: `Verified — ${employee.name}` });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ── Fingerprint ──────────────────────────────────────────────────
// Spec: "Design the system so it can integrate with fingerprint
// scanners that expose SDKs or local APIs." This app never receives or
// stores a raw fingerprint template — enrollment here means "HR tells
// this app which device-issued template ID corresponds to which
// employee," which the actual capture step (on the vendor's own
// hardware/SDK) happens entirely outside this app.
export const enrollFingerprintController = async (req, res) => {
  try {
    const { employeeId, fingerprintTemplateId } = req.body;
    if (!fingerprintTemplateId?.trim()) return res.status(400).json({ success: false, error: true, message: "fingerprintTemplateId is required" });
    await EmployeeModel.findByIdAndUpdate(employeeId, { fingerprintTemplateId: fingerprintTemplateId.trim(), fingerprintEnrolledAt: new Date() });
    return res.json({ success: true, error: false, message: "Fingerprint template linked" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Called by a registered device/bridge script (see deviceAuth.js), not
// a logged-in dashboard user — req.userId does not exist on this
// request, req.deviceId does.
export const fingerprintWebhookController = async (req, res) => {
  try {
    const { fingerprintTemplateId, action, confidence } = req.body;
    if (!fingerprintTemplateId) return res.status(400).json({ success: false, error: true, message: "fingerprintTemplateId is required" });
    const employee = await EmployeeModel.findOne({ fingerprintTemplateId });
    if (!employee) return res.status(404).json({ success: false, error: true, message: "No employee is enrolled with this fingerprint template." });

    const record = action === "checkout"
      ? await markCheckOut(employee._id, { method: "Fingerprint", confidence: confidence ?? null })
      : await markCheckIn(employee._id, { method: "Fingerprint", confidence: confidence ?? null });
    return res.json({ success: true, error: false, data: record });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ── Device management (Super Admin) ───────────────────────────────
const maskApiKey = (key) => `${key.slice(0, 6)}...${key.slice(-4)}`;

export const listDevicesController = async (req, res) => {
  try {
    const devices = await BiometricDeviceModel.find().sort({ createdAt: -1 });
    const safe = devices.map((d) => ({ ...d.toObject(), apiKey: maskApiKey(d.apiKey) }));
    return res.json({ success: true, error: false, data: safe });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const registerDeviceController = async (req, res) => {
  try {
    const { name, deviceType } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: true, message: "Device name is required" });
    const device = await new BiometricDeviceModel({ name: name.trim(), deviceType, createdBy: req.userId }).save();
    // Full, unmasked key — the ONE time it's ever sent back. Every
    // subsequent listDevicesController call returns it masked (see
    // maskApiKey above) — same "shown once, then hidden" practice as
    // most real API-key-issuing systems, so a later compromise of an
    // admin's screen/session can't reveal a working credential.
    return res.status(201).json({
      success: true, error: false, data: device.toObject(),
      message: "Device registered — copy its API key into the device/bridge configuration now. It will only be shown in full this once.",
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const deleteDeviceController = async (req, res) => {
  try {
    const { _id } = req.body;
    await BiometricDeviceModel.findByIdAndDelete(_id);
    return res.json({ success: true, error: false, message: "Device removed" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
