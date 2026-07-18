import { createNextHandler } from "@/lib/apiHandler";
import auth from "@/server/middlewares/auth";
import { superAdminOnly } from "@/server/middlewares/permission";
import {
  getAllRolesController,
  createRoleController,
  updateRoleController,
  deleteRoleController,
  assignUserRoleController,
  getMyPermissionsController,
} from "@/server/controllers/role.controller";

const ROUTES = {
  "GET:/all":              [[auth, superAdminOnly], getAllRolesController],
  "POST:/create":          [[auth, superAdminOnly], createRoleController],
  "PUT:/update":           [[auth, superAdminOnly], updateRoleController],
  "DELETE:/delete":        [[auth, superAdminOnly], deleteRoleController],
  "PUT:/assign":           [[auth, superAdminOnly], assignUserRoleController],
  "GET:/my-permissions":   [[auth], getMyPermissionsController],
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
