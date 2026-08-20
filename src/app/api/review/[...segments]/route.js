import { createNextHandler } from "@/lib/apiHandler";
import auth, { optionalAuth } from "@/server/middlewares/auth";
import { checkPermission } from "@/server/middlewares/permission";
import {
  getReviewsController,
  submitReviewController,
  deleteOwnReviewController,
  adminDeleteReviewController,
  toggleReviewHelpfulController,
  adminModerateReviewController,
  adminReplyReviewController,
} from "@/server/controllers/review.controller";

// Same shape as api/wishlist/[...segments]/route.js: `optionalAuth` on
// the public list route (so a logged-in caller also gets their own
// review/vote state in the same response, but a logged-out visitor can
// still read reviews at all); `auth` on self-service writes;
// `checkPermission("products", …)` on admin moderation — reviews are
// treated as a sub-resource of the existing "products" permission
// module rather than a new module, see PROGRESS_TRACKER.md Session 4
// for why.
const ROUTES = {
  "GET:/list":             [[optionalAuth], getReviewsController],
  "POST:/submit":          [[auth], submitReviewController],
  "DELETE:/delete":        [[auth], deleteOwnReviewController],
  "POST:/toggle-helpful":  [[auth], toggleReviewHelpfulController],
  "DELETE:/admin/delete":  [[auth, checkPermission("products", "delete")], adminDeleteReviewController],
  "PUT:/admin/moderate":   [[auth, checkPermission("products", "edit")], adminModerateReviewController],
  "POST:/admin/reply":     [[auth, checkPermission("products", "edit")], adminReplyReviewController],
};

// Same reasoning as every other API route in this app: force dynamic
// rendering so review data always hits the DB fresh, never a stale
// statically-cached response.
export const dynamic = "force-dynamic";

const h = (req, ctx) => createNextHandler(req, ctx.params, ROUTES);
export { h as GET, h as POST, h as PUT, h as DELETE };
