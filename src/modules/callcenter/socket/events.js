// Single source of truth for every Socket.IO event name this module
// uses, so the client (hooks/useSocket.js, components) and server
// (socketServer.js, services, telephony/ariClient.js) can never drift
// apart on a typo'd string.
export const CRM_EVENTS = {
  // Agent presence
  AGENT_STATUS_UPDATE: "agent:status:update",   // client -> server, agent changes their own status
  AGENT_STATUS_CHANGED: "agent:status:changed", // server -> clients, broadcast a status change

  // Calls
  CALL_INCOMING: "call:incoming",   // server -> one agent, offering them a ringing call
  CALL_RINGING: "call:ringing",
  CALL_CONNECTED: "call:connected",
  CALL_ENDED: "call:ended",
  CALL_MISSED: "call:missed",

  // Queue
  QUEUE_UPDATED: "queue:updated",
  QUEUE_ALERT: "queue:alert",       // server -> super admins, queue is backing up

  // Orders
  ORDER_ASSIGNED: "order:assigned",

  // Notifications (generic wrapper — the actual Notification doc is the payload)
  NOTIFICATION_NEW: "notification:new",
};
