/** @type {import('next').NextConfig} */
const nextConfig = {
  // Security audit (OWASP A05 — Security Misconfiguration): don't advertise
  // "X-Powered-By: Next.js" on every response. Free, minor-but-real
  // reconnaissance info for an attacker; Next.js sends it by default.
  poweredByHeader: false,

  // Tell Next.js NOT to bundle these server-only packages — let Node.js
  // load them directly from node_modules at runtime. This avoids bundling
  // issues with packages that use native bindings or dynamic requires.
  // Note: this is `experimental.serverComponentsExternalPackages` on
  // Next.js 14.x (this project's version) — it only became the stable,
  // top-level `serverExternalPackages` in Next.js 15+. The old top-level
  // key was silently ignored and printed an "Invalid next.config.mjs
  // options" warning on every boot/build.
  experimental: {
    serverComponentsExternalPackages: [
      "mongoose",
      "bcryptjs",
      "jsonwebtoken",
      "cloudinary",
      "stripe",
      "resend",
      "multer",
    ],
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.cloudinary.com" },
      { protocol: "https", hostname: "placehold.co" },
    ],
  },

  env: {
    // Empty = same-origin (frontend + API share the same Next.js server).
    // Only set NEXT_PUBLIC_API_URL if the API is hosted on a different domain.
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "",
    NEXT_PUBLIC_CURRENCY_LOCALE:
      process.env.NEXT_PUBLIC_CURRENCY_LOCALE || "en-BD",
  },

  // Basic security headers (replaces helmet from the old Express setup).
  // Content-Security-Policy is deliberately NOT set here — see
  // src/middleware.js, which sets it instead because a strong script-src
  // needs a fresh nonce on every request, and a static header in this file
  // can't vary per-request the way middleware can.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options",    value: "nosniff" },
          { key: "X-Frame-Options",           value: "SAMEORIGIN" },
          { key: "X-XSS-Protection",          value: "1; mode=block" },
          { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=()" },

          // Security audit (Section 3 — headers): the rest of the
          // requested header set. Each one's own comment explains the
          // specific value chosen and, where relevant, why the strictest
          // possible value was deliberately NOT used.

          // Cross-Origin-Opener-Policy: isolates this site's top-level
          // browsing context from cross-origin windows that open it (or
          // that it opens), closing several cross-origin-window timing/
          // reference attacks (XS-Leaks). Safe here — this app's own
          // Stripe integration does a full top-level redirect
          // (`window.location.href = session.url`), never
          // `window.open()`/a popup, so there's no legitimate
          // `window.opener` relationship for this to break.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },

          // Cross-Origin-Embedder-Policy: deliberately set to
          // "credentialless" rather than the stricter "require-corp".
          // "require-corp" demands every cross-origin resource (Cloudinary/
          // Unsplash product images, Google Fonts, the Google Analytics
          // script) explicitly serve a Cross-Origin-Resource-Policy header
          // permitting embedding — which this app has no control over on
          // those third parties' side, and if even one of them doesn't set
          // it, "require-corp" fails CLOSED and silently breaks image/font/
          // script loading site-wide. "credentialless" gets most of the
          // same cross-origin-isolation security benefit while only
          // requiring CORP on resources loaded WITH credentials — normal
          // <img>/<script>/<link> tags without `crossorigin="use-credentials"`
          // (which is everything this app uses) are unaffected. Recommend
          // verifying product images, Google Fonts, and the GA script (if
          // configured in Site Settings → SEO) still load correctly after
          // deploying this — the safety margin here is real but this
          // specific combination genuinely can't be fully confidence-
          // checked without a live browser hitting the deployed site.
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },

          // Cross-Origin-Resource-Policy: this app's own responses (HTML
          // pages, API JSON, locally-served assets like /robots.txt) don't
          // need to be loadable by other origins' pages/scripts — actual
          // product images are hosted on Cloudinary, not served by this
          // app, so this has no effect on them. Doesn't affect Open Graph
          // scraping by social platforms (Facebook/Twitter/etc.) — CORP is
          // enforced by browsers on fetches they make, not by server-side
          // link-preview crawlers, which aren't browsers and don't apply it.
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },

          // X-DNS-Prefetch-Control: "off" — small privacy hardening,
          // stops the browser from speculatively resolving DNS for links
          // on the page before they're clicked (which can otherwise leak
          // browsing intent). Matches helmet.js's own secure default.
          { key: "X-DNS-Prefetch-Control", value: "off" },

          // X-Download-Options: "noopen" — legacy IE-only mitigation
          // (prevents a downloaded file from being opened directly in the
          // site's security context/zone). No effect on modern browsers;
          // harmless to send, included since it was explicitly requested.
          { key: "X-Download-Options", value: "noopen" },

          // Origin-Agent-Cluster: requests the browser put this origin in
          // its own dedicated agent cluster/process where supported —
          // an extra process-isolation boundary against certain
          // cross-origin side-channel attacks, on top of what COOP/COEP
          // already provide.
          { key: "Origin-Agent-Cluster", value: "?1" },

          // Only meaningful over HTTPS (browsers ignore it over plain HTTP),
          // so it's a safe no-op in local dev and a real hardening in
          // production behind TLS.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
