import { createNextHandler } from "@/lib/apiHandler";
import auth from "@/server/middlewares/auth";
import { checkPermission } from "@/server/middlewares/permission";
import {
  getActiveCampaignsController,
  getAllCampaignsController,
  getCampaignByIdController,
  createCampaignController,
  updateCampaignController,
  deleteCampaignController,
  addProductToCampaignController,
  removeProductFromCampaignController,
} from "@/server/controllers/campaign.controller";

// Fixed paths must be declared before the /:id catch-all so exact
// matches are tried first (see findRoute in apiHandler.js).
const ROUTES = {
  "GET:/active":           [[], getActiveCampaignsController],
  "GET:/all":              [[auth, checkPermission("campaigns", "view")],   getAllCampaignsController],
  "POST:/create":          [[auth, checkPermission("campaigns", "create")], createCampaignController],
  "PUT:/update":           [[auth, checkPermission("campaigns", "edit")],   updateCampaignController],
  "DELETE:/delete":        [[auth, checkPermission("campaigns", "delete")], deleteCampaignController],
  "POST:/add-product":     [[auth, checkPermission("campaigns", "edit")],   addProductToCampaignController],
  "POST:/remove-product":  [[auth, checkPermission("campaigns", "edit")],   removeProductFromCampaignController],
  // Public catch-all — keep LAST
  "GET:/:id":              [[], getCampaignByIdController],
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
