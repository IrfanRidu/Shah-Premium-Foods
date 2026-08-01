// Section 9 (Performance) — "Bundle analyzer". @next/bundle-analyzer is
// listed in package.json's devDependencies; run `npm install` once, then
// `npm run analyze` to build with it and open the visual bundle report.
// Wrapped so a normal `next dev`/`next build` (ANALYZE unset) never even
// evaluates the analyzer's own webpack plugin — no cost when not in use.
import bundleAnalyzer from "@next/bundle-analyzer";
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

// Section 12 (Monitoring) — Sentry. See sentry.server.config.js for the
// fuller explanation of the "prepared but inert without a real DSN"
// approach and the honest version-drift caveat (this sandbox has no
// network access to confirm this against the exact @sentry/nextjs version
// that ends up installed).
import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Security audit (OWASP A05 — Security Misconfiguration): don't advertise
  // "X-Powered-By: Next.js" on every response. Free, minor-but-real
  // reconnaissance info for an attacker; Next.js sends it by default.
  poweredByHeader: false,

  // Section 9 (Performance) — "Compression Gzip Brotli". Explicit rather
  // than relying on the implicit default (`compress` already defaults to
  // true in Next.js, but leaving it implicit reads as "nobody decided
  // this"). What this actually does depends on how the app is run:
  //   - `next start` (self-hosted Node): this flag makes Next.js gzip
  //     responses itself via its built-in compression middleware.
  //   - Vercel (see VERCEL_DEPLOYMENT.md, this app's documented deploy
  //     target): the edge network compresses every response with Brotli
  //     automatically, regardless of this setting — this flag is a no-op
  //     there but is kept for correctness if the app is ever self-hosted.
  //   - Self-hosting behind nginx/Caddy: a reverse proxy typically also
  //     compresses; having both Next's own gzip AND a proxy's gzip/brotli
  //     is safe (proxies negotiate Content-Encoding correctly, they don't
  //     double-compress), unlike hand-rolling compression inside API
  //     responses in apiHandler.js, which was deliberately NOT done (see
  //     that file's own comment) because a mismatched Content-Encoding
  //     from double-compressing would silently break responses in a way
  //     this sandbox can't test live.
  compress: true,

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
    // Section 9 (Performance) — "Image Optimization". AVIF is tried first
    // (smallest file size on browsers that support it), falling back to
    // WebP, then the original format — next/image negotiates this
    // automatically per-request via the browser's Accept header. Every
    // <img> in the app was converted to next/image as part of this same
    // pass (see components/ProductCard.jsx, Carousel.jsx, etc.).
    formats: ["image/avif", "image/webp"],
    // How long an optimized image variant is cached (server-side and at
    // any CDN in front of it) before Next.js will re-check/re-generate it.
    // Product/category/banner images are admin-uploaded and change
    // infrequently; 60s (Next's own default) means editors see a freshly
    // re-uploaded image quickly, so this is widened to 1 hour rather than
    // set to something very long — a deliberate middle ground, not the
    // most aggressive value possible.
    minimumCacheTTL: 3600,
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

// Section 12 (Monitoring): Sentry's build-time options (source map
// upload, release tagging) — every value here is env-var-driven and
// undefined/falsy by default, so this whole block is a safe no-op until
// the user sets up a real Sentry project and adds these to their
// environment (see .env.example). `silent: true` specifically avoids
// noisy Sentry CLI output on every build for anyone who hasn't configured
// it yet.
const sentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  // This app's own X-Powered-By removal (see poweredByHeader above) and
  // general "don't advertise implementation details" posture — matches
  // Sentry's own recommended hardening default.
  hideSourceMaps: true,
  disableLogger: true,
};

// Sentry wraps OUTERMOST, after bundle analyzer — its webpack plugin
// needs visibility into the FINAL webpack config, including whatever
// other plugins (like the bundle analyzer above) already changed, to
// correctly instrument it for source maps and automatic error tracking.
export default withSentryConfig(withBundleAnalyzer(nextConfig), sentryBuildOptions);
