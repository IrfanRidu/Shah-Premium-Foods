// Section 12 (Monitoring) — Sentry, browser runtime.
//
// Uses NEXT_PUBLIC_SENTRY_DSN, not SENTRY_DSN — this file's code ships to
// and runs in the browser, and Next.js only inlines environment variables
// prefixed `NEXT_PUBLIC_` into client bundles; a plain `SENTRY_DSN` read
// here would just be `undefined` at runtime. (A DSN is meant to be
// public/embeddable by design — same trust model as, say, a Stripe
// *publishable* key — so this isn't a secret-exposure concern, just a
// Next.js env-var mechanics one worth getting right.) See
// sentry.server.config.js for the fuller explanation of the version-drift
// caveat and why DSN-unset is a safe no-op.
//
// Loaded automatically by the Sentry Next.js webpack plugin (via
// withSentryConfig in next.config.mjs) for the client bundle — unlike the
// server/edge configs, this one is NOT imported from instrumentation.js
// (that hook doesn't run in the browser).
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  // Session Replay: off by default (0 sample rate) even with a DSN
  // configured — recording real user sessions has real privacy/consent
  // implications this codebase isn't making a policy call on; left as an
  // explicit opt-in the user can raise once they've decided that's
  // something they want and have handled accordingly (e.g. mentioning it
  // in a privacy policy).
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  integrations: [Sentry.replayIntegration()],
  debug: false,
});
