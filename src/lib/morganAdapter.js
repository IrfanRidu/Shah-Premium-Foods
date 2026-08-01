import morgan from "morgan";

// ─────────────────────────────────────────────────────────────────────────
// Section 11 (Logging) — Morgan, adapted for this app's actual architecture.
//
// Morgan is traditionally Express/Node-http middleware: `app.use(morgan(
// "combined"))`, attached to a real `http.ServerResponse` whose lifecycle
// (`res.end()`, the `finish` event) morgan listens to directly, using
// internal timing hooks it sets up itself. This app has neither a real
// Express app nor a genuine Node http request/response lifecycle to
// attach that to — Next.js Route Handlers receive a Web API `Request`,
// and apiHandler.js's own mock req/res (see that file) are a shim built
// for Express-STYLE *controller* code, not for wiring up traditional
// middleware like this.
//
// Rather than skip Morgan or fake up a full Express app just to host it,
// this uses morgan's real, stable, publicly-documented API in a decoupled
// way: `morgan.token()` to register custom tokens fed with data this app
// already computes itself (correlation ID, duration — sidesteps needing
// morgan's own internal `res._startAt` timing hook, which depends on the
// real middleware wrapper running, which nothing here does), and
// `morgan.compile(format)` to get back a plain `(tokens, req, res) =>
// string` formatting function, called directly against a minimal shim
// object instead of ever being attached as middleware.
//
// This is wrapped in a try/catch with a manual fallback for one direct
// reason: this is an adaptation of a package's API surface that could not
// be verified by actually running it in this sandbox (no network to
// install it). A logging concern must never be able to break the actual
// request/response it's trying to describe — if this integration has an
// edge case that doesn't hold up, the request still gets logged, just via
// the simpler fallback line, and this file's format never affects
// anything about the real response sent to the client.

morgan.token("correlation-id", (req) => req.correlationId || "-");
morgan.token("request-id", (req) => req.requestId || "-");
morgan.token("duration-ms", (req) => (req.durationMs !== undefined ? `${req.durationMs}ms` : "-"));

// Custom format, not one of morgan's named presets (combined/common/etc)
// — those assume real headers (referrer, user-agent from a genuine
// Headers object) this minimal shim doesn't carry, and this app already
// has its own structured JSON log line (see apiObservability.js's
// logRequest) for the fuller picture; this format exists specifically to
// get a familiar, standard-looking HTTP-access-log-style line INTO that
// same structured entry, not to replace it.
const FORMAT = ":method :url :status :duration-ms rid=:request-id cid=:correlation-id";
const compiledFormat = morgan.compile(FORMAT);

/**
 * Formats one Morgan-style access-log line for a completed request.
 * Never throws — falls back to a plain manual string if the morgan
 * integration hits anything unexpected.
 */
export function formatMorganLine({ method, url, status, durationMs, requestId, correlationId }) {
  const shimReq = { method, url, requestId, correlationId, durationMs };
  const shimRes = { statusCode: status };
  try {
    // morgan.compile()'s returned function is called as (tokens, req, res)
    // — `morgan` itself doubles as the token registry/dispatcher (built-in
    // tokens like :method/:url/:status are registered as its own
    // properties), which is why it's passed as the first argument rather
    // than some separate "tokens" object.
    const line = compiledFormat(morgan, shimReq, shimRes);
    if (typeof line === "string" && line.length > 0) return line;
    throw new Error("morgan.compile returned an empty/non-string line");
  } catch {
    return `${method} ${url} ${status} ${durationMs}ms rid=${requestId} cid=${correlationId}`;
  }
}
