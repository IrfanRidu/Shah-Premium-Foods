import { createNextHandler } from "@/lib/apiHandler";
import auth from "@/server/middlewares/auth";
import { checkPermission, superAdminOnly } from "@/server/middlewares/permission";

import {
  getMyAgentStatusController,
  updateMyAgentStatusController,
  listAllAgentStatusesController,
  getMySipCredentialsController,
} from "@/modules/callcenter/controllers/agentStatus.controller";
import {
  updateCallStatusController,
  addCallNoteController,
  getCallLogController,
  listCallLogsController,
} from "@/server/controllers/callLog.controller";
import {
  createCallbackController,
  listCallbacksController,
  completeCallbackController,
  cancelCallbackController,
} from "@/modules/callcenter/controllers/callback.controller";
import {
  manualReassignController,
  autoAssignController,
  getOrderAssignmentHistoryController,
} from "@/modules/callcenter/controllers/assignment.controller";
import { getQueueController } from "@/modules/callcenter/controllers/queue.controller";
import {
  getMyDashboardStatsController,
  getMyRecentCallsController,
  getMyPerformanceController,
  getCompanyReportsController,
} from "@/modules/callcenter/controllers/dashboard.controller";
import { getSettingsController, updateSettingsController } from "@/modules/callcenter/controllers/settings.controller";
import {
  getChangeHistoryController,
  undoChangeController,
} from "@/modules/callcenter/controllers/changeLog.controller";
import {
  updateFollowUpController,
  addOrderNoteController,
  listCrmOrdersController,
  getOrderCrmDetailController,
} from "@/modules/callcenter/controllers/crmOrder.controller";

// Own resource group, separate from /api/customer-care/* (which keeps
// today's tickets + basic tel:-link call logging + agent CRUD exactly
// as they were, aside from the one deliberate agent-CRUD permission
// tightening made directly in that route file). This module is large
// enough to deserve its own catch-all rather than growing that file
// further. NOTE: /api/customer-care/calls/initiate, /calls/outcome,
// /calls/pending, and /calls/history are NOT duplicated here — they
// already exist there and keep working unchanged; this file only adds
// the NEW real-time-call and CRM capabilities layered on top.
const ROUTES = {
  // --- Agent presence --- (Socket.IO is primary; these are the REST
  // equivalents for initial page load / non-socket callers)
  "GET:/agent-status/me": [[auth, checkPermission("customerCare", "edit")], getMyAgentStatusController],
  "PUT:/agent-status/me": [[auth, checkPermission("customerCare", "edit")], updateMyAgentStatusController],
  // Super Admin: "Monitor all agents."
  "GET:/agent-status/all": [[auth, superAdminOnly], listAllAgentStatusesController],
  "GET:/telephony/credentials": [[auth, checkPermission("customerCare", "edit")], getMySipCredentialsController],

  // --- Calls (real-time lifecycle layered on the existing CallLog) ---
  "GET:/calls": [[auth, checkPermission("customerCare", "edit")], listCallLogsController],
  "GET:/calls/detail": [[auth, checkPermission("customerCare", "edit")], getCallLogController],
  "PUT:/calls/status": [[auth, checkPermission("customerCare", "edit")], updateCallStatusController],
  "POST:/calls/notes": [[auth, checkPermission("customerCare", "edit")], addCallNoteController],

  // --- Callbacks ---
  "POST:/callbacks": [[auth, checkPermission("customerCare", "edit")], createCallbackController],
  "GET:/callbacks": [[auth, checkPermission("customerCare", "edit")], listCallbacksController],
  "PUT:/callbacks/complete": [[auth, checkPermission("customerCare", "edit")], completeCallbackController],
  "PUT:/callbacks/cancel": [[auth, checkPermission("customerCare", "edit")], cancelCallbackController],

  // --- Assignment --- (spec: "Agents cannot: ...Assign agents" — both
  // manual reassignment AND an on-demand auto-assign trigger are super
  // admin actions; agents can still SEE the history on their own orders)
  "POST:/assignments/manual": [[auth, superAdminOnly], manualReassignController],
  "POST:/assignments/auto": [[auth, superAdminOnly], autoAssignController],
  "GET:/assignments/history": [[auth, checkPermission("customerCare", "view")], getOrderAssignmentHistoryController],

  // --- Queue --- (informational for agents, not a settings/config page)
  "GET:/queue": [[auth, checkPermission("customerCare", "view")], getQueueController],

  // --- Agent dashboard ---
  "GET:/dashboard/my-stats": [[auth, checkPermission("customerCare", "edit")], getMyDashboardStatsController],
  "GET:/dashboard/my-recent-calls": [[auth, checkPermission("customerCare", "edit")], getMyRecentCallsController],
  "GET:/dashboard/my-performance": [[auth, checkPermission("customerCare", "edit")], getMyPerformanceController],
  // Spec: "View all analytics, Export reports" — Super Admin only.
  "GET:/dashboard/company-reports": [[auth, superAdminOnly], getCompanyReportsController],

  // --- Settings --- (spec: "Change routing settings. Configure queues.
  // Manage hold music." — Super Admin only)
  "GET:/settings": [[auth, superAdminOnly], getSettingsController],
  "PUT:/settings": [[auth, superAdminOnly], updateSettingsController],

  // --- Change history / undo --- (spec: "View audit logs", "Undo any
  // agent action" — both explicitly Super Admin only)
  "GET:/change-log": [[auth, superAdminOnly], getChangeHistoryController],
  "POST:/change-log/undo": [[auth, superAdminOnly], undoChangeController],

  // --- Order follow-up + CRM notes --- (spec: agents "Can... Update
  // follow-up" / "Add notes")
  "PUT:/orders/follow-up": [[auth, checkPermission("customerCare", "edit")], updateFollowUpController],
  "POST:/orders/notes": [[auth, checkPermission("customerCare", "edit")], addOrderNoteController],
  // --- Order visibility --- (spec: "Agents can view: All Orders, My
  // Orders, Pending, Completed, Follow-up, Cancelled")
  "GET:/orders": [[auth, checkPermission("customerCare", "view")], listCrmOrdersController],
  "GET:/orders/detail": [[auth, checkPermission("customerCare", "view")], getOrderCrmDetailController],
};

// Same reasoning as the customer-care route: the actual DB reads live in
// the shared apiHandler.js helper, not directly in this file, so Next's
// static analyzer won't reliably detect this as dynamic on its own —
// force it, so live call/queue/agent-status data is never stale-cached.
export const dynamic = "force-dynamic";

const h = (req, ctx) => createNextHandler(req, ctx.params, ROUTES);
export { h as GET, h as POST, h as PUT, h as DELETE };
