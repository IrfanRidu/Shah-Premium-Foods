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
    // Section 9 (Performance) font-optimization follow-on: fonts.googleapis.com
    // was here only for the manual Google Fonts <link rel="stylesheet">
    // layout.jsx used to render. That's gone — Inter/Playfair Display are
    // now loaded via next/font/google (src/lib/fonts.js), which downloads
    // and self-hosts the font files at build time. Nothing is fetched from
    // Google at runtime anymore, so both this and font-src below narrow to
    // 'self' only — a real tightening, not just a cleanup.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
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

  // Section 10 (SEO) — "Robots": every page.jsx in this app is a Client
  // Component (confirmed across the whole src/app tree), and Next.js only
  // allows a `metadata` / `generateMetadata` export from a Server
  // Component file — so per-route noindex metadata can't be added directly
  // to these pages without a separate pass-through layout.js wrapping each
  // one. The `X-Robots-Tag` response header says exactly the same thing at
  // the HTTP level (Google's own documented mechanism for this), and this
  // middleware already runs on every request in the app, so one addition
  // here covers every route below without touching ~10 page files
  // individually. Cart/checkout/auth screens are real, publicly-reachable
  // pages with no unique content worth ranking (and account/cart state
  // means any indexed snapshot would be stale or empty anyway) — the
  // correct tool for "don't index this, but crawling it is fine" is
  // noindex, not robots.txt Disallow (Disallow would hide the noindex
  // signal from the crawler entirely and can paradoxically leave a bare,
  // snippet-less URL indexed instead of none at all). /dashboard gets this
  // header too AND a robots.txt Disallow (see app/robots.txt/route.js) —
  // deliberate defense in depth, since it's also genuinely auth-walled.
  const NOINDEX_PATHS = [
    "/cart", "/checkout", "/login", "/register", "/forgot-password",
    "/reset-password", "/verify-otp", "/success", "/cancel", "/dashboard",
  ];
  const pathname = request.nextUrl.pathname;
  const isNoindex = NOINDEX_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isNoindex) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  // Apply to everything except static assets / Next internals, which don't
  // render HTML and don't need a nonce.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
