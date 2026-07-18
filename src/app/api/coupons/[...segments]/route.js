import { createNextHandler } from "@/lib/apiHandler";
import auth from "@/server/middlewares/auth";
import { checkPermission } from "@/server/middlewares/permission";
import {
  validateCouponController,
  getAllCouponsController,
  getActiveCouponsController,
  createCouponController,
  updateCouponController,
  deleteCouponController,
  markCouponUsedController,
} from "@/server/controllers/coupon.controller";

const ROUTES = {
  "POST:/validate":  [[], validateCouponController],
  "GET:/active":     [[], getActiveCouponsController],
  "GET:/all":        [[auth, checkPermission("coupons", "view")],   getAllCouponsController],
  "POST:/create":    [[auth, checkPermission("coupons", "create")], createCouponController],
  "PUT:/update":     [[auth, checkPermission("coupons", "edit")],   updateCouponController],
  "DELETE:/delete":  [[auth, checkPermission("coupons", "delete")], deleteCouponController],
  "POST:/mark-used": [[auth, checkPermission("coupons", "edit")],   markCouponUsedController],
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
