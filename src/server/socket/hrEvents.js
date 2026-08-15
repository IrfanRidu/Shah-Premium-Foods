// Single source of truth for HR/attendance Socket.IO event names — same
// reasoning as the Call Center CRM module's own
// src/modules/callcenter/socket/events.js (CRM_EVENTS): keeps the
// client and server from drifting apart on a typo'd string. Kept
// separate from CRM_EVENTS rather than added to it — attendance/HR is a
// genuinely different domain from the call center, and folding this in
// there would make that file's name misleading. Both reuse the exact
// same underlying Socket.IO instance and emit helpers
// (emitToUser/emitToSuperAdmins/emitToAll from
// modules/callcenter/socket/socketServer.js) — there is only ever one
// `io` for the whole app (see server.js), this is just a second set of
// event-name constants for it, not a second realtime layer.
export const HR_EVENTS = {
  // Advanced HRMS Features spec: "Attendance should synchronize
  // instantly without requiring manual refresh." Payload is the full
  // updated Attendance document.
  ATTENDANCE_UPDATED: "hr:attendance:updated",
};
