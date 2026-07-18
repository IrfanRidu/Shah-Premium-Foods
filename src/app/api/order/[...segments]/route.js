import { createNextHandler } from "@/lib/apiHandler";
import auth from "@/server/middlewares/auth";
import { checkPermission } from "@/server/middlewares/permission";
import {
  cashOnDeliveryOrderController,
  paymentController,
  payCodDeliveryChargeController,
  getOrderDetailsController,
  getOrderByIdController,
  cancelOwnOrderController,
  getAllOrdersController,
  updateOrderStatusController,
} from "@/server/controllers/order.controller";

// NOTE: POST /api/order/webhook is handled by the dedicated
// src/app/api/order/webhook/route.js file (raw body for Stripe).
const ROUTES = {
  "POST:/cash-on-delivery":     [[auth], cashOnDeliveryOrderController],
  "POST:/checkout":             [[auth], paymentController],
  "POST:/pay-delivery-charge":  [[auth], payCodDeliveryChargeController],
  "GET:/order-list":            [[auth], getOrderDetailsController],
  "PUT:/cancel":                [[auth], cancelOwnOrderController],
  // Admin routes — fixed paths must appear before the /:id catch-all
  "GET:/all-orders":            [[auth, checkPermission("orders", "view")], getAllOrdersController],
  "PUT:/update-status":         [[auth, checkPermission("orders", "edit")], updateOrderStatusController],
  // Catch-all single-order lookup — keep LAST so it doesn't shadow the paths above
  "GET:/:id":                   [[auth], getOrderByIdController],
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
