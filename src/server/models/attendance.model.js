import mongoose from "mongoose";

// Advanced HRMS Features spec's attendance method list (RFID/QR are
// explicitly "future support" there, not built here).
export const ATTENDANCE_METHODS = ["Manual", "Browser Login", "Fingerprint", "Facial Recognition"];

// One document per employee per day — check-in and check-out both live
// on the SAME record rather than as separate event documents, since "a
// day's attendance" is naturally one unit and this is what makes
// workMinutes a simple, always-consistent computed field rather than
// something requiring a join across two collections every time it's
// needed (dashboards, payroll).
const attendanceSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.ObjectId, ref: "employee", required: true },
    date: { type: String, required: true }, // "YYYY-MM-DD", server-local date — see attendanceService.js's todayString() for why a string key instead of a Date range query
    checkIn: { type: Date, default: null },
    checkInMethod: { type: String, enum: ATTENDANCE_METHODS, default: null },
    checkInConfidence: { type: Number, default: null }, // biometric verifications only
    checkOut: { type: Date, default: null },
    checkOutMethod: { type: String, enum: ATTENDANCE_METHODS, default: null },
    checkOutConfidence: { type: Number, default: null },
    workMinutes: { type: Number, default: 0 }, // computed at checkout — see attendanceService.js's computeWorkMinutes()
    // Set when HR adds/corrects a record rather than the employee
    // marking their own attendance — spec: "If biometric hardware is
    // unavailable, manual attendance must continue to work," which this
    // session reads as including HR's ability to fix a mistake or
    // backfill a day someone forgot to check in on, not just an
    // employee's own manual button.
    markedBy: { type: mongoose.Schema.ObjectId, ref: "user", default: null },
  },
  { timestamps: true }
);
// One record per employee per day — re-checking in the same day updates
// the existing record rather than creating a duplicate.
attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

const AttendanceModel = mongoose.models.attendance || mongoose.model("attendance", attendanceSchema);
export default AttendanceModel;
