import { getHomepageRecommendations } from "../services/homepageRecommendationService.js";

// Session 8, Phase 8 (new feature spec, Section 29 — RECOMMENDATION API).
// Deliberately thin — all real logic lives in
// homepageRecommendationService.js (kept testable as plain functions, no
// req/res coupling); this controller's only job is translating between
// HTTP and that service.
//
// userId: read from `req.userId`, which is ONLY ever set by verified JWT
// middleware (optionalAuth on this route — see the route file's own
// comment for why this specific middleware, and a real pre-existing bug
// that was found and fixed alongside this same file). Never read from
// the query string — a client-supplied userId would let anyone request
// another person's personalized recommendations just by passing their
// id, which is exactly the kind of cross-user data exposure the spec's
// own Section 35 (security) explicitly calls out to guard against.
// sessionId: DOES come from the query string — unlike userId, a guest
// session id isn't a credential that grants access to anything
// sensitive by itself (the same lower-risk trust decision
// logActivityController already makes for the identical field), so
// trusting whatever the client sends here is fine.
export const getHomepageRecommendationsController = async (req, res) => {
  try {
    const userId = req.userId || null;
    const sessionId = req.query?.sessionId || "";
    const data = await getHomepageRecommendations({ userId, sessionId });
    return res.json({ success: true, error: false, data });
  } catch (err) {
    // Section 36 (error handling) — a broken recommendation pipeline
    // must never take down the homepage. Real fallback content is the
    // caller's job (the frontend, when this is wired into a homepage in
    // a later phase) — this controller's own responsibility is just to
    // fail in a clean, predictable, non-throwing shape rather than
    // letting an unhandled rejection surface as a raw 500 with no
    // structure the frontend could act on.
    console.error("[getHomepageRecommendationsController]", err.message);
    return res.status(500).json({ success: false, error: true, message: "Could not load recommendations", data: null });
  }
};
