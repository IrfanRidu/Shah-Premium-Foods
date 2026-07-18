import { createNextHandler } from "@/lib/apiHandler";
import auth from "@/server/middlewares/auth";
import { checkPermission } from "@/server/middlewares/permission";
import {
  getSiteSettingsController,
  updateSiteSettingsController,
  addBannerController,
  deleteBannerController,
  addPaymentMethodController,
  deletePaymentMethodController,
  updateFaqController,
  getFaqController,
} from "@/server/controllers/siteSettings.controller";

const ROUTES = {
  "GET:/get":              [[], getSiteSettingsController],
  "PUT:/update":           [[auth, checkPermission("settings", "edit")], updateSiteSettingsController],
  "POST:/banner/add":      [[auth, checkPermission("settings", "edit")], addBannerController],
  "DELETE:/banner/delete": [[auth, checkPermission("settings", "edit")], deleteBannerController],
  "POST:/payment-method/add":      [[auth, checkPermission("settings", "edit")], addPaymentMethodController],
  "DELETE:/payment-method/delete": [[auth, checkPermission("settings", "edit")], deletePaymentMethodController],
  "GET:/faq":              [[], getFaqController],
  "PUT:/faq":              [[auth, checkPermission("settings", "edit")], updateFaqController],
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
