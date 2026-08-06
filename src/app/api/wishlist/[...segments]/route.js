import { createNextHandler } from "@/lib/apiHandler";
import auth from "@/server/middlewares/auth";
import {
  getWishlistController,
  addToWishlistController,
  removeFromWishlistController,
  toggleWishlistController,
} from "@/server/controllers/wishlist.controller";

const ROUTES = {
  "GET:/list":      [[auth], getWishlistController],
  "POST:/add":      [[auth], addToWishlistController],
  "DELETE:/remove": [[auth], removeFromWishlistController],
  "POST:/toggle":   [[auth], toggleWishlistController],
};

// Same reasoning as address/[...segments]/route.js: force dynamic
// rendering so a wishlist fetch always hits the DB fresh rather than
// risking a statically-cached, stale response.
export const dynamic = "force-dynamic";

const h = (req, ctx) => createNextHandler(req, ctx.params, ROUTES);
export { h as GET, h as POST, h as PUT, h as DELETE };
