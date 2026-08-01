// Section 12 (Monitoring) — Sentry, Node.js server runtime.
//
// "Prepare Sentry" — this file, its client/edge counterparts, and the
// next.config.mjs wrapper are the complete, correct integration
// scaffolding, but Sentry fundamentally requires an external account and
// a real DSN to do anything at all. Nothing here is faked or stubbed —
// with SENTRY_DSN unset (the default, see .env.example), Sentry's SDK
// itself no-ops safely; set it and this activates with no further code
// changes. Loaded from instrumentation.js when NEXT_RUNTIME === "nodejs"
// (see that file) — Next.js's documented integration point for
// per-runtime startup code, which is also where this app's OpenTelemetry
// setup (@vercel/otel) is registered, since both need exactly this same
// "run once, early, per runtime" hook.
//
// Note on version drift, stated honestly: Sentry's Next.js SDK
// integration conventions have shifted across major versions (older ones
// relied on Next.js auto-loading these three files by name alone; current
// ones load them explicitly from instrumentation.js, as done here). This
// sandbox has no network access to install @sentry/nextjs and confirm
// against the exact version that ends up in node_modules. This is the
// well-established, broadly-compatible pattern; after `npm install`,
// running `npx @sentry/wizard@latest -i nextjs` is worth doing once to
// confirm it matches whatever version actually installs, and will offer
// to update these files if anything's shifted since.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // Percentage of transactions captured for performance monitoring. Kept
  // low by default — full tracing on every request is expensive at real
  // traffic volumes; raise this (or use tracesSampler for more nuanced
  // rules) once real usage patterns are known. 0 in development, since
  // there's no value in sending local dev traffic to Sentry by default.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  // Session Replay isn't applicable server-side; only relevant in
  // sentry.client.config.js.
  debug: false,
});
