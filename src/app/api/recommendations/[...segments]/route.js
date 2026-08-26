import { createNextHandler } from "@/lib/apiHandler";
import { optionalAuth } from "@/server/middlewares/auth";
import { getHomepageRecommendationsController } from "@/server/controllers/recommendation.controller";

// Session 8, Phase 8. `optionalAuth`, not `auth` — this endpoint must
// work for guests (personalizing off sessionId alone, per spec Section
// 6) as well as logged-in users; `auth` would hard-reject anyone
// without a valid token, which is wrong for a homepage endpoint every
// visitor hits. Same middleware, same reasoning, as the real bug just
// found and fixed in the activity route (src/app/api/activity/
// [...segments]/route.js) — `optionalAuth` attaches `req.userId` when a
// valid token exists, but never rejects when it's absent.
const ROUTES = {
  "GET:/homepage": [[optionalAuth], getHomepageRecommendationsController],
};

// Same reasoning as every other route in this app that reads
// request-varying, live DB state (see activity/[...segments]/route.js's
// own "Fix 3" comment) — without this, Next.js could statically cache a
// response that's supposed to be personalized per visitor.
export const dynamic = "force-dynamic";

const h = (req, ctx) => createNextHandler(req, ctx.params, ROUTES);
export { h as GET, h as POST, h as PUT, h as DELETE };
