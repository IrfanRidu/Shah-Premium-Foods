// ─────────────────────────────────────────────────────────────────────────
// Security audit (OWASP Top 10 pass): shared utilities used by
// src/lib/apiHandler.js, which every one of the 23 API resource groups
// routes through — so everything in this file applies to the ENTIRE API
// surface from one integration point, rather than needing to be repeated
// per-controller.
// ─────────────────────────────────────────────────────────────────────────

// ── 1. NoSQL injection + prototype pollution: input sanitization ──────────
//
// Real risk this closes: this app parses JSON bodies directly
// (`await nextRequest.json()` in apiHandler.js) and several controllers use
// a request field straight in a Mongoose filter, e.g.
// `UserModel.findOne({ email })` where `email` comes from `req.body.email`.
// If a field isn't coerced to a string first, an attacker can send a JSON
// *object* instead of a string — e.g. `{"email": {"$ne": null}, "password":
// {"$ne": null}}` — and turn a simple equality filter into a Mongo query
// operator, potentially bypassing the check entirely. A small number of
// fields in this codebase happen to be accidentally safe today only
// because they call `.trim()`/`.toLowerCase()` first (which throws on a
// non-string and gets caught as a 500, not silently exploited) — that's a
// side-effect, not a designed defense, and it isn't consistent across all
// ~23 controllers. The fix applied here is structural instead of
// per-field: every request body/query/params object is deep-cleaned
// before any controller ever sees it, stripping:
//   - any key starting with "$"        (Mongo operators: $ne, $gt, $where…)
//   - any key containing "."           (dotted-path injection)
//   - "__proto__" / "constructor" / "prototype" keys (prototype pollution —
//     the same traversal that finds injectable Mongo operators is exactly
//     the traversal that needs to refuse to walk into an object's
//     prototype chain, so both are handled by one function)
// This is the same approach as the well-known `express-mongo-sanitize`
// package, implemented directly here to avoid adding a new dependency for
// ~30 lines of logic.
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function sanitizeInput(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeInput);
  }
  if (value && typeof value === "object") {
    // Don't try to sanitize non-plain objects (Buffers, Dates, etc.) —
    // walking into those can throw or corrupt them, and they aren't a
    // vector for key-based injection since their own keys aren't
    // attacker-controlled JSON.
    if (value instanceof Date || Buffer.isBuffer?.(value)) return value;

    const clean = {};
    for (const key of Object.keys(value)) {
      if (DANGEROUS_KEYS.has(key)) continue; // drop silently — never assign onto a prototype
      if (key.startsWith("$") || key.includes(".")) continue; // drop silently — never let a Mongo operator through
      clean[key] = sanitizeInput(value[key]);
    }
    return clean;
  }
  return value; // primitives pass through unchanged
}

// ── 2. Rate limiting ────────────────────────────────────────────────────
//
// Honest limitation, stated up front rather than glossed over: this is an
// in-memory, per-process sliding-window limiter. It's genuinely effective
// for this project's architecture (a single long-running `next start`/
// `npm run dev` Node process — see SETUP.md), but it does NOT share state
// across multiple server instances/containers behind a load balancer, and
// it resets on every restart/deploy. If this app is ever horizontally
// scaled (multiple instances), replace the Map below with a shared store
// (Redis via `@upstash/ratelimit` or similar) — the call sites in
// apiHandler.js wouldn't need to change, only this function's internals.
const buckets = new Map(); // key -> { count, resetAt }

// Periodic cleanup so the Map can't grow unbounded from one-off IPs/keys
// that never come back. Guarded so hot-reload in dev doesn't stack up
// multiple intervals.
if (typeof globalThis.__spf_rateLimitCleanupStarted === "undefined") {
  globalThis.__spf_rateLimitCleanupStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, 5 * 60 * 1000).unref?.();
}

/**
 * @param {string} key - unique bucket key, e.g. `${ip}:${route}`
 * @param {number} windowMs - window length in ms
 * @param {number} max - max requests allowed per window
 * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
 */
export function checkRateLimit(key, windowMs, max) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const allowed = bucket.count <= max;
  return { allowed, remaining: Math.max(0, max - bucket.count), resetAt: bucket.resetAt };
}

