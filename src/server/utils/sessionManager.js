import crypto from "crypto";
import UserModel from "../models/user.model.js";

// Security audit: multi-device sessions + refresh token rotation with
// reuse detection, replacing the old single `refresh_token` field (see
// user.model.js's own comment on the schema change for why that was
// actually the *opposite* of multi-device support).
//
// How this fits together with generateRefreshToken.js / user.controller.js:
//   - LOGIN: createSession() makes a new session row, the refresh JWT
//     issued to the browser embeds that session's `tokenId` as its `jti`
//     claim.
//   - REFRESH: rotateSession() is called with the `jti` from the JWT the
//     browser just presented (already signature+expiry verified by the
//     caller before this runs). If a session with that `tokenId` exists,
//     it's a legitimate, once-only use of that refresh token: the session
//     is updated to a NEW `tokenId` (rotation) and the new refresh JWT
//     embeds that new one. If NO session has that `tokenId`, it means this
//     exact token was already rotated away once before and is now being
//     replayed — the strongest practical signal available that a refresh
//     token was stolen and is being used by someone else after the
//     legitimate device already rotated past it. The response to that is
//     deliberately aggressive: revoke every session for the account, not
//     just this one, forcing a fresh login everywhere.
//   - LOGOUT (one device): revokeSession() removes just that session.
//   - LOGOUT (all devices) / password change: revokeAllSessions() clears
//     every session — used for the "log out everywhere" profile action
//     and automatically on password reset/change (OWASP session
//     invalidation guidance: a password change should kill every existing
//     session, not just the one that changed it).

// Database security audit (Section 7 — TTL indexes): a real MongoDB TTL
// index can't be used for OTP fields or these sessions, and it's worth
// being explicit about why rather than silently skipping the request. TTL
// indexes work by deleting an ENTIRE DOCUMENT once a date field on it is
// in the past — that's the wrong granularity here. OTP fields
// (verify_email_otp, forgot_password_otp, etc. — see user.model.js) live
// directly ON the User document; a TTL index on their expiry field would
// delete the whole user account, not just clear the OTP. Sessions live as
// subdocuments inside an array on the User document (see this file's own
// top comment on why — one Mongoose document per user, not per session);
// MongoDB TTL indexes only operate on a top-level document's own field,
// not on individual array elements, so there's no way to expire one
// session subdocument via a TTL index without a schema change moving
// sessions into their own top-level collection. That would be a
// reasonable follow-up if this ever needs to scale past what a bounded,
// capped array (MAX_SESSIONS_PER_USER above) comfortably handles — until
// then, this function does the pragmatic equivalent at the application
// level: opportunistically dropping expired sessions whenever the array
// is read or written, so they don't accumulate indefinitely between
// logins/refreshes even without a TTL index doing it automatically in the
// background.
function pruneExpiredSessions(sessions = []) {
  const now = Date.now();
  return sessions.filter((s) => !s.expiresAt || new Date(s.expiresAt).getTime() > now);
}

const MAX_SESSIONS_PER_USER = 10; // bound unbounded growth from repeated logins; oldest evicted first

function getClientIpFromHeaders(headers = {}) {
  const xff = headers["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  return headers["x-real-ip"] || "unknown";
}

function summarizeUserAgent(ua = "") {
  // Best-effort, human-readable device label for a "manage devices" UI —
  // not used for any security decision, purely cosmetic.
  if (!ua) return "Unknown device";
  if (/iphone/i.test(ua)) return "iPhone";
  if (/ipad/i.test(ua)) return "iPad";
  if (/android/i.test(ua)) return /mobile/i.test(ua) ? "Android phone" : "Android tablet";
  if (/macintosh/i.test(ua)) return "Mac";
  if (/windows/i.test(ua)) return "Windows PC";
  if (/linux/i.test(ua)) return "Linux";
  return "Unknown device";
}

/**
 * @param {string} userId
 * @param {object} mockReq - the apiHandler.js mock request (has .headers as a plain object)
 * @param {Date} expiresAt
 * @returns {Promise<string>} the new session's tokenId (embed as the refresh JWT's `jti`)
 */
export async function createSession(userId, mockReq, expiresAt) {
  const tokenId = crypto.randomUUID();
  const session = {
    tokenId,
    userAgent: mockReq?.headers?.["user-agent"] || "",
    ip: getClientIpFromHeaders(mockReq?.headers),
    createdAt: new Date(),
    lastUsedAt: new Date(),
    expiresAt,
  };

  const user = await UserModel.findById(userId).select("sessions");
  if (!user) throw new Error("User not found");

  user.sessions = pruneExpiredSessions(user.sessions);
  user.sessions.push(session);
  if (user.sessions.length > MAX_SESSIONS_PER_USER) {
    user.sessions.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    user.sessions = user.sessions.slice(user.sessions.length - MAX_SESSIONS_PER_USER);
  }
  await user.save();
  return tokenId;
}

/**
 * @returns {Promise<{ reused: true } | { reused: false, newTokenId: string }>}
 */
export async function rotateSession(userId, oldTokenId, mockReq, expiresAt) {
  const user = await UserModel.findById(userId).select("sessions");
  if (!user) return { reused: true }; // no user, no legitimate session — treat as invalid

  const idx = user.sessions.findIndex((s) => s.tokenId === oldTokenId);
  if (idx === -1) {
    // Reuse of an already-rotated (or never-existed) refresh token.
    user.sessions = [];
    await user.save();
    return { reused: true };
  }

  const newTokenId = crypto.randomUUID();
  user.sessions[idx].tokenId    = newTokenId;
  user.sessions[idx].lastUsedAt = new Date();
  user.sessions[idx].expiresAt  = expiresAt;
  user.sessions[idx].userAgent  = mockReq?.headers?.["user-agent"] || user.sessions[idx].userAgent;
  user.sessions[idx].ip         = getClientIpFromHeaders(mockReq?.headers) || user.sessions[idx].ip;
  user.markModified("sessions");
  await user.save();
  return { reused: false, newTokenId };
}

export async function revokeSession(userId, tokenId) {
  await UserModel.updateOne({ _id: userId }, { $pull: { sessions: { tokenId } } });
}

export async function revokeAllSessions(userId) {
  await UserModel.updateOne({ _id: userId }, { $set: { sessions: [] } });
}

export async function revokeOtherSessions(userId, keepTokenId) {
  if (!keepTokenId) return revokeAllSessions(userId);
  const user = await UserModel.findById(userId).select("sessions");
  if (!user) return;
  user.sessions = user.sessions.filter((s) => s.tokenId === keepTokenId);
  user.markModified("sessions");
  await user.save();
}

export async function listSessions(userId, currentTokenId) {
  const user = await UserModel.findById(userId).select("sessions");
  if (!user) return [];
  return pruneExpiredSessions(user.sessions)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .map((s) => ({
      id: s.tokenId,
      device: summarizeUserAgent(s.userAgent),
      ip: s.ip,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      isCurrent: s.tokenId === currentTokenId,
    }));
}
