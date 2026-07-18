import { createNextHandler } from "@/lib/apiHandler";
import auth from "@/server/middlewares/auth";
import { checkPermission } from "@/server/middlewares/permission";
import {
  addProductController,
  getProductsController,
  getProductsByCategoryController,
  getProductsByCategoryAndSubCategoryController,
  getProductDetailsController,
  updateProductController,
  deleteProductController,
  searchProductController,
} from "@/server/controllers/product.controller";

const ROUTES = {
  "POST:/add":                                      [[auth, checkPermission("products", "create")], addProductController],
  "POST:/get":                                      [[], getProductsController],
  "POST:/get-product-by-category":                  [[], getProductsByCategoryController],
  "POST:/get-product-by-category-and-subcategory":  [[], getProductsByCategoryAndSubCategoryController],
  "POST:/get-product-details":                      [[], getProductDetailsController],
  "PUT:/update":                                    [[auth, checkPermission("products", "edit")],   updateProductController],
  "DELETE:/delete":                                 [[auth, checkPermission("products", "delete")], deleteProductController],
  "POST:/search":                                   [[], searchProductController],
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
