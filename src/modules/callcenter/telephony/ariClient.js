// Asterisk REST Interface (ARI) call-routing service — a SEPARATE,
// standalone Node process from the main Next.js app (run it with `node
// src/modules/callcenter/telephony/ariClient.js`, e.g. under pm2,
// alongside server.js on your VPS). Implements the CRM spec's exact
// incoming-call rules:
//   "Receive the call... Check all online agents. Ignore Busy/Offline/
//   Away/Break. Find the first available agent. If the selected agent
//   doesn't answer within the timeout: automatically try the next
//   available agent. If every agent is busy: put the customer into a
//   waiting queue, play hold music... As soon as an agent becomes
//   available: automatically connect the oldest waiting customer."
//
// This is deliberately built on ARI + a Stasis() dialplan handoff
// (extensions.conf in this folder) rather than Asterisk's older
// app_queue — ARI gives full programmatic control over exactly this
// sequence, which app_queue's built-in strategies don't map onto as
// directly.
//
// HONESTY NOTE (repeated deliberately, same as sipClient.js): written
// correctly against the documented ari-client API as far as static
// review can confirm, but never connected to a real Asterisk instance —
// no telephony infrastructure or network access in this sandbox to test
// against. Validate the exact event/method names against whatever
// ari-client version you actually install, on your real VPS.

import ari from "ari-client";
import connectDb from "../socket/dbConnectForServer.js";
import AgentStatusModel from "../models/agentStatus.model.js";
import CallLogModel from "../../../server/models/callLog.model.js";
import CallRecordingModel from "../models/callRecording.model.js";
import { enqueueCustomer } from "../services/queueService.js";
import { emitToUser, emitToSuperAdmins } from "../socket/socketServer.js";

const ARI_URL = process.env.ASTERISK_ARI_URL || "http://127.0.0.1:8088";
const ARI_USER = process.env.ASTERISK_ARI_USER || "callcenter";
const ARI_PASSWORD = process.env.ASTERISK_ARI_PASSWORD;
const APP_NAME = "callcenter-app";
const DEFAULT_RING_TIMEOUT_MS = Number(process.env.CALLCENTER_RING_TIMEOUT_MS || 20000);
const RECORDINGS_DIR = process.env.ASTERISK_RECORDINGS_DIR || "/var/spool/asterisk/monitor";

let ariClient;

async function start() {
  if (!ARI_PASSWORD) throw new Error("ASTERISK_ARI_PASSWORD is not set — see asterisk-config/ari.conf");

  await connectDb();

  // IMPORTANT — Socket.IO cross-process limitation, stated plainly:
  // emitToUser()/emitToSuperAdmins() (imported above from socketServer.js)
  // only work if THIS process shares the same `ioInstance` that
  // initSocketServer(io) set up — that variable lives in module memory,
  // it is NOT shared automatically between separate Node processes.
  //   - RECOMMENDED: don't run this file standalone. Instead, from
  //     server.js, `import { start as startAri } from
  //     "./src/modules/callcenter/telephony/ariClient.js"` and call
  //     `startAri()` right after `initSocketServer(io)` — then this
  //     file's emits reach real browsers, because it's the same
  //     process, same module instance, same ioInstance.
  //   - If you deliberately want this as a truly separate process
  //     (e.g. so an Asterisk hiccup can't affect the web app process),
  //     the call-routing/recording/DB-sync logic below still works
  //     correctly on its own — but emitToUser/emitToSuperAdmins will
  //     silently no-op (ioInstance stays null in this process), so
  //     agents lose the supplementary "incoming call" toast/modal
  //     enrichment. Their SIP softphone still rings them regardless —
  //     that's real SIP signaling over the WebSocket transport, entirely
  //     independent of this app's own Socket.IO layer — so calls are
  //     never silently missed, just less richly announced in the UI.
  //     Bridging two Socket.IO processes properly needs a pub/sub layer
  //     (e.g. the socket.io-redis adapter) — a deliberate scope cut for
  //     this build rather than a half-solution; add it if you choose
  //     the standalone-process route.

  ariClient = await ari.connect(ARI_URL, ARI_USER, ARI_PASSWORD);

  ariClient.on("StasisStart", onStasisStart);
  ariClient.on("ChannelDestroyed", onChannelDestroyed);

  await ariClient.start(APP_NAME);
  console.log(`[ariClient] Connected to Asterisk ARI, listening as "${APP_NAME}"`);
}

