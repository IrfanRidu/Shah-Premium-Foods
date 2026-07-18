import { createNextHandler } from "@/lib/apiHandler";
import auth from "@/server/middlewares/auth";
import { checkPermission } from "@/server/middlewares/permission";
import {
  listEmployeesController, createEmployeeController, updateEmployeeController, deleteEmployeeController,
  listPayrollController, upsertPayrollController,
} from "@/server/controllers/hrPayroll.controller";

const ROUTES = {
  "GET:/employees":        [[auth, checkPermission("hrPayroll", "view")], listEmployeesController],
  "POST:/employees":       [[auth, checkPermission("hrPayroll", "edit")], createEmployeeController],
  "PUT:/employees":        [[auth, checkPermission("hrPayroll", "edit")], updateEmployeeController],
  "DELETE:/employees":     [[auth, checkPermission("hrPayroll", "edit")], deleteEmployeeController],
  "GET:/payroll":          [[auth, checkPermission("hrPayroll", "view")], listPayrollController],
  "POST:/payroll":         [[auth, checkPermission("hrPayroll", "edit")], upsertPayrollController],
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
