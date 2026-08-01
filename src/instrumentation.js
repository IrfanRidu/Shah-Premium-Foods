// Section 12 (Monitoring) — instrumentation.js.
//
// Next.js's own documented hook: a `register()` export here runs once,
// early, per runtime the app uses (Node.js server, and separately Edge —
// this app genuinely uses both, since middleware.js runs on Edge). This
// is where BOTH pieces of this section's monitoring setup are wired in,
// since both need exactly this same "run once at startup, per runtime"
// point:
//
//   1. OpenTelemetry, via @vercel/otel — chosen over hand-rolling
//      @opentelemetry/sdk-node + exporter packages because this app's
//      documented deploy target IS Vercel (VERCEL_DEPLOYMENT.md); the
//      Vercel-maintained package is the simpler, more version-safe,
//      "matches where this actually runs" choice. registerOTel() is
//      Node-runtime only — OpenTelemetry's SDK isn't Edge-compatible —
//      so it's gated to `NEXT_RUNTIME === "nodejs"`.
//   2. Sentry's server/edge init (see sentry.server.config.js /
//      sentry.edge.config.js for the actual Sentry.init() calls and the
//      fuller explanation of the DSN-driven, safe-no-op-until-configured
//      approach, and the honest version-drift caveat) — each loaded only
//      for its own matching runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerOTel } = await import("@vercel/otel");
    registerOTel({ serviceName: "shah-premium-foods" });

    await import("../sentry.server.config.js");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config.js");
  }
}
