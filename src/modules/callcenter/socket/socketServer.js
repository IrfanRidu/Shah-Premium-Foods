import jwt from "jsonwebtoken";
import connectDb from "./dbConnectForServer.js";
import AgentStatusModel from "../models/agentStatus.model.js";
import UserModel from "../../../server/models/user.model.js";
import { CRM_EVENTS } from "./events.js";

let ioInstance = null;
const SUPER_ADMIN_ROLES = ["SUPERADMIN", "ADMIN", "DEMO_ADMIN"]; // same set notification.controller.js already uses

// Minimal cookie-header parser — deliberately not pulling in a new
// dependency for this. `accessToken` (src/server/middlewares/auth.js) is
// an httpOnly cookie, so client-side JS can never read it to hand to
// Socket.IO manually anyway; the browser sends it automatically on the
// socket handshake's underlying HTTP request as long as the client
// connects with credentials included (see hooks/useSocket.js), and we
// just read it off the raw header here, server-side.
function parseCookie(header, name) {
  if (!header) return null;
  const match = header.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function initSocketServer(io) {
  ioInstance = io;

  // Same JWT_SECRET_ACCESS + `accessToken` cookie every HTTP route
  // already authenticates with (src/server/middlewares/auth.js) — one
  // login, works for both the REST API and the realtime layer.
  io.use((socket, next) => {
    try {
      const token = parseCookie(socket.handshake.headers.cookie, "accessToken");
      if (!token) return next(new Error("unauthorized"));
      if (!process.env.JWT_SECRET_ACCESS) return next(new Error("server misconfigured"));
      const decoded = jwt.verify(token, process.env.JWT_SECRET_ACCESS);
      socket.userId = decoded.id;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    socket.join(`user:${socket.userId}`);

    // Join the shared super-admin room if this connection's role
    // qualifies, so emitToSuperAdmins() below can target real recipients
    // instead of a renamed broadcast-to-everyone (which is what this did
    // before this fix).
    try {
      await connectDb();
      const user = await UserModel.findById(socket.userId).select("role");
      if (user && SUPER_ADMIN_ROLES.includes(user.role)) socket.join("superadmins");
    } catch {
      // If this lookup fails, the connection just won't get super-admin
      // broadcasts — fails closed (under-notified), not open.
    }

    socket.on(CRM_EVENTS.AGENT_STATUS_UPDATE, async (status, ack) => {
      try {
        const { setAgentStatusByUserId } = await import("../services/agentPresenceService.js");
        const updated = await setAgentStatusByUserId(socket.userId, status, socket.id);
        if (updated) emitToSuperAdmins(CRM_EVENTS.AGENT_STATUS_CHANGED, updated);
        if (typeof ack === "function") ack({ success: true });

        // Spec: "As soon as an agent becomes available: Automatically
        // connect the oldest waiting customer." Deliberately kept OUT of
        // agentPresenceService.js (see the large comment on that
        // function) — this file is the one place in the whole app that
        // is genuinely never processed by Next's webpack build (it's
        // only ever loaded by server.js via plain `node server.js`), so
        // it's the only safe place to reference telephony/ariClient.js,
        // even via a dynamic import — webpack statically analyzes those
        // too for code-splitting, which is exactly what pulled
        // ari-client's ws dependency (and its optional native
        // bufferutil/utf-8-validate addons) into the ordinary app build
        // when this lived in the shared service instead.
        if (updated && status === "available") {
          try {
            const { connectOldestWaiterTo } = await import("../services/queueService.js");
            const oldest = await connectOldestWaiterTo(updated.agentId._id);
            if (oldest?.callLogId?.asteriskChannelId) {
              const { bridgeQueuedCallerToAgent } = await import("../telephony/ariClient.js");
              await bridgeQueuedCallerToAgent(oldest.callLogId.asteriskChannelId, updated, oldest.callLogId);
            }
          } catch (err) {
            // Telephony not configured/reachable — the status change
            // above already succeeded and was already acked; worst case
            // here is the caller stays on hold an extra moment instead
            // of this socket event failing.
            console.error("[socketServer] Failed to bridge queued caller:", err.message);
          }
        }
      } catch (err) {
        if (typeof ack === "function") ack({ success: false, message: err.message });
      }
    });

    socket.on("disconnect", async () => {
      try {
        await connectDb();
        const updated = await AgentStatusModel.findOneAndUpdate(
          { socketId: socket.id },
          { status: "offline", socketId: null, sipRegistered: false, lastChangedAt: new Date() },
          { new: true }
        ).populate("agentId", "name userId");
        if (updated) emitToSuperAdmins(CRM_EVENTS.AGENT_STATUS_CHANGED, updated);
      } catch {
        // Best-effort — a failed cleanup on disconnect shouldn't crash the server.
      }
    });
  });
}

export function getIO() {
  return ioInstance;
}

export function emitToUser(userId, event, payload) {
  ioInstance?.to(`user:${userId}`).emit(event, payload);
}

export function emitToSuperAdmins(event, payload) {
  ioInstance?.to("superadmins").emit(event, payload);
}

export function emitToAll(event, payload) {
  ioInstance?.emit(event, payload);
}
