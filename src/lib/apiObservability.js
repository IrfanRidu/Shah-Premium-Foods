import crypto from "crypto";

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
 * One structured JSON log line per completed request. Deliberately plain
 * `console.log` (not a logging library) — this project has no existing
 * log-shipping infrastructure to integrate with, and a single JSON object
 * per line is already directly parseable by any log aggregator (Vercel
 * Logs, CloudWatch, Datadog, etc.) without extra tooling. Swap this one
 * function for a real logger (pino, winston) if/when this app adopts one
 * — every call site stays the same.
 */
export function logRequest({ requestId, correlationId, method, path, status, durationMs, ip, body }) {
  const entry = {
    ts: new Date().toISOString(),
    requestId,
    correlationId,
    method,
    path,
    status,
    durationMs,
    ip,
  };
  // Only log a body sample for non-2xx responses — successful requests
  // don't need their payload logged at all (less exposure, less noise);
  // failed ones benefit from it for debugging, still redacted.
  if (status >= 400 && body && Object.keys(body).length) {
    entry.body = redactForLogging(body);
  }
  console.log(JSON.stringify(entry));
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
