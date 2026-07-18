import { createNextHandler } from "@/lib/apiHandler";
import auth from "@/server/middlewares/auth";
import { superAdminOnly } from "@/server/middlewares/permission";
import {
  registerUserController,
  verifyEmailController,
  resendVerificationOtpController,
  loginUserController,
  logoutUserController,
  uploadAvatarController,
  updateUserDetailsController,
  forgotPasswordController,
  verifyForgotPasswordOtpController,
  resetPasswordController,
  refreshTokenController,
  getUserDetailsController,
  getAllUsersController,
  updateUserRoleController,
} from "@/server/controllers/user.controller";

// Route map: "METHOD:/sub-path" → [[middlewares], controller]
// Multer is intentionally omitted — file parsing is handled by the
// multipart/form-data branch in apiHandler.js (buildMockRequest).
const ROUTES = {
  "POST:/register":                    [[], registerUserController],
  "POST:/verify-email":                [[], verifyEmailController],
  "POST:/resend-verification-otp":     [[], resendVerificationOtpController],
  "POST:/login":                       [[], loginUserController],
  "GET:/logout":                       [[auth], logoutUserController],
  "PUT:/upload-avatar":                [[auth], uploadAvatarController],
  "PUT:/update-account":               [[auth], updateUserDetailsController],
  "PUT:/forgot-password":              [[], forgotPasswordController],
  "PUT:/verify-forgot-password-otp":   [[], verifyForgotPasswordOtpController],
  "PUT:/reset-password":               [[], resetPasswordController],
  "POST:/refresh-token":               [[], refreshTokenController],
  "GET:/user-details":                 [[auth], getUserDetailsController],
  "GET:/all-users":                    [[auth, superAdminOnly], getAllUsersController],
  "PUT:/update-role":                  [[auth, superAdminOnly], updateUserRoleController],
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
