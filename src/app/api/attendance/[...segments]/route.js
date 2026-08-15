import { createNextHandler } from "@/lib/apiHandler";
import auth from "@/server/middlewares/auth";
import deviceAuth from "@/server/middlewares/deviceAuth";
import { checkPermission, superAdminOnly } from "@/server/middlewares/permission";
import {
  selfCheckInController, selfCheckOutController, getMyAttendanceController,
  getAttendanceOverviewController, manualAttendanceOverrideController, getEmployeeAttendanceHistoryController,
  enrollFaceController, verifyFaceController,
  enrollFingerprintController, fingerprintWebhookController,
  listDevicesController, registerDeviceController, deleteDeviceController,
} from "@/server/controllers/attendance.controller";

// Advanced HRMS Features spec: "Manual Check-In / Manual Check-Out" —
// self-service, deliberately just `auth` with NO hrPayroll permission
// check. This is a genuinely different module from HR & Payroll (not
// every route here needs an HR-tier permission at all — an ordinary
// staff member marking their OWN attendance shouldn't need any HR
// permission whatsoever), which is why this is its own top-level route
// group rather than folded into hr-payroll's.
const ROUTES = {
  "POST:/checkin":              [[auth], selfCheckInController],
  "POST:/checkout":             [[auth], selfCheckOutController],
  "GET:/my-attendance":         [[auth], getMyAttendanceController],
  "POST:/verify-face":          [[auth], verifyFaceController],

  // HR management — same hrPayroll view/edit gate as the rest of the
  // module this extends, per the roadmap's own "wires into... the
  // existing HR dashboard" plan.
  "GET:/overview":              [[auth, checkPermission("hrPayroll", "view")], getAttendanceOverviewController],
  "POST:/override":             [[auth, checkPermission("hrPayroll", "edit")], manualAttendanceOverrideController],
  "GET:/history":               [[auth, checkPermission("hrPayroll", "view")], getEmployeeAttendanceHistoryController],
  "POST:/enroll-face":          [[auth, checkPermission("hrPayroll", "edit")], enrollFaceController],
  "POST:/enroll-fingerprint":   [[auth, checkPermission("hrPayroll", "edit")], enrollFingerprintController],

  // Device management — strict Super-Admin-only (not superAdminOrDemo):
  // an API key is a real credential, not day-to-day CRUD a Demo Admin
  // tour benefits from simulating, same reasoning as the CRM module's
  // Routing & Queue Settings and this module's own Tax & Deduction
  // Rules.
  "GET:/devices":                [[auth, superAdminOnly], listDevicesController],
  "POST:/devices":               [[auth, superAdminOnly], registerDeviceController],
  "DELETE:/devices":             [[auth, superAdminOnly], deleteDeviceController],

  // Called by a registered biometric device/bridge script, not a
  // logged-in dashboard user — deviceAuth (API key), not auth (user
  // JWT). See deviceAuth.js and biometricDevice.model.js for the full
  // reasoning on why this is the receiving side of a generic webhook
  // contract rather than a specific vendor's SDK.
  "POST:/fingerprint-webhook":  [[deviceAuth], fingerprintWebhookController],
};

export const dynamic = "force-dynamic";

const h = (req, ctx) => createNextHandler(req, ctx.params, ROUTES);
export { h as GET, h as POST, h as PUT, h as DELETE };
