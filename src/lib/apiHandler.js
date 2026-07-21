import { NextResponse } from "next/server";
import connectDb from "@/lib/mongodb";
import {
  sanitizeInput,
  checkRateLimit,
  getClientIp,
  isSameOriginRequest,
  AUTH_RATE_LIMITS,
  DEFAULT_RATE_LIMIT,
} from "@/lib/security";
import { validateUploadedFile, scanFileForViruses } from "@/lib/fileUploadSecurity";
import {
  generateRequestId,
  resolveCorrelationId,
  logRequest,
  withTimeout,
  TimeoutError,
  CACHE_PRIVATE_NO_STORE,
} from "@/lib/apiObservability";

// ── Cookie header parser ───────────────────────────────────────────────────
function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  const result = {};
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    result[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return result;
}

// ── Build a mock Express-like request from a Next.js Request ──────────────
async function buildMockRequest(nextRequest, matchedParams = {}) {
  const url = new URL(nextRequest.url);
  const contentType = nextRequest.headers.get("content-type") || "";

  let body = {};
  let file = null;
  let fileError = null;

  try {
    if (contentType.includes("multipart/form-data")) {
      // Native FormData parsing — replaces multer in the Next.js context.
      // Security audit: multer.js (src/server/middlewares/multer.js) was
      // never actually imported anywhere in this app — its 5MB size limit
      // was decorative, dead code. This is where multipart parsing
      // genuinely happens, so this is where the real limit needs to be
      // enforced, along with magic-byte validation (see
      // lib/fileUploadSecurity.js for why that matters more than checking
      // the client-supplied MIME type/extension alone) and a virus-scan
      // hook.
      const formData = await nextRequest.formData();
      for (const [key, value] of formData.entries()) {
        if (typeof value === "string") {
          body[key] = value;
        } else if (value && typeof value.arrayBuffer === "function") {
          // File / Blob
          const buffer = Buffer.from(await value.arrayBuffer());
          const candidate = {
            buffer,
            originalname: value.name || "upload",
            mimetype: value.type || "application/octet-stream",
            size: value.size || 0,
            fieldname: key,
          };

          const validation = validateUploadedFile(candidate);
          if (!validation.valid) {
            fileError = validation.reason;
            break;
          }
          const scan = await scanFileForViruses(candidate);
          if (!scan.clean) {
            fileError = "This file was flagged by security scanning and can't be uploaded.";
            break;
          }

          // Security audit: random filename. The original client-supplied
          // filename is deliberately NOT propagated any further than this
          // point — it's never used as a storage key/path anywhere, only
          // kept here for logging/display purposes. uploadImageCloudinary.js
          // uploads without an explicit `public_id`, so Cloudinary
          // generates its own random one; this originalname is not passed
          // to it.
          file = candidate;
        }
      }
    } else if (contentType.includes("application/json")) {
      body = await nextRequest.json();
    }
  } catch {
    // Body parsing failed — leave body / file at their defaults
  }

  const query = {};
  url.searchParams.forEach((v, k) => { query[k] = v; });

  return {
    method: nextRequest.method,
    url: nextRequest.url,
    // These get populated by auth / permission middlewares:
    userId: null,
    userRole: null,
    rolePermissions: null,
    cookies: parseCookies(nextRequest.headers.get("cookie")),
    headers: Object.fromEntries(nextRequest.headers.entries()),
    body,
    file,
    fileError,
    query,
    params: { ...matchedParams },
  };
}