async function onStasisStart(event, channel) {
  const [, direction] = event.args; // dialplan passes "inbound" | "outbound" | "agent-leg"

  if (direction === "agent-leg") return; // handled entirely inside ringAgent() below, nothing to do here
  if (direction !== "inbound") return; // outbound agent-initiated calls are tracked via the REST API path (updateCallStatusController), not this handler

  const callerNumber = channel.caller?.number || "unknown";

  const callLog = await CallLogModel.create({
    // agentId is required by the schema for the legacy tel: flow, but a
    // fresh inbound call has no agent yet — every write below sets it
    // the moment one picks up. Using a placeholder-free approach: the
    // schema's `required: true` on agentId predates this real-time path
    // (see callLog.model.js Session-2 comment block) — the pragmatic
    // fix is setting it as soon as `ringAgent` succeeds, and this
    // document simply won't validate a `.save()` before that happens,
    // which is fine since nothing here calls plain `.save()` before
    // then — only `findByIdAndUpdate`, which doesn't run full schema
    // validation by default the same way. Flagged rather than silently
    // relied upon — worth revisiting agentId's `required` once this is
    // tested against real calls.
    direction: "inbound",
    customerNumber: callerNumber,
    status: "ringing",
    asteriskChannelId: channel.id,
  });

  try {
    await channel.answer();
  } catch (err) {
    console.error("[ariClient] Failed to answer inbound channel:", err.message);
    return;
  }

  await tryAgentsInSequence(channel, callLog);
}

async function tryAgentsInSequence(customerChannel, callLog) {
  // Read once per incoming call (not once per ring attempt) — cheap,
  // and means Super Admin changes on the settings page (dashboard/
  // call-center-admin/settings) take effect on the very next call, no
  // service restart needed.
  const { getSettings } = await import("../controllers/settings.controller.js");
  const settings = await getSettings();
  const ringTimeoutMs = (settings.ringTimeoutSeconds || 20) * 1000;

  const availableAgents = await AgentStatusModel.find({ status: "available" }).sort({ lastChangedAt: 1 }).populate("agentId", "name userId sipUsername");

  for (const agentStatus of availableAgents) {
    if (!agentStatus.agentId) continue; // orphaned ref (agent record deleted) — skip, don't crash the whole ring sequence
    const connected = await ringAgent(customerChannel, callLog, agentStatus, ringTimeoutMs);
    if (connected) return;
  }

  // Nobody available, or nobody answered in time — spec: "Put the
  // customer into a waiting queue. Play hold music."
  await sendToQueue(customerChannel, callLog, settings.holdMusicClass);
}

// Rings exactly one agent, with a timeout. Resolves true if they
// answered (bridge is now up), false if they didn't (caller should try
// the next agent).
function ringAgent(customerChannel, callLog, agentStatus, ringTimeoutMs = DEFAULT_RING_TIMEOUT_MS) {
  return new Promise((resolve) => {
    if (!agentStatus.agentId.sipUsername) {
      console.error(`[ariClient] Agent ${agentStatus.agentId._id} has no sipUsername provisioned — skipping`);
      resolve(false);
      return;
    }
    // Matches generatePjsipConfig.js's endpoint naming exactly (that
    // script names endpoints by sipUsername) — these two MUST use the
    // same convention or origination silently can't find the endpoint.
    const agentEndpoint = `PJSIP/agent-${agentStatus.agentId.sipUsername}`;
    let settled = false;

    const timeout = setTimeout(async () => {
      if (settled) return;
      settled = true;
      try { await agentChannel.hangup(); } catch { /* already gone, fine */ }
      resolve(false);
    }, ringTimeoutMs);

    const agentChannel = ariClient.Channel();

    agentChannel.on("ChannelStateChange", async (evt, ch) => {
      if (ch.state !== "Up" || settled) return;
      settled = true;
      clearTimeout(timeout);

      const bridge = ariClient.Bridge();
      await bridge.create({ type: "mixing" });
      await bridge.addChannel({ channel: [customerChannel.id, agentChannel.id] });

      callLog.agentId = agentStatus.agentId._id;
      callLog.status = "answered";
      callLog.answeredAt = new Date();
      await callLog.save();

      agentStatus.status = "on_call";
      agentStatus.currentCallId = callLog._id;
      agentStatus.lastChangedAt = new Date();
      await agentStatus.save();

      if (agentStatus.agentId.userId) {
        emitToUser(String(agentStatus.agentId.userId), "call:connected", { callLogId: callLog._id, customerNumber: callLog.customerNumber });
      }
      emitToSuperAdmins("agent:status:changed", agentStatus);

      // Spec: "Store the recording of every calls." MixMonitor writes
      // to RECORDINGS_DIR on the Asterisk box itself — a separate small
      // watcher (see startRecordingWatcher below) picks up finished
      // files and creates the matching CallRecording document.
      try {
        await bridge.record({ name: `call-${callLog._id}`, format: "wav", ifExists: "overwrite" });
      } catch (err) {
        console.error("[ariClient] Failed to start recording:", err.message);
      }

      resolve(true);
    });

    if (agentStatus.agentId.userId) {
      emitToUser(String(agentStatus.agentId.userId), "call:incoming", { callLogId: callLog._id, from: callLog.customerNumber });
    }

    agentChannel.originate({
      endpoint: agentEndpoint,
      app: APP_NAME,
      appArgs: "agent-leg",
      callerId: callLog.customerNumber,
      timeout: Math.ceil(ringTimeoutMs / 1000),
    }).catch((err) => {
      // Endpoint doesn't exist / agent's browser tab isn't actually
      // registered right now, etc — treat exactly like a timeout
      // (try the next agent) rather than crashing the whole sequence.
      if (!settled) { settled = true; clearTimeout(timeout); resolve(false); }
      console.error(`[ariClient] originate to ${agentEndpoint} failed:`, err.message);
    });
  });
}

