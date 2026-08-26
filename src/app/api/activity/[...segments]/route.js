import { createNextHandler } from "@/lib/apiHandler";
import auth, { optionalAuth } from "@/server/middlewares/auth";
import { checkPermission } from "@/server/middlewares/permission";
import {
  logActivityController,
  getSuggestionsController,
  getRecentlyViewedController,
  getActivitySummaryController,
} from "@/server/controllers/activity.controller";

// Session 8, Phase 8 — found and fixed a real, pre-existing bug while
// building the recommendation system on top of this route: both
// controllers below read `req.userId` (correctly, for security — never
// trusting a client-supplied userId in the request body, only a value a
// verified JWT middleware attached) to recognize a logged-in user, but
// neither route was actually running ANY middleware that sets
// `req.userId` — `[[]]` is empty. The practical effect: EVERY logged-in
// user's activity was being logged with userId:null (guest tracking via
// sessionId still worked correctly, since sessionId is read directly
// from the body, a deliberately different and lower-risk trust decision
// than userId), and getSuggestionsController's own "if user logged in,
// use their activity" branch could never actually trigger. This
// silently undermined the affinity engine (Phase 3) specifically for
// the users personalization matters most for.
// `optionalAuth` (auth.js) is the exact right tool — attaches
// `req.userId` when a valid token is present, but (unlike `auth`) never
// rejects the request when it's absent, so both routes keep working
// for guests exactly as they did before this fix; the only change is
// that a LOGGED-IN caller is now actually recognized as one.
const ROUTES = {
  "POST:/log":             [[optionalAuth], logActivityController],
  "GET:/suggestions":      [[optionalAuth], getSuggestionsController],
  "GET:/recently-viewed":  [[auth], getRecentlyViewedController],
  "GET:/summary":          [[auth, checkPermission("analytics", "view")], getActivitySummaryController],
};

// Fix 3: without this, Next.js can statically cache this route's
// GET responses (the actual DB-reading logic lives in the shared
// apiHandler.js helper, not directly in this file, so Next's static
// analyzer doesn't reliably detect it as dynamic on its own) — which
// is exactly why order counts / dashboards could show stale data
// instead of the latest DB state. Forcing dynamic rendering makes
// every request hit the database fresh, every time.
export const dynamic = "force-dynamic";

const h = (req, ctx) => createNextHandler(req, ctx.params, ROUTES);
export { h as GET, h as POST, h as PUT, h as DELETE };
