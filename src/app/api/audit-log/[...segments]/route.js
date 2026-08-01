import { createNextHandler } from "@/lib/apiHandler";
import auth from "@/server/middlewares/auth";
import { superAdminOnly } from "@/server/middlewares/permission";
import { getAuditLogsController } from "@/server/controllers/auditLog.controller";

// Section 13 (Admin Panel Security) — SUPERADMIN-only, not the general
// checkPermission(module, action) pattern most other resources use: an
// audit trail of what every admin did is itself sensitive enough that
// regular ADMIN accounts shouldn't be able to browse it, only the one
// role that can't be demoted/removed by anyone else. superAdminOnly
// already includes the IP-whitelist check too (see permission.js).
const ROUTES = {
  "GET:/list": [[auth, superAdminOnly], getAuditLogsController],
};

// Same reasoning as every other route file in this app (see e.g.
// api/settings/[...segments]/route.js's own comment) — the actual
// DB-reading logic lives inside the shared apiHandler.js helper, which
// Next's static analyzer doesn't see through on its own, so without this
// a GET route like this one could get statically cached and serve stale
// audit entries instead of hitting the database fresh every time.
export const dynamic = "force-dynamic";

const h = (req, ctx) => createNextHandler(req, ctx.params, ROUTES);
export { h as GET };