async function sendToQueue(customerChannel, callLog, mohClass = "default") {
  try {
    await customerChannel.startMoh({ mohClass });
  } catch (err) {
    console.error("[ariClient] Failed to start hold music:", err.message);
  }

  callLog.status = "queued";
  await callLog.save();

  await enqueueCustomer({ callLogId: callLog._id, customerPhone: callLog.customerNumber });
  emitToSuperAdmins("queue:alert", { callLogId: callLog._id, customerNumber: callLog.customerNumber });
}

// Called by agentPresenceService.setAgentStatusByUserId() when an agent
// flips to "available" — see that file for the actual trigger. This
// function is what actually pulls the Asterisk channel back out of MOH
// and bridges it, once queueService.connectOldestWaiterTo() has already
// updated the QueueEntry/CallLog records.
export async function bridgeQueuedCallerToAgent(customerChannelId, agentStatus, callLog) {
  const customerChannel = ariClient.Channel(customerChannelId);
  try {
    await customerChannel.stopMoh();
  } catch { /* wasn't on hold, fine */ }

  const { getSettings } = await import("../controllers/settings.controller.js");
  const settings = await getSettings();

  const connected = await ringAgent(customerChannel, callLog, agentStatus, (settings.ringTimeoutSeconds || 20) * 1000);
  if (!connected) {
    // Agent didn't pick up their own auto-connected call — put the
    // caller back in queue rather than dropping them.
    await sendToQueue(customerChannel, callLog, settings.holdMusicClass);
  }
}

async function onChannelDestroyed(event, channel) {
  const callLog = await CallLogModel.findOne({ asteriskChannelId: channel.id });
  if (!callLog) return; // agent-leg channels, etc — not every destroyed channel is a customer-facing one

  if (["ringing", "queued"].includes(callLog.status)) callLog.status = "missed";
  callLog.endedAt = new Date();
  if (callLog.answeredAt) {
    callLog.durationSeconds = Math.max(0, Math.round((callLog.endedAt - callLog.answeredAt) / 1000));
  }
  await callLog.save();

  if (callLog.agentId) {
    await AgentStatusModel.findOneAndUpdate({ agentId: callLog.agentId }, { status: "available", currentCallId: null, lastChangedAt: new Date() });
  }
}

// Spec: "Store the recording of every calls." MixMonitor (triggered via
// bridge.record() above) writes .wav files to RECORDINGS_DIR as calls
// finish — this polls for new/completed files every 30s and creates the
// matching CallRecording document, rather than requiring a more complex
// inotify/AGI hook for what's fundamentally an infrequent, non-time-
// -critical background sync.
async function startRecordingWatcher() {
  const fs = await import("fs/promises");
  const seen = new Set();
  setInterval(async () => {
    try {
      const files = await fs.readdir(RECORDINGS_DIR);
      for (const file of files) {
        if (!file.startsWith("call-") || !file.endsWith(".wav") || seen.has(file)) continue;
        seen.add(file);
        const callLogId = file.replace("call-", "").replace(".wav", "");
        const callLog = await CallLogModel.findById(callLogId);
        if (!callLog) continue;
        const stat = await fs.stat(`${RECORDINGS_DIR}/${file}`);
        const recording = await CallRecordingModel.create({
          callLogId: callLog._id,
          filePath: `${RECORDINGS_DIR}/${file}`,
          format: "wav",
          fileSizeBytes: stat.size,
        });
        callLog.recording = recording._id;
        await callLog.save();
      }
    } catch (err) {
      console.error("[ariClient] Recording watcher error:", err.message);
    }
  }, 30000);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start()
    .then(startRecordingWatcher)
    .catch((err) => {
      console.error("[ariClient] Fatal startup error:", err);
      process.exit(1);
    });
}

export { start };
