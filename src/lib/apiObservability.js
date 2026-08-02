// Section 15 (Next.js Best Practices) — "Server-only modules": this file
// imports connectDb/AuditLogModel (Section 13) on top of Node's `crypto`
// module (a different, incompatible API shape from the Web Crypto API
// browsers/Edge expose under the same global name) — multiple
// independent reasons this can never be client-bundled correctly.
import "server-only";
import crypto from "crypto";
import { requestLogger, securityLogger, auditLogger, errorLogger } from "@/lib/logger";
import { formatMorganLine } from "@/lib/morganAdapter";
import connectDb from "@/lib/mongodb";
import AuditLogModel from "@/server/models/auditLog.model";

// Security/API-design audit (Section 8 — API Security). Shared utilities
// wired into src/lib/apiHandler.js, the single choke point every one of
// the 23 API resource groups already routes through — see that file's
// own comments for why this is the right integration point for anything
// that should apply consistently across the whole API surface.

// ── Request IDs / Correlation IDs ──────────────────────────────────────
// Request ID: unique to THIS single request, always generated fresh here
// — never trust a client-supplied one for this, since its whole purpose
// is unambiguously identifying one specific request/response pair on the
// server side for debugging.
export function generateRequestId() {
  return crypto.randomUUID();
}

// Correlation ID: identifies a CHAIN of related requests (e.g. everything
// that happened during one user checkout flow, across multiple API
// calls) — unlike a request ID, a client (or a future upstream service,
// if this API is ever called from another backend) is expected to
// generate one and pass it along via `X-Correlation-Id`, and this API
// just echoes it back so it can be grepped across logs from every hop.
// If the client didn't send one, a fresh one is generated so every
// request still has one to log and echo, rather than logging "none."
export function resolveCorrelationId(nextRequest) {
  const provided = nextRequest.headers.get("x-correlation-id");
  // Cheap sanity check on a client-supplied value — bound its length and
  // character set before ever putting it in a log line or response
  // header, since it's attacker-controlled input.
  if (provided && /^[A-Za-z0-9_-]{1,100}$/.test(provided)) return provided;
  return crypto.randomUUID();
}

// ── Structured request logging ─────────────────────────────────────────
// Redact anything that should never end up in a log line, even
// server-side ones (server logs are still a real exposure surface — e.g.
// anyone with hosting-platform log access, or a log aggregation service
// with its own retention/access policies you don't fully control).
const REDACTED_KEYS = new Set([
  "password", "newpassword", "currentpassword", "confirmpassword",
  "token", "accesstoken", "refreshtoken", "otp",
  "authorization", "cookie",
]);

