import { createNextHandler } from "@/lib/apiHandler";
import auth from "@/server/middlewares/auth";
import { checkPermission } from "@/server/middlewares/permission";
import {
  listTicketsController,
  createTicketController,
  updateTicketController,
  deleteTicketController,
} from "@/server/controllers/customerCare.controller";
import {
  getAllOrdersController,
  updateOrderStatusController,
} from "@/server/controllers/order.controller";
import {
  listCallCenterAgentsController,
  createCallCenterAgentController,
  updateCallCenterAgentController,
  deleteCallCenterAgentController,
} from "@/server/controllers/callCenterAgent.controller";
import {
  logCallInitiatedController,
  logCallOutcomeController,
  getMyPendingCallLogsController,
  getCallHistoryController,
} from "@/server/controllers/callLog.controller";

const ROUTES = {
  "GET:/list":     [[auth, checkPermission("customerCare", "view")], listTicketsController],
  "POST:/create":  [[], createTicketController], // customers can open tickets without staff perms
  "PUT:/update":   [[auth, checkPermission("customerCare", "edit")], updateTicketController],
  "DELETE:/delete":[[auth, checkPermission("customerCare", "edit")], deleteTicketController],
  // Fix #2: order visibility + status updates, scoped to the customerCare
  // permission (not orders) — reuses the exact same, already-correct order
  // controllers used by /dashboard/admin-orders, just gated differently so
  // a customer-care-only staff account doesn't need broad order access.
  "GET:/orders":        [[auth, checkPermission("customerCare", "view")], getAllOrdersController],
  "PUT:/orders/status": [[auth, checkPermission("customerCare", "edit")], updateOrderStatusController],
  // Call center agents — managed from within the Customer Care page, so
  // gated the same way as the rest of this page rather than under hrPayroll.
  "GET:/agents":        [[auth, checkPermission("customerCare", "view")], listCallCenterAgentsController],
  "POST:/agents":       [[auth, checkPermission("customerCare", "edit")], createCallCenterAgentController],
  "PUT:/agents":        [[auth, checkPermission("customerCare", "edit")], updateCallCenterAgentController],
  "DELETE:/agents":     [[auth, checkPermission("customerCare", "edit")], deleteCallCenterAgentController],
  // Fix 12: call logging — initiate/outcome are usable by any agent with
  // customerCare access; the aggregated history view is scoped to
  // analytics permission (super admin by default) since it's cross-agent
  // reporting, not day-to-day agent work.
  "POST:/calls/initiate": [[auth, checkPermission("customerCare", "edit")], logCallInitiatedController],
  "PUT:/calls/outcome":   [[auth, checkPermission("customerCare", "edit")], logCallOutcomeController],
  "GET:/calls/pending":   [[auth, checkPermission("customerCare", "edit")], getMyPendingCallLogsController],
  "GET:/calls/history":   [[auth, checkPermission("analytics", "view")], getCallHistoryController],
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
