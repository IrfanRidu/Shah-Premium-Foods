import { NextResponse } from "next/server";

// Section 12 (Monitoring) — liveness probe.
//
// Kubernetes-style vocabulary the user asked for by name, so it's worth
// being explicit about what it actually means here: liveness answers ONE
// question — "is this process itself able to respond to a request at
// all," nothing more. It deliberately does NOT check the database or any
// other dependency (that's readiness, see ready/route.js) — the whole
// point of the liveness/readiness split in container orchestration is
// that a FAILED liveness check tells the orchestrator to RESTART the
// container, while a failed readiness check just tells it to stop
// ROUTING TRAFFIC there until it recovers. If this endpoint checked the
// database and Mongo had a rough five minutes, an orchestrator watching
// liveness would repeatedly restart a perfectly healthy Node process for
// a problem restarting it can't fix — the classic liveness-probe
// footgun. This has to stay this simple to actually do its job.
//
// Honest caveat: this app's documented primary deploy target is Vercel
// serverless (VERCEL_DEPLOYMENT.md), which doesn't have a literal
// "restart this pod" concept the way Kubernetes/ECS do — there's no
// long-running container here for a liveness probe to protect in that
// sense. This endpoint is still genuinely useful today (uptime-monitoring
// services, or a load balancer health check if this is ever fronted by
// one) and is what a future containerized/self-hosted deployment would
// need — implemented correctly now rather than treated as dead weight
// because it doesn't map perfectly onto the current hosting model.
export async function GET() {
  return NextResponse.json(
    { status: "alive", timestamp: new Date().toISOString() },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}

export const dynamic = "force-dynamic";
