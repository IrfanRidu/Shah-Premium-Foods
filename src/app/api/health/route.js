import { NextResponse } from "next/server";
import connectDb from "@/lib/mongodb";

// Section 12 (Monitoring) — general-purpose health endpoint.
//
// Deliberately NOT routed through lib/apiHandler.js's usual
// createNextHandler/ROUTES pipeline, unlike every other API resource group
// — that pipeline applies CSRF (Origin/Referer) checking and per-IP rate
// limiting before anything else runs, and requires a live DB connection
// before even reaching a controller (a hard 503 for the whole request if
// Mongo is unreachable). All three of those are wrong for a health
// endpoint specifically: monitoring services and orchestrators typically
// send bare requests with no Origin/Referer header at all (would fail
// CSRF), poll on a fixed short interval that could plausibly trip a rate
// limit meant for abuse (causing a false "unhealthy" verdict from the
// monitor hitting ITS OWN rate limiter, not a real outage), and — most
// importantly — collapsing on a DB failure exactly the same way every
// other endpoint does would make it impossible to distinguish "the
// process itself is fine" from "a dependency is down," which is the
// entire point of splitting this into three endpoints (this one, plus
// live/ and ready/ below). A plain, direct Route Handler is the right
// tool here, matching the precedent already set by
// app/api/order/webhook/route.js — another endpoint with genuinely
// different needs than the standard resource-group pipeline.
//
// This one reports database status informationally without FAILING the
// whole response if it's down — see ready/route.js for the endpoint that
// actually gates on it.
export async function GET() {
  const startedAt = Date.now();
  let dbStatus = "unknown";
  try {
    await connectDb();
    dbStatus = "connected";
  } catch {
    dbStatus = "unreachable";
  }

  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || "development",
      checks: { database: dbStatus },
      responseTimeMs: Date.now() - startedAt,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}

// Never statically cache a health check — every hit should reflect the
// current moment, not a build-time or ISR-revalidated snapshot.
export const dynamic = "force-dynamic";
