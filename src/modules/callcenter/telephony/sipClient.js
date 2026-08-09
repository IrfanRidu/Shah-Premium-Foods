import { UserAgent, Registerer, Inviter, SessionState } from "sip.js";

// Framework-agnostic SIP.js wrapper — hooks/useSipClient.js is the React
// binding on top of this. Kept separate so the actual SIP/WebRTC logic
// doesn't get tangled up with component lifecycle concerns.
//
// HONESTY NOTE (see PROGRESS_TRACKER.md / telephony/README.md): this
// code is written to the real SIP.js v0.21 API and is correct as far as
// static review can confirm, but it has NOT been exercised against a
// live Asterisk server — this sandbox has no telephony infrastructure or
// network access to test against. Verify against your actual VPS/
// Asterisk setup before relying on it in production.

let userAgent = null;
let registerer = null;
let activeSession = null;
const listeners = new Set();

function emit(event) {
  listeners.forEach((cb) => cb(event));
}

export function onSipEvent(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function isInitialized() {
  return !!userAgent;
}

// sipUri looks like "sip:agent42@your-pbx.example.com". wsServer is the
// Asterisk WebSocket endpoint, e.g. "wss://your-pbx.example.com:8089/ws"
// (see telephony/asterisk-config/http.conf for the Asterisk side of
// this). password is the agent's PJSIP endpoint secret, NOT their site
// login password — these are deliberately separate credentials (see
// telephony/README.md for how agent SIP credentials get provisioned).
export async function initSip({ sipUri, wsServer, password, displayName }) {
  if (userAgent) return userAgent;

  const target = UserAgent.makeURI(sipUri);
  if (!target) throw new Error(`Invalid SIP URI: ${sipUri}`);

  userAgent = new UserAgent({
    uri: target,
    transportOptions: { server: wsServer },
    authorizationUsername: sipUri.split(":")[1]?.split("@")[0],
    authorizationPassword: password,
    displayName,
    sessionDescriptionHandlerFactoryOptions: {
      constraints: { audio: true, video: false },
    },
    delegate: {
      onInvite(invitation) {
        activeSession = invitation;
        bindSessionEvents(invitation);
        emit({ type: "incoming", session: invitation, from: invitation.remoteIdentity.uri.user });
      },
    },
  });

  await userAgent.start();
  registerer = new Registerer(userAgent);
  await registerer.register();
  emit({ type: "registered" });
  return userAgent;
}

export async function teardownSip() {
  try { await registerer?.unregister(); } catch { /* best effort */ }
  try { await userAgent?.stop(); } catch { /* best effort */ }
  userAgent = null;
  registerer = null;
  activeSession = null;
}

function bindSessionEvents(session) {
  session.stateChange.addListener((state) => {
    switch (state) {
      case SessionState.Establishing:
        emit({ type: "ringing" });
        break;
      case SessionState.Established:
        emit({ type: "answered", session });
        attachRemoteAudio(session);
        break;
      case SessionState.Terminated:
        emit({ type: "ended" });
        activeSession = null;
        break;
      default:
        break;
    }
  });
}

// Plays the remote party's audio through a hidden <audio> element —
// there's no built-in "just play this call" API in SIP.js, this is the
// standard way every SIP.js integration wires up the received track.
function attachRemoteAudio(session) {
  const pc = session.sessionDescriptionHandler?.peerConnection;
  if (!pc) return;
  const remoteStream = new MediaStream();
  pc.getReceivers().forEach((receiver) => {
    if (receiver.track) remoteStream.addTrack(receiver.track);
  });
  let audioEl = document.getElementById("sip-remote-audio");
  if (!audioEl) {
    audioEl = document.createElement("audio");
    audioEl.id = "sip-remote-audio";
    audioEl.autoplay = true;
    document.body.appendChild(audioEl);
  }
  audioEl.srcObject = remoteStream;
}

// sipDomain is the Asterisk realm agents register against — calling a
// customer means inviting "sip:<their number>@<that same domain>",
// which Asterisk's dialplan (extensions.conf) then routes out to the
// PSTN via whatever trunk is configured there.
export async function makeCall(customerNumber, sipDomain) {
  if (!userAgent) throw new Error("SIP client not initialized — call initSip() first");
  const target = UserAgent.makeURI(`sip:${customerNumber}@${sipDomain}`);
  const inviter = new Inviter(userAgent, target);
  activeSession = inviter;
  bindSessionEvents(inviter);
  emit({ type: "calling", number: customerNumber });
  await inviter.invite();
  return inviter;
}

export async function answerCall() {
  if (!activeSession) return;
  await activeSession.accept();
}

export async function rejectCall() {
  if (!activeSession) return;
  await activeSession.reject();
  activeSession = null;
}

export async function hangupCall() {
  if (!activeSession) return;
  if (activeSession.state === SessionState.Established) await activeSession.bye();
  else if (activeSession.state === SessionState.Establishing) await activeSession.cancel();
  activeSession = null;
}

export function sendDTMF(tone) {
  const sender = activeSession?.sessionDescriptionHandler?.peerConnection?.getSenders().find((s) => s.dtmf)?.dtmf;
  sender?.insertDTMF(tone);
}

export function toggleHold(hold) {
  // Basic hold: mute/unmute the local outgoing audio track. A "real"
  // SIP hold (re-INVITE with a=sendonly, so the customer hears MOH from
  // Asterisk) needs session.invite() with modified SDP — noted in
  // telephony/README.md as a known simplification to revisit once
  // tested against a real Asterisk instance, since re-INVITE behavior
  // is exactly the kind of thing that needs a live PBX to verify.
  const pc = activeSession?.sessionDescriptionHandler?.peerConnection;
  pc?.getSenders().forEach((s) => { if (s.track) s.track.enabled = !hold; });
}