// Tighter windows for auth-sensitive endpoints (brute force / OTP-spam /
// account-enumeration targets), a generous default for everything else.
// Keys are the FULL request pathname (see apiHandler.js's own comment on
// why) — e.g. "POST:/api/user/login", not "POST:/login".
export const AUTH_RATE_LIMITS = {
  "POST:/api/user/login":                     { windowMs: 15 * 60 * 1000, max: 8 },
  "POST:/api/user/register":                  { windowMs: 60 * 60 * 1000, max: 5 },
  "POST:/api/user/verify-email":              { windowMs: 15 * 60 * 1000, max: 10 },
  "POST:/api/user/resend-verification-otp":   { windowMs: 60 * 60 * 1000, max: 5 },
  "PUT:/api/user/forgot-password":            { windowMs: 60 * 60 * 1000, max: 5 },
  "PUT:/api/user/verify-forgot-password-otp": { windowMs: 15 * 60 * 1000, max: 10 },
  "PUT:/api/user/reset-password":             { windowMs: 60 * 60 * 1000, max: 5 },
  "POST:/api/user/refresh-token":             { windowMs: 15 * 60 * 1000, max: 30 },

  // Section 4 additions:
  // Search — generous enough for normal typeahead use (a person typing a
  // query fires several requests quickly) but bounded against a scripted
  // scraper hammering it — each search hits the DB with a regex/text
  // query, which is exactly the kind of endpoint worth protecting from
  // being used as a free load-generator.
  "POST:/api/product/search":                 { windowMs: 60 * 1000,      max: 30 },

  // Cloudinary upload — every call here costs real Cloudinary
  // transformation/storage quota, not just server CPU, so this is as much
  // a cost-control measure as a security one.
  "PUT:/api/user/upload-avatar":              { windowMs: 60 * 60 * 1000, max: 15 },
  "POST:/api/file/upload":                    { windowMs: 60 * 60 * 1000, max: 30 },

  // Stripe — every call creates a real Checkout Session against Stripe's
  // API, which has its own rate limits and, more importantly, each
  // created (even unpaid/abandoned) session is a real object in the
  // merchant's Stripe account. Bounding this protects both Stripe API
  // quota and against a script spamming session creation.
  "POST:/api/order/checkout":                 { windowMs: 15 * 60 * 1000, max: 10 },
  "POST:/api/order/pay-delivery-charge":      { windowMs: 15 * 60 * 1000, max: 10 },
};
export const DEFAULT_RATE_LIMIT = { windowMs: 5 * 60 * 1000, max: 300 };

// ── 3. Brute-force detection, progressive delays, IP blocking ─────────
//
// The rate limiter above already bounds how often ONE IP can hit /login —
// but that alone misses two real attack shapes:
//   (a) ONE ACCOUNT targeted from MANY DIFFERENT IPs (distributed brute
//       force) — the per-IP rate limit never trips because no single IP
//       crosses its own threshold.
//   (b) ONE IP trying MANY DIFFERENT ACCOUNTS (credential stuffing /
//       password spraying) — each individual account only sees one or two
//       failed attempts, so nothing about any single account looks like
//       an attack, but the IP's aggregate behavior clearly is one.
// This section adds two more, independent signals on top of the rate
// limiter to cover both: per-ACCOUNT progressive lockout (a), and
// per-IP blocking based on how many DISTINCT accounts it's failed against
// (b). Same honest limitation as the rate limiter above: in-memory,
// per-process, resets on restart — fine for this project's architecture,
// would need a shared store if horizontally scaled.

const accountFailures = new Map(); // email -> { count, lockedUntil }
const ipFailures = new Map();      // ip -> { emails: Set<string>, blockedUntil }

const LOCKOUT_THRESHOLD = 5;          // failed attempts before an account locks at all
const LOCKOUT_BASE_MS = 30 * 1000;    // first lockout: 30s
const LOCKOUT_MAX_MS = 30 * 60 * 1000; // cap: 30 minutes
const IP_DISTINCT_ACCOUNT_THRESHOLD = 8; // distinct accounts failed from one IP → credential-stuffing signal
const IP_BLOCK_MS = 60 * 60 * 1000;      // 1 hour

if (typeof globalThis.__spf_bruteForceCleanupStarted === "undefined") {
  globalThis.__spf_bruteForceCleanupStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, v] of accountFailures) {
      if (v.lockedUntil && v.lockedUntil <= now && now - v.lastFailureAt > 60 * 60 * 1000) accountFailures.delete(key);
    }
    for (const [key, v] of ipFailures) {
      if (v.blockedUntil && v.blockedUntil <= now && now - v.lastFailureAt > 60 * 60 * 1000) ipFailures.delete(key);
    }
  }, 10 * 60 * 1000).unref?.();
}

