import { createNextHandler } from "@/lib/apiHandler";
import auth from "@/server/middlewares/auth";
import { checkPermission } from "@/server/middlewares/permission";
import {
  getDashboardMetricsController,
  getTrendingProductsController,
  getBestSellingProductsController,
  getLowSellingProductsController,
  getNeverSoldProductsController,
  getAllTimeBestSellingController,
} from "@/server/controllers/analytics.controller";
import {
  getAnalyticsSettingsController,
  updateAnalyticsSettingsController,
} from "@/server/controllers/analyticsSettings.controller";
import { getFinancialMetricsController } from "@/server/controllers/analyticsFinancial.controller";
import { getInventorySalesMetricsController } from "@/server/controllers/analyticsInventorySales.controller";
import { getCustomerOrderMetricsController } from "@/server/controllers/analyticsCustomerOrder.controller";
import { getMarketingMetricsController } from "@/server/controllers/analyticsMarketing.controller";
import { getExpenseAnalysisController } from "@/server/controllers/analyticsExpense.controller";

// Fix 34–40: every analytics tab wired to a real endpoint. All of these
// controllers already existed on disk (built in earlier work) except
// Marketing (Fix 38) and Expense Analysis (Fix 39), which were written this
// pass — but NONE of them were reachable from the frontend until now, since
// this route file only ever exposed the original single dashboard.
const ROUTES = {
  "GET:/dashboard":    [[auth, checkPermission("analytics", "view")], getDashboardMetricsController],
  "GET:/trending":     [[], getTrendingProductsController],
  "GET:/best-selling": [[], getBestSellingProductsController],
  "GET:/low-selling":  [[], getLowSellingProductsController],
  "GET:/never-sold":   [[], getNeverSoldProductsController],
  "GET:/all-time-best":[[], getAllTimeBestSellingController],

  "GET:/settings":     [[auth, checkPermission("analytics", "view")], getAnalyticsSettingsController],
  "PUT:/settings":     [[auth, checkPermission("analytics", "edit")], updateAnalyticsSettingsController],

  "GET:/financial":    [[auth, checkPermission("analytics", "view")], getFinancialMetricsController],
  "GET:/inventory-sales": [[auth, checkPermission("analytics", "view")], getInventorySalesMetricsController],
  "GET:/customer-order":  [[auth, checkPermission("analytics", "view")], getCustomerOrderMetricsController],
  "GET:/marketing":    [[auth, checkPermission("analytics", "view")], getMarketingMetricsController],
  "GET:/expenses":     [[auth, checkPermission("analytics", "view")], getExpenseAnalysisController],
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