// ── Build a mock Express-like response ────────────────────────────────────
function buildMockResponse() {
  let statusCode = 200;
  let responseData = null;
  let responseText = null;
  let responseSent = false;
  const cookieOps = [];

  const res = {
    _isSent: () => responseSent,

    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      responseData = data;
      responseSent = true;
      return res;
    },
    send(data) {
      responseText = String(data);
      responseSent = true;
      return res;
    },
    cookie(name, value, options = {}) {
      cookieOps.push({ name, value: String(value), options, clear: false });
      return res;
    },
    clearCookie(name, options = {}) {
      cookieOps.push({
        name,
        value: "",
        options: { ...options, maxAge: 0, expires: new Date(0) },
        clear: true,
      });
      return res;
    },

    _toNextResponse() {
      const isProd = process.env.NODE_ENV === "production";

      let response;
      if (responseText !== null) {
        response = new Response(responseText, {
          status: statusCode,
          headers: { "Content-Type": "text/plain" },
        });
      } else {
        response = NextResponse.json(responseData, { status: statusCode });
      }

      for (const { name, value, options } of cookieOps) {
        if (!(response instanceof NextResponse)) break;
        const cookieDef = {
          name,
          value,
          httpOnly: options.httpOnly !== false,
          secure: options.secure ?? isProd,
          // Security audit: fixed the same issue already fixed in
        // user.controller.js's shared `cookieOptions` (see that file's
        // own comment for the full reasoning) — this fallback default
        // was still "none" in production, which would silently apply
        // to any FUTURE `res.cookie()` call anywhere in the codebase
        // that doesn't explicitly pass its own `sameSite` option. The
        // one current caller always passes it explicitly, so this was a
        // latent landmine rather than an active bug, but the fallback
        // itself needed the same fix, not just the one call site that
        // happens to override it today.
        sameSite: options.sameSite ?? "lax",
        path: options.path || "/",
        };
        if (options.maxAge !== undefined) cookieDef.maxAge = options.maxAge;
        if (options.expires)             cookieDef.expires = options.expires;
        response.cookies.set(cookieDef);
      }

      return response;
    },
  };

  return res;
}

// ── Route matching ─────────────────────────────────────────────────────────
// Supports static paths  ("GET:/login")
// and param patterns     ("GET:/:id")
function matchPattern(pattern, actual) {
  const pp = pattern.split("/").filter(Boolean);
  const ap = actual.split("/").filter(Boolean);
  if (pp.length !== ap.length) return null;
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(":")) {
      params[pp[i].slice(1)] = ap[i];
    } else if (pp[i] !== ap[i]) {
      return null;
    }
  }
  return params;
}

function findRoute(method, path, routes) {
  // 1. Exact match (highest priority)
  const exactKey = `${method}:${path}`;
  if (routes[exactKey]) return { handler: routes[exactKey], params: {} };

  // 2. Pattern match  (e.g. /:id)
  for (const [key, handler] of Object.entries(routes)) {
    const sep = key.indexOf(":");
    const rm  = key.slice(0, sep);
    const rp  = key.slice(sep + 1);
    if (rm !== method || !rp.includes(":")) continue;
    const params = matchPattern(rp, path);
    if (params !== null) return { handler, params };
  }

  return null;
}

