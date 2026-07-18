import { NextResponse } from "next/server";
import connectDb from "@/lib/mongodb";
import { webhookStripeController } from "@/server/controllers/order.controller";

// This route must read the raw request body (not parsed JSON) so that
// Stripe can verify the webhook signature with the exact bytes it signed.
export async function POST(request) {
  try {
    await connectDb();
  } catch {
    return new Response("Database unavailable", { status: 503 });
  }

  // Read raw body as a Buffer — must happen BEFORE any json() call
  const rawBody = Buffer.from(await request.arrayBuffer());

  const mockReq = {
    method: "POST",
    headers: Object.fromEntries(request.headers.entries()),
    body: rawBody,        // Stripe's constructEvent expects the raw buffer/string
    cookies: {},
    query: {},
    params: {},
    userId: null,
  };

  let statusCode = 200;
  let responseData = null;
  let responseText = null;

  const mockRes = {
    status(code) { statusCode = code; return mockRes; },
    json(data)   { responseData = data; return mockRes; },
    send(data)   { responseText = String(data); return mockRes; },
  };

  await webhookStripeController(mockReq, mockRes);

  if (responseText !== null) {
    return new Response(responseText, { status: statusCode });
  }
  return NextResponse.json(responseData, { status: statusCode });
}
