import AttendanceModel from "../models/attendance.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { emitToUser, emitToSuperAdmins } from "../../modules/callcenter/socket/socketServer.js";
import { HR_EVENTS } from "../socket/hrEvents.js";

// Server-local YYYY-MM-DD — the same calendar-day key an attendance
// record is looked up/created by. A plain string key (rather than a
// Date-range query between local midnight and next midnight) sidesteps
// timezone ambiguity entirely for "what day is this" — there is exactly
// one string, not a range that depends on which timezone the comparison
// is evaluated in.
export function todayString(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Pure — (checkOut - checkIn) in whole minutes, clamped to 0 rather
// than going negative if checkOut somehow precedes checkIn (a manual-
// entry mistake HR is correcting, or a checkout replay) — a negative
// "hours worked" number has no sensible meaning to show anywhere
// downstream (dashboards, payroll).
export function computeWorkMinutes(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(0, Math.round(ms / 60000));
}

// ── Facial recognition matching ─────────────────────────────────
// Advanced HRMS Features spec: "Face verification... Confidence score."
// The actual face→128-number-descriptor EXTRACTION happens in the
// BROWSER via face-api.js (see the enrollment/verification pages) — a
// self-hosted Node server has no GPU/browser context to run that model
// in. What happens here, server-side, is just comparing two already-
// extracted descriptors, which is plain vector math with no ML runtime
// dependency at all. Standard face-api.js `FaceMatcher` distance
// threshold (0.6) used as the default cutoff below — this is the
// library's own documented starting point for "same person," not a
// number invented for this project, though real-world tuning against
// actual camera/lighting conditions (which this sandbox has no way to
// do) may call for adjusting it.
export const FACE_MATCH_THRESHOLD = 0.6;

export function euclideanDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return Infinity;
  let sumSquares = 0;
  for (let i = 0; i < a.length; i++) sumSquares += (a[i] - b[i]) ** 2;
  return Math.sqrt(sumSquares);
}

export function matchFace(candidateDescriptor, storedDescriptor, threshold = FACE_MATCH_THRESHOLD) {
  const distance = euclideanDistance(candidateDescriptor, storedDescriptor);
  const isMatch = distance <= threshold;
  // Confidence is a human-readable convenience derived from the
  // distance, not a separate measurement — 0 distance -> confidence 1,
  // distance at/beyond the threshold -> confidence approaches 0.
  const confidence = Math.max(0, Math.min(1, 1 - distance / threshold));
  return { isMatch, distance, confidence };
}

// ── Check-in / check-out ────────────────────────────────────────
// Advanced HRMS Features spec: "When an employee successfully verifies
// using fingerprint or facial recognition: Automatically mark
// attendance. Update attendance in real time... Attendance should
// synchronize instantly without requiring manual refresh." Reuses this
// app's ONE existing Socket.IO instance (built for the Call Center CRM
// module, but the emit helpers there are generic infrastructure, not
// CRM-specific — see socketServer.js) rather than standing up a second
// realtime layer.
//
// Idempotent by design: calling this again for an employee who already
// checked in today just returns their existing record unchanged rather
// than erroring or overwriting a legitimate earlier check-in time (e.g.
// browser-login-triggered marking firing on every request within the
// same session, not just the first).
export async function markCheckIn(employeeId, { method, confidence = null, markedBy = null } = {}) {
  const date = todayString();
  let record = await AttendanceModel.findOne({ employeeId, date });
  if (record?.checkIn) return record; // already checked in today — no-op

  record = await AttendanceModel.findOneAndUpdate(
    { employeeId, date },
    { $set: { checkIn: new Date(), checkInMethod: method, checkInConfidence: confidence, markedBy } },
    { new: true, upsert: true }
  );

  const employee = await EmployeeModel.findById(employeeId).select("userId name");
  if (employee?.userId) emitToUser(employee.userId, HR_EVENTS.ATTENDANCE_UPDATED, record);
  emitToSuperAdmins(HR_EVENTS.ATTENDANCE_UPDATED, record);
  return record;
}

export async function markCheckOut(employeeId, { method, confidence = null, markedBy = null } = {}) {
  const date = todayString();
  const existing = await AttendanceModel.findOne({ employeeId, date });
  if (!existing?.checkIn) return null; // can't check out without having checked in — spec's own methods list treats these as a pair, not independent actions
  if (existing.checkOut) return existing; // already checked out today — no-op

  const checkOut = new Date();
  const record = await AttendanceModel.findOneAndUpdate(
    { employeeId, date },
    { $set: { checkOut, checkOutMethod: method, checkOutConfidence: confidence, markedBy, workMinutes: computeWorkMinutes(existing.checkIn, checkOut) } },
    { new: true }
  );

  const employee = await EmployeeModel.findById(employeeId).select("userId name");
  if (employee?.userId) emitToUser(employee.userId, HR_EVENTS.ATTENDANCE_UPDATED, record);
  emitToSuperAdmins(HR_EVENTS.ATTENDANCE_UPDATED, record);
  return record;
}

// Advanced HRMS Features spec explicitly lists "Browser Login" /
// "Browser Logout" as attendance methods in their own right, distinct
// from fingerprint/facial verification. Hooked into
// user.controller.js's completeLogin()/logoutUserController — see those
// call sites for why this is deliberately best-effort/non-blocking:
// attendance marking failing must never be the reason someone can't log
// in or out of the dashboard.
export async function autoMarkFromBrowserLogin(userId) {
  try {
    const employee = await EmployeeModel.findOne({ userId, status: "Active" }).select("_id");
    if (!employee) return; // not every user account is an employee — most are customers
    await markCheckIn(employee._id, { method: "Browser Login" });
  } catch (err) {
    console.error("[attendanceService] autoMarkFromBrowserLogin failed (non-fatal):", err.message);
  }
}

export async function autoMarkFromBrowserLogout(userId) {
  try {
    const employee = await EmployeeModel.findOne({ userId, status: "Active" }).select("_id");
    if (!employee) return;
    await markCheckOut(employee._id, { method: "Browser Login" });
  } catch (err) {
    console.error("[attendanceService] autoMarkFromBrowserLogout failed (non-fatal):", err.message);
  }
}