// ── Core handler ──────────────────────────────────────────────────────────
// Usage in each API route file:
//
//   const ROUTES = {
//     "POST:/login": [[], loginController],
//     "GET:/user-details": [[auth], getUserDetailsController],
//     "GET:/:id": [[auth, checkPermission("orders","view")], getOrderByIdController],
//   };
//
//   const h = (req, ctx) => createNextHandler(req, ctx.params, ROUTES);
//   export { h as GET, h as POST, h as PUT, h as DELETE };
//
async function handleRequest(nextRequest, params, routes) {
  // Reconstruct the sub-path from Next.js catch-all segments
  // e.g.  params = { segments: ["banner","add"] }  →  path = "/banner/add"
  const segments = params?.segments || [];
  const path     = segments.length ? "/" + segments.join("/") : "/";
  const method   = nextRequest.method;
  // Rate-limiting audit: use the FULL request path (e.g.
  // "/api/product/search"), not just the reconstructed sub-path
  // ("/search"), as the rate-limit bucket key. The sub-path alone is only
  // unique WITHIN one resource group's route map — two different resource
  // groups could each have their own "/search" or "/upload" sub-path, and
  // a sub-path-only key would silently apply one group's rate-limit
  // config to the other's identically-named route. The full pathname is
  // globally unique by construction, closing that off entirely.
  const routeKey = `${method}:${nextRequest.nextUrl.pathname}`;

  // ── CSRF: verify Origin/Referer before doing any work at all ──────────
  if (!isSameOriginRequest(nextRequest)) {
    return NextResponse.json(
      { message: "Request blocked: origin verification failed.", error: true, success: false },
      { status: 403 }
    );
  }

  // ── Rate limiting ───────────────────────────────────────────────────
  // Auth-sensitive routes get their own tight per-IP-per-route bucket;
  // everything else shares one generous per-IP bucket. Checked before the
  // DB connection so a flood doesn't even cost a connection-pool slot.
  const ip = getClientIp(nextRequest);
  const authLimit = AUTH_RATE_LIMITS[routeKey];
  const { windowMs, max } = authLimit || DEFAULT_RATE_LIMIT;
  const bucketKey = authLimit ? `${ip}:${routeKey}` : `${ip}:default`;
  const { allowed, resetAt } = checkRateLimit(bucketKey, windowMs, max);
  if (!allowed) {
    return NextResponse.json(
      {
        message: "Too many requests. Please try again shortly.",
        error: true,
        success: false,
      },
      { status: 429, headers: { "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)) } }
    );
  }

  // Ensure a DB connection is alive before any controller runs
  try {
    await connectDb();
  } catch (err) {
    console.error("DB connection failed:", err.message);
    return NextResponse.json(
      { message: "Database unavailable", error: true, success: false },
      { status: 503 }
    );
  }

  const match = findRoute(method, path, routes);
  if (!match) {
    return NextResponse.json(
      { message: `No route: ${method} ${path}`, error: true, success: false },
      { status: 404 }
    );
  }

  const [middlewares, controller] = match.handler;
  const mockReq = await buildMockRequest(nextRequest, match.params);

  // File upload security: reject before any middleware/controller sees
  // the request at all if the uploaded file failed validation (wrong/
  // spoofed type, too large, empty, or flagged by the virus-scan hook —
  // see fileUploadSecurity.js).
  if (mockReq.fileError) {
    return NextResponse.json(
      { message: mockReq.fileError, error: true, success: false },
      { status: 400 }
    );
  }

  // NoSQL injection / prototype pollution: deep-clean body, query, and
  // params before any middleware or controller ever sees them — see
  // sanitizeInput()'s own comment in security.js for exactly what this
  // closes and why it has to happen here, in one place, rather than being
  // left to each controller.
  mockReq.body   = sanitizeInput(mockReq.body);
  mockReq.query  = sanitizeInput(mockReq.query);
  mockReq.params = sanitizeInput(mockReq.params);

  // Section 8 (API Security) audit finding: a very widespread pattern
  // across roughly a dozen list/pagination endpoints
  // (inventory/customer/product/analytics/support-ticket/product-request/
  // activity controllers, etc.) accepts a client-supplied `limit` with a
  // sane-looking DEFAULT but no UPPER BOUND — e.g. `limit = limit || 10`
  // has nothing stopping a caller from sending `limit: 999999` instead
  // and forcing the server to build/serialize an enormous result set on
  // a single request. Rather than touch every one of those controllers
  // individually (real risk of a typo breaking one of them, for a fix
  // that's identical in every case), this clamps any `limit` field found
  // on ANY request's query or body, globally, to a generous-but-bounded
  // ceiling — 200 is comfortably above every legitimate default already
  // used anywhere in this codebase (the highest is 15), so this can't
  // break any existing normal usage, only the abuse case.
  const GLOBAL_MAX_LIMIT = 200;
  for (const bucket of [mockReq.query, mockReq.body]) {
    if (bucket && bucket.limit !== undefined) {
      const n = Number(bucket.limit);
      if (Number.isFinite(n) && n > GLOBAL_MAX_LIMIT) bucket.limit = String(GLOBAL_MAX_LIMIT);
    }
  }

  const mockRes = buildMockResponse();

  // ── Middleware chain ──────────────────────────────────────────────────
  // Each middleware either calls next() to continue or res.json/send() to stop.
  for (const mw of middlewares) {
    if (mockRes._isSent()) break;

    let chainContinues = false;

    // Capture original methods so we can restore them after the middleware runs
    const origJson = mockRes.json.bind(mockRes);
    const origSend = mockRes.send.bind(mockRes);

    await new Promise((resolve) => {
      let settled = false;

      function settle(cont) {
        if (!settled) {
          settled        = true;
          chainContinues = cont;
          // Restore original methods before unblocking the await
          mockRes.json = origJson;
          mockRes.send = origSend;
          resolve();
        }
      }

      // Override so we detect when a middleware terminates the chain
      mockRes.json = function (data) { origJson(data); settle(false); return mockRes; };
      mockRes.send = function (data) { origSend(data); settle(false); return mockRes; };

      Promise.resolve(mw(mockReq, mockRes, () => settle(true))).catch(() =>
        settle(false)
      );
    });

    if (!chainContinues) return mockRes._toNextResponse();
  }

  // ── Controller ────────────────────────────────────────────────────────
  await controller(mockReq, mockRes);
  return mockRes._toNextResponse();
}

// Section 8 (API Security) audit: request/correlation IDs, structured
// logging, a global timeout, and a global error-handling safety net —
// applied here so they cover the entire API surface (all 23 resource
// groups) from one place, same strategy as every other cross-cutting
// concern already in this file (sanitization, rate limiting, CSRF).
//
// This is also a direct, structural fix for the class of problem
// diagnosed earlier (see STATUS.md "Batch 12"): an uncaught error from a
// controller or middleware that forgot its own try/catch used to
// propagate all the way up through Next.js's own error handling, which
// in dev mode could cascade into the confusing React-hook-call crash
// that was traced back to a stale build, not application code — but the
// UNDERLYING gap (nothing here caught a raw thrown error) was real
// regardless of what actually triggered it that time. Now it can't
// happen: anything thrown anywhere in the chain below is caught here and
// turned into the same standard `{ message, error, success }` shape
// every other error response in this app already uses.
const REQUEST_TIMEOUT_MS = 25_000;
const API_VERSION = "1.0";

export async function createNextHandler(nextRequest, params, routes) {
  const requestId = generateRequestId();
  const correlationId = resolveCorrelationId(nextRequest);
  const startedAt = Date.now();
  const method = nextRequest.method;
  const path = nextRequest.nextUrl.pathname;

  let response;
  try {
    response = await withTimeout(
      handleRequest(nextRequest, params, routes),
      REQUEST_TIMEOUT_MS,
      `${method} ${path}`
    );
  } catch (err) {
    const isTimeout = err instanceof TimeoutError;
    if (isTimeout) {
      console.error(`[timeout] ${method} ${path} (requestId=${requestId})`);
    } else {
      // Standard API Security practice: log the real error server-side
      // (with a requestId to cross-reference), but never leak the raw
      // error message/stack to the client — that can expose internal
      // paths, query structure, or library versions. The client gets a
      // generic message plus the requestId so a support/debugging
      // conversation can look it up in server logs.
      console.error(`[unhandled] ${method} ${path} (requestId=${requestId})`, err);
    }
    response = NextResponse.json(
      {
        message: isTimeout
          ? "The request took too long to process. Please try again."
          : "Something went wrong on our end. Please try again.",
        error: true,
        success: false,
        requestId,
      },
      { status: isTimeout ? 504 : 500 }
    );
  }

  // Standard API Security practice: every response, success or failure,
  // carries the same identifying headers — makes it possible to
  // correlate a specific client-reported issue with an exact server log
  // line, and to trace one logical operation across multiple API calls
  // via the correlation ID.
  response.headers.set("X-Request-Id", requestId);
  response.headers.set("X-Correlation-Id", correlationId);
  // Caching: default every API response to `private, no-store` unless a
  // controller has already set its own Cache-Control (none currently do
  // — this is a safe, conservative default for the whole app, not a
  // per-endpoint tuning pass). The real security concern this addresses:
  // most of this API's responses are either authenticated/personal
  // (orders, profile, cart) or admin data — a shared proxy/CDN caching
  // one of those because nothing said not to would be a genuine
  // sensitive-data-exposure bug, not just a staleness annoyance.
  // Deliberately NOT adding selective public-caching rules for specific
  // "safe" endpoints (e.g. category lists) in this pass — picking the
  // wrong one and shipping a stale-data bug that can't be verified in
  // this sandbox is a worse outcome than every response being
  // consistently fresh-but-uncached.
  if (!response.headers.has("Cache-Control")) {
    response.headers.set("Cache-Control", CACHE_PRIVATE_NO_STORE);
  }
  // Versioning: header-based rather than a breaking `/api/v1/...` URL
  // restructure — this codebase's ~150 routes and every frontend call
  // site already assume the current unversioned paths, and retroactively
  // moving them would be a large, purely mechanical, high-regression-risk
  // change for a project with no actual second API version to
  // distinguish yet. A header is meaningful, non-breaking, forward-
  // compatible groundwork: if a real v2 is ever introduced, clients can
  // already detect which version answered them, and the response shape
  // itself doesn't need to change to add this.
  response.headers.set("X-API-Version", API_VERSION);

  logRequest({
    requestId,
    correlationId,
    method,
    path,
    status: response.status,
    durationMs: Date.now() - startedAt,
    ip: getClientIp(nextRequest),
  });

  return response;
}
