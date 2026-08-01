// Section 12 (Monitoring) — Sentry, Edge runtime.
//
// Genuinely needed, not boilerplate for its own sake: middleware.js in
// this app runs on the Edge runtime (a Next.js requirement for
// Middleware, not a choice — see that file's own notes from the Section 9
// performance pass), so Edge-runtime errors need their own Sentry init;
// the Node server config above never runs there. See
// sentry.server.config.js for the fuller explanation of this file's role,
// the version-drift caveat, and why DSN-unset is a safe no-op rather than
// an error.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  debug: false,
});
