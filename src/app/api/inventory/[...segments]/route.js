import { createNextHandler } from "@/lib/apiHandler";
import auth from "@/server/middlewares/auth";
import { checkPermission } from "@/server/middlewares/permission";
import {
  getInventoryController,
  adjustStockController,
  getInventoryLogsController,
  getLowStockController,
  markDamagedController,
  getDamagedInventoryController,
} from "@/server/controllers/inventory.controller";

const ROUTES = {
  "GET:/list":       [[auth, checkPermission("inventory", "view")], getInventoryController],
  "POST:/adjust":    [[auth, checkPermission("inventory", "edit")], adjustStockController],
  "GET:/logs":       [[auth, checkPermission("inventory", "view")], getInventoryLogsController],
  "GET:/low-stock":  [[auth, checkPermission("inventory", "view")], getLowStockController],
  // Fix 36: damaged/dead-stock marking — controllers already existed but
  // were never wired into a route, so the feature was unreachable.
  "POST:/mark-damaged": [[auth, checkPermission("inventory", "edit")], markDamagedController],
  "GET:/damaged":       [[auth, checkPermission("inventory", "view")], getDamagedInventoryController],
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
