import { createNextHandler } from "@/lib/apiHandler";
import auth, { optionalAuth } from "@/server/middlewares/auth";
import { checkPermission, superAdminOnly } from "@/server/middlewares/permission";
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
  "POST:/create":  [[optionalAuth], createTicketController], // customers can open tickets without staff perms; optionalAuth so a logged-in Demo Admin is still recognized and intercepted (see apiHandler.js) rather than silently writing a real ticket
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
  // Session 2: create/update/delete tightened to superAdminOnly — the CRM
  // spec is explicit ("Only Super Admin can: Create agents, Delete agents,
  // Suspend agents"). Previously these three used checkPermission
  // ("customerCare","edit"), which a CALL_CENTER_AGENT technically also
  // passes (their role grants exactly that permission) even though the UI
  // never exposed these actions to them — this closes that gap for real
  // rather than relying on the UI alone.
  // Session 3 bug report ("call center agent can access admin/super admin
  // dashboard"): listing was left at customerCare.view on the theory that
  // "seeing the roster isn't one of the restricted actions" — but the
  // frontend's Call Center tab (customer-care/page.jsx) rendered the full
  // roster (name/email/phone/status) together with the Add/Edit/Delete
  // Agent controls as ONE unit with no role check on the tab itself, so in
  // practice any customerCare-permission holder — a plain CALL_CENTER_AGENT,
  // or even a legacy ADMIN — saw the whole management panel. The tab is now
  // hidden from non-Super-Admins there; tightened here too so a direct API
  // call can't still pull the roster (coworkers' contact info) after the UI
  // fix. Nothing else in the app calls this endpoint (verified — grep for
  // getCallCenterAgents finds exactly one call site, the now-gated tab).
  "GET:/agents":        [[auth, superAdminOnly], listCallCenterAgentsController],
  "POST:/agents":       [[auth, superAdminOnly], createCallCenterAgentController],
  "PUT:/agents":        [[auth, superAdminOnly], updateCallCenterAgentController],
  "DELETE:/agents":     [[auth, superAdminOnly], deleteCallCenterAgentController],
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
