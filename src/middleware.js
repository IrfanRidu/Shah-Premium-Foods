import { NextResponse } from "next/server";

// Security audit: Content-Security-Policy, applied here (rather than as a
// static header in next.config.mjs) because a strong script-src needs a
// per-request nonce, which only middleware can generate fresh for each
// request. The nonce is threaded through to layout.jsx via the
// `x-csp-nonce` request header (readable there with `next/headers`), and
// the two inline <script> tags this app actually has (the Google
// Analytics snippet + the JSON-LD block, both in layout.jsx, both
// admin-configured content) carry that same nonce so the browser will run
// them but nothing else inline.
//
// This does mean any *new* inline <script> added anywhere else in the app
// later won't run under this CSP unless it's also given the nonce — that's
// the intended trade-off (it's what makes the policy meaningful against
// injected/XSS scripts) rather than an oversight; style-src still allows
// 'unsafe-inline' since this app uses inline `style={{}}` attributes
// extensively for dynamic values (carousel positioning, progress bars,
// etc.) and locking that down too would need a much larger refactor for a
// much weaker payoff (inline style injection is a far less dangerous
// primitive than inline script injection).
export function middleware(request) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const isDev = process.env.NODE_ENV !== "production";

  // Fix: Next.js dev mode's Fast Refresh / webpack HMR runtime loads
  // modules via `eval()` (see the browser console error this was added
  // to fix — it names `@next/react-refresh-utils/dist/runtime.js`
  // specifically), which a CSP without 'unsafe-eval' blocks outright and
  // breaks the dev server's hot-reloading entirely. This is a dev-tooling
  // requirement, not a production one — Next's production build never
  // uses eval() for its own code — so 'unsafe-eval' is only added when
  // NODE_ENV isn't "production". The deployed/production CSP stays exactly
  // as strict as before: nonce + self + the one named GA host, nothing else.
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' https://www.googletagmanager.com`
    : `script-src 'self' 'nonce-${nonce}' https://www.googletagmanager.com`;

  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://res.cloudinary.com https://*.cloudinary.com https://images.unsplash.com https://placehold.co",
    // ws:/wss: needed in dev for the HMR livereload websocket connection
    // back to the dev server; not needed (and not included) in production.
    `connect-src 'self' https://api.stripe.com https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com${isDev ? " ws: wss:" : ""}`,
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-csp-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Apply to everything except static assets / Next internals, which don't
  // render HTML and don't need a nonce.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
