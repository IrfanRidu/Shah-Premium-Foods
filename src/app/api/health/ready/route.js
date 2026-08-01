import { NextResponse } from "next/server";
import connectDb from "@/lib/mongodb";
import { withTimeout, TimeoutError } from "@/lib/apiObservability";

// Section 12 (Monitoring) — readiness probe: "can this instance actually
// serve traffic right now." Unlike liveness (live/route.js — deliberately
// dependency-free), this one genuinely checks the database, since a
// process that's technically running but can't reach Mongo can't usefully
// serve almost any real request in this app. A failing readiness check
// tells an orchestrator to stop ROUTING traffic to this instance (not
// restart it — restarting wouldn't fix a database outage) until it passes
// again; see live/route.js's own comment for the fuller
// liveness-vs-readiness distinction and the honest caveat about how well
// that maps onto this app's actual (Vercel serverless) deploy target.
//
// Bounded with the same withTimeout() helper apiHandler.js already uses
// for the whole request pipeline, rather than a bespoke one here — a
// readiness check that itself hangs indefinitely on a slow/stalled
// connection attempt would be worse than useless to whatever's polling it.
const READINESS_TIMEOUT_MS = 5_000;

export async function GET() {
  try {
    await withTimeout(connectDb(), READINESS_TIMEOUT_MS, "readiness db check");
    return NextResponse.json(
      { status: "ready", timestamp: new Date().toISOString(), checks: { database: "ok" } },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const reason = err instanceof TimeoutError ? "timeout" : "unreachable";
    return NextResponse.json(
      {
        status: "not_ready",
        timestamp: new Date().toISOString(),
        checks: { database: reason },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export const dynamic = "force-dynamic";