/** Call before attempting a login, to check whether this account/IP should be blocked outright. */
export function checkLoginAllowed(email, ip) {
  const now = Date.now();
  const acct = accountFailures.get(email);
  if (acct?.lockedUntil > now) {
    return { allowed: false, reason: "account", retryAfterMs: acct.lockedUntil - now };
  }
  const ipRec = ipFailures.get(ip);
  if (ipRec?.blockedUntil > now) {
    return { allowed: false, reason: "ip", retryAfterMs: ipRec.blockedUntil - now };
  }
  return { allowed: true };
}

/** Call after a failed login attempt. Progressive delay: lockout duration doubles each failure past the threshold. */
export function recordFailedLogin(email, ip) {
  const now = Date.now();

  const acct = accountFailures.get(email) || { count: 0, lockedUntil: 0, lastFailureAt: now };
  acct.count += 1;
  acct.lastFailureAt = now;
  if (acct.count >= LOCKOUT_THRESHOLD) {
    const stage = acct.count - LOCKOUT_THRESHOLD; // 0, 1, 2, 3...
    acct.lockedUntil = now + Math.min(LOCKOUT_MAX_MS, LOCKOUT_BASE_MS * 2 ** stage);
  }
  accountFailures.set(email, acct);

  const ipRec = ipFailures.get(ip) || { emails: new Set(), blockedUntil: 0, lastFailureAt: now };
  ipRec.emails.add(email);
  ipRec.lastFailureAt = now;
  if (ipRec.emails.size >= IP_DISTINCT_ACCOUNT_THRESHOLD) {
    ipRec.blockedUntil = now + IP_BLOCK_MS;
  }
  ipFailures.set(ip, ipRec);

  return {
    accountLocked: acct.lockedUntil > now,
    accountRetryAfterMs: Math.max(0, acct.lockedUntil - now),
    ipBlocked: ipRec.blockedUntil > now,
  };
}

/** Call after a successful login — clears this account's failure count. Deliberately does NOT clear the IP's distinct-account tracking; one successful login among many failed different-account attempts from the same IP is itself still a credential-stuffing signal, not evidence the IP is safe. */
export function recordSuccessfulLogin(email) {
  accountFailures.delete(email);
}
// ── 4. Client IP extraction ─────────────────────────────────────────
// (used by both the brute-force tracking above and the rate limiter above)
export function getClientIp(nextRequest) {
  const xff = nextRequest.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = nextRequest.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

// Companion to the above for controllers: they only ever see apiHandler.js's
// mock request, whose `.headers` is already a plain object (not a real
// Headers instance with `.get()`), so they need this instead.
export function getClientIpFromPlainHeaders(headers = {}) {
  const xff = headers["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  return headers["x-real-ip"]?.trim() || "unknown";
}

// ── 5. CSRF protection via Origin/Referer verification ─────────────────
//
// This app authenticates with httpOnly cookies, which browsers attach
// automatically to same-origin AND (depending on SameSite) some
// cross-origin requests — the classic CSRF setup. Rather than adding a
// separate CSRF-token issue/verify dance (meaningful extra surface for a
// single-origin app — frontend and API already share one Next.js server
// per next.config.mjs), this uses the modern, OWASP-recommended
// alternative: verify the browser-supplied Origin (falling back to
// Referer) header against the site's own origin for every state-changing
// request. Browsers set Origin on all fetch/XHR/form POSTs and — crucially
// — it cannot be forged by a script running on a *different* origin, which
// is exactly the CSRF scenario this defends against. GET/HEAD/OPTIONS are
// exempt since they aren't supposed to mutate state.
export function isSameOriginRequest(nextRequest) {
  const method = nextRequest.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;

  const allowedOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  // If the admin hasn't set this, we can't safely compare — don't false-
  // positive-block every request in an incompletely-configured deployment;
  // SETUP.md already documents this env var as required.
  if (!allowedOrigin) return true;

  const origin = nextRequest.headers.get("origin");
  const referer = nextRequest.headers.get("referer");
  const source = origin || referer;
  if (!source) {
    // No Origin/Referer at all — legitimate for same-origin non-CORS
    // requests in some older browsers/proxies, but also what a bare
    // server-to-server forged request looks like. Given this app's cookies
    // are httpOnly + SameSite=Lax (see user.controller.js), a real
    // cross-site browser CSRF attempt would still be blocked by SameSite
    // itself; this header check is defense-in-depth on top of that, not
    // the only layer, so we don't hard-fail an absent header here.
    return true;
  }
  try {
    const sourceOrigin = new URL(source).origin;
    const expectedOrigin = new URL(allowedOrigin).origin;
    return sourceOrigin === expectedOrigin;
  } catch {
    return true; // malformed header — fail open here, SameSite is still the primary defense
  }
}
