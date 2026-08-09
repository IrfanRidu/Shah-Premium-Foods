// Custom server — replaces the plain `next dev` / `next start` this
// project used before the Call Center CRM module. WHY THIS EXISTS:
// Socket.IO needs one persistent, long-lived process holding open
// WebSocket connections. Standard Vercel serverless functions are
// spun up per-request and torn down — they cannot hold a socket open
// between requests, so Socket.IO cannot run on Vercel's default
// deployment model no matter how it's wired up. This app also now
// needs Asterisk running on a VPS anyway (the CRM spec is explicit
// about self-hosted telephony only), so this server co-locates
// Socket.IO on that same persistent VPS process rather than trying to
// keep the storefront on Vercel and bolt on a separate realtime
// service — simplest to run, one process to operate.
//
// IF YOU'D RATHER KEEP THE STOREFRONT ON VERCEL: this file doesn't have
// to run the whole app. You can instead deploy ONLY a small subset —
// run this server.js on the VPS purely as the Socket.IO + Asterisk ARI
// endpoint, keep everything else on Vercel as today, and point the
// browser at the VPS's socket by setting NEXT_PUBLIC_SOCKET_URL (see
// hooks/useSocket.js) to that VPS's URL instead of leaving it unset
// (unset = same-origin, i.e. this file serving everything). No other
// code change needed either way — this is a deployment choice, not an
// application-logic one.
//
// package.json's "dev"/"start" scripts now point at this file instead
// of the `next` CLI directly (see the diff in that file).

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import connectDbForServer from "./src/modules/callcenter/socket/dbConnectForServer.js";
import { initSocketServer } from "./src/modules/callcenter/socket/socketServer.js";
import { reassignAbandonedOrders } from "./src/modules/callcenter/services/assignmentService.js";
import { sweepDueCallbacks } from "./src/modules/callcenter/controllers/callback.controller.js";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Connect once, up front, before anything that could need it exists
  // yet (a socket connection, an interval tick) — rather than each of
  // those racing to connect independently the first time they happen to
  // run. Fails loudly here if MONGODB_URI is missing/unreachable,
  // instead of surfacing as a confusing error deep inside some later
  // event handler.
  await connectDbForServer();

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: process.env.NEXT_PUBLIC_APP_URL || true, credentials: true },
  });

  initSocketServer(io);

  // Telephony (Asterisk ARI call routing) — same process as Socket.IO
  // deliberately (see the large comment atop ariClient.js's start() for
  // why: this is what lets its emitToUser/emitToSuperAdmins calls reach
  // real browsers). Guarded: if ASTERISK_ARI_PASSWORD isn't set (e.g.
  // Asterisk hasn't been deployed yet, or this is a dev/test environment
  // without telephony), this logs once and the rest of the app keeps
  // running normally rather than crashing on startup — the CRM's
  // non-telephony features (orders, notes, dashboards, click-to-call's
  // WhatsApp button, etc.) don't depend on Asterisk being reachable.
  if (process.env.ASTERISK_ARI_PASSWORD) {
    import("./src/modules/callcenter/telephony/ariClient.js")
      .then(({ start: startAri }) => startAri())
      .catch((err) => console.error("[server] Asterisk ARI service failed to start:", err.message));
  } else {
    console.log("[server] ASTERISK_ARI_PASSWORD not set — telephony/call-routing disabled, rest of the app runs normally. See src/modules/callcenter/telephony/README.md.");
  }

  // Spec: "Auto reassign abandoned orders." This app is now a persistent
  // process (required for Socket.IO above), so a plain interval does the
  // job — no external cron needed. Every 5 minutes, sweep orders that
  // have sat assigned-but-untouched for 60+ minutes onto whichever agent
  // is least loaded right now. Runs from server.js (not a request
  // handler) since it's a background sweep, not tied to any one request.
  const ABANDONED_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
  setInterval(() => {
    reassignAbandonedOrders({ olderThanMinutes: 60 }).catch((err) => {
      console.error("[abandoned-order sweep] failed:", err.message);
    });
  }, ABANDONED_SWEEP_INTERVAL_MS);

  // Spec: "Callback reminder" notifications. Built in Phase 5
  // (callback.controller.js's sweepDueCallbacks) but never actually
  // scheduled anywhere until now — caught while wiring up Phase 10,
  // same class of "looked complete but wasn't connected" gap as the
  // queue-bridging fix in Phase 8.
  const CALLBACK_SWEEP_INTERVAL_MS = 60 * 1000;
  setInterval(() => {
    sweepDueCallbacks().catch((err) => {
      console.error("[callback sweep] failed:", err.message);
    });
  }, CALLBACK_SWEEP_INTERVAL_MS);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port} (custom server: Next.js + Socket.IO)`);
  });
});
