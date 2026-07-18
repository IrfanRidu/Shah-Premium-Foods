import { NextResponse } from "next/server";
import connectDb from "@/lib/mongodb";

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

  try {
    if (contentType.includes("multipart/form-data")) {
      // Native FormData parsing — replaces multer in the Next.js context
      const formData = await nextRequest.formData();
      for (const [key, value] of formData.entries()) {
        if (typeof value === "string") {
          body[key] = value;
        } else if (value && typeof value.arrayBuffer === "function") {
          // File / Blob
          file = {
            buffer: Buffer.from(await value.arrayBuffer()),
            originalname: value.name || "upload",
            mimetype: value.type || "application/octet-stream",
            size: value.size || 0,
            fieldname: key,
          };
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
          sameSite: options.sameSite ?? (isProd ? "none" : "lax"),
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
export async function createNextHandler(nextRequest, params, routes) {
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

  // Reconstruct the sub-path from Next.js catch-all segments
  // e.g.  params = { segments: ["banner","add"] }  →  path = "/banner/add"
  const segments = params?.segments || [];
  const path     = segments.length ? "/" + segments.join("/") : "/";
  const method   = nextRequest.method;

  const match = findRoute(method, path, routes);
  if (!match) {
    return NextResponse.json(
      { message: `No route: ${method} ${path}`, error: true, success: false },
      { status: 404 }
    );
  }

  const [middlewares, controller] = match.handler;
  const mockReq = await buildMockRequest(nextRequest, match.params);
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
