import mongoose from "mongoose";

// ─────────────────────────────────────────────────────────────────────────
// Section 14 (Payment Security) — idempotency for the Stripe webhook.
//
// Stripe's own docs are explicit that a webhook endpoint should expect
// occasional duplicate deliveries (retries after a slow/ambiguous response,
// network issues on either side) and recommends tracking each event's `id`
// to avoid processing the same one twice. Before this, `webhookStripeController`
// (order.controller.js) had no such check at all — a duplicate delivery of
// the same `checkout.session.completed` event would have created a second
// order, decremented stock twice, and marked a coupon used twice.
//
// One document per successfully-claimed event `id`, with a UNIQUE index —
// see order.controller.js's own use of this (an atomic upsert-based
// "claim" pattern: attempt to insert, treat a duplicate-key error as "someone
// already claimed this event," not a real failure) for why a unique index
// is the actual enforcement mechanism here, not just an optimization: two
// concurrent deliveries of the same event racing each other are resolved
// correctly by MongoDB itself refusing the second insert, rather than by
// an application-level check-then-act that has its own race window.
//
// TTL index: Stripe stops retrying a webhook after about 3 days (per their
// own retry schedule). 30 days is a deliberately generous multiple of that
// — plenty of margin for anything unusual — while still bounding this
// collection's growth instead of keeping every processed event forever.
const processedWebhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    eventType: { type: String, default: "" }, // informational only (e.g. "checkout.session.completed") — not part of the uniqueness guarantee
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

processedWebhookEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

const ProcessedWebhookEventModel =
  mongoose.models.processedWebhookEvent ||
  mongoose.model("processedWebhookEvent", processedWebhookEventSchema);

export default ProcessedWebhookEventModel;