function redactForLogging(obj, depth = 0) {
  if (depth > 3 || !obj || typeof obj !== "object") return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      out[key] = "[REDACTED]";
    } else if (value && typeof value === "object") {
      out[key] = redactForLogging(value, depth + 1);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * One structured log entry per completed request, via the Winston request
 * logger (see lib/logger.js). This function's signature and every one of
 * its call sites are unchanged from before Section 11 — this is the exact
 * upgrade this function's own comment used to anticipate ("swap this one
 * function for a real logger... every call site stays the same"), so
 * nothing calling logRequest() needed to change, only what happens inside
 * it.
 */
export function logRequest({ requestId, correlationId, method, path, status, durationMs, ip, body }) {
  const entry = {
    requestId,
    correlationId,
    method,
    path,
    status,
    durationMs,
    ip,
    // A familiar, standard-looking HTTP-access-log-style line (Morgan,
    // adapted — see morganAdapter.js for why it's not attached as
    // traditional middleware here) folded into the same structured entry,
    // rather than written to a second, separate stream.
    accessLog: formatMorganLine({ method, url: path, status, durationMs, requestId, correlationId }),
  };
  // Only log a body sample for non-2xx responses — successful requests
  // don't need their payload logged at all (less exposure, less noise);
  // failed ones benefit from it for debugging, still redacted.
  if (status >= 400 && body && Object.keys(body).length) {
    entry.body = redactForLogging(body);
  }
  requestLogger.http(`${method} ${path} ${status}`, entry);
}

// ── Security event logging ─────────────────────────────────────────────
// Rate-limit rejections, CSRF (Origin/Referer) rejections, login lockouts,
// and IP blocks all already exist as DECISIONS in this codebase (see
// lib/security.js and apiHandler.js) — none of them were previously
// written to a distinct, reviewable log anywhere; they only affected
// in-memory state and a response to the one request that triggered them.
// This is the fix for that gap. `severity` picks the Winston level: a
// single rate-limit hit is routine (`info`); an account lockout or IP
// block is a real signal worth a human noticing (`warn`); a rejected
// request that looks like active exploitation attempts, if ever
// classified as such, would use `error`.
export function logSecurityEvent({ type, severity = "warn", ip, path, method, email, details }) {
  securityLogger[severity](`security:${type}`, {
    type,
    ip,
    path,
    method,
    ...(email ? { email } : {}),
    ...(details ? { details } : {}),
  });
}

// ── Audit event logging ──────────────────────────────────────────────
// "Who did what, when" for authenticated, mutating (non-GET), successful
// requests — wired in generically at apiHandler.js's single choke point
// (see that file) rather than added piecemeal to each of the ~15
// controllers with admin/mutation endpoints, for the same reason every
// other cross-cutting concern in this app lives there: one integration
// point that automatically covers the whole API surface, present and
// future, instead of something that has to be remembered on every new
// mutating endpoint added later.
export async function logAuditEvent({ userId, userRole, method, path, status, body, ip }) {
  const redactedBody = body && Object.keys(body).length ? redactForLogging(body) : undefined;

  auditLogger.info(`audit:${method}:${path}`, {
    userId,
    userRole,
    method,
    path,
    status,
    ...(redactedBody ? { body: redactedBody } : {}),
  });

  // Section 13 (Admin Panel Security) — also persist to MongoDB, for the
  // dashboard/audit-log viewer (a log file/aggregator can't be
  // paginated/filtered by user or date range from inside the app itself;
  // a collection can). Best-effort and bounded: a slow or unreachable
  // database must never hang or fail the actual request that triggered
  // this — awaited (not fire-and-forget) because Vercel serverless
  // functions can be frozen/terminated the instant the response is sent,
  // with no guarantee a detached background write actually completes —
  // but capped at 3s and wrapped in try/catch so the worst case is a
  // missing dashboard entry, never a slow or broken API response.
  try {
    await withTimeout(
      (async () => {
        await connectDb();
        await AuditLogModel.create({ userId, userRole, method, path, status, body: redactedBody, ip });
      })(),
      3000,
      "audit log persistence"
    );
  } catch (err) {
    errorLogger.error("Failed to persist audit log entry to MongoDB", {
      error: err instanceof Error ? err.message : String(err),
      method, path,
    });
  }
}

// ── Error logging ────────────────────────────────────────────────────
// Companion to apiHandler.js's existing console.error in its top-level
// catch block (kept as-is, not removed — Vercel needs stdout regardless
// of what else is wired up) — this additionally routes the same error
// through the Winston error logger, so it's captured with daily rotation
// when self-hosted (see lib/logger.js) and consistently structured
// alongside every other log category.
export function logError(err, context = {}) {
  errorLogger.error(err instanceof Error ? err.message : String(err), {
    stack: err instanceof Error ? err.stack : undefined,
    ...context,
  });
}

// ── Pagination ──────────────────────────────────────────────────────────
// Section 8 audit finding: several list endpoints accepted a client-
// supplied `limit` with a default but NO upper bound (e.g.
// `limit = limit || 10` with nothing stopping a caller from sending
// `limit: 999999`) — that's a free denial-of-service lever, forcing the
// server to build and serialize an enormous result set on request. This
// doesn't change any endpoint's own default, only clamps whatever value
// (or lack of one) it ends up with into a sane range.
export function clampPagination(page, limit, { maxLimit = 100, defaultLimit = 10 } = {}) {
  const p = Math.max(1, Math.floor(Number(page)) || 1);
  let l = Math.floor(Number(limit)) || defaultLimit;
  l = Math.min(Math.max(1, l), maxLimit);
  return { page: p, limit: l, skip: (p - 1) * l };
}

// ── Timeouts ────────────────────────────────────────────────────────────
// Honest limitation, stated directly: this bounds how long the CLIENT
// waits for a response — if it fires, the client gets a clean 504 instead
// of hanging indefinitely (protecting against a slow-loris-style resource
// hold and giving predictable API behavior). It does NOT cancel whatever
// database query or external API call was in flight server-side — a true
// A true
// cancellation would need an AbortController threaded through every
// Mongoose query and external call in every controller, which isn't a
// change this pass makes. The operation still completes (or fails) in the
// background; this only stops making the client wait for it past this
// timeout.
export class TimeoutError extends Error {}

export async function withTimeout(promise, ms, label = "request") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// ── Caching ─────────────────────────────────────────────────────────────
// Cache-Control is set explicitly per response rather than left to
// whatever a given hosting platform's default happens to be — this
// matters for security as much as performance: an authenticated,
// personal-data response (order history, profile, admin data) getting
// cached by a shared proxy/CDN because nothing said not to would be a
// real sensitive-data-exposure bug, not just a staleness annoyance.
export const CACHE_PRIVATE_NO_STORE = "private, no-store";
export const CACHE_PUBLIC_SHORT = "public, max-age=60, stale-while-revalidate=300";
