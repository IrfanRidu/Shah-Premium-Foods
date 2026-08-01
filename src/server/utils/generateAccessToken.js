import jwt from "jsonwebtoken";

// Section 13 (Admin Panel Security) — admin session timeout. ADMIN/
// SUPERADMIN accounts get a meaningfully shorter token lifetime than
// regular customers: elevated privileges mean a stolen/left-open admin
// session is a bigger blast radius than a customer one, so it's worth
// forcing more frequent re-authentication specifically for those roles.
// Regular customers keep the existing 15m default, unchanged.
const ADMIN_ROLES = new Set(["ADMIN", "SUPERADMIN"]);
const DEFAULT_ACCESS_EXPIRE = "15m";
const ADMIN_ACCESS_EXPIRE = process.env.ADMIN_ACCESS_TOKEN_EXPIRE || "10m";

const generateAccessToken = (userId, role) => {
  const secret = process.env.JWT_SECRET_ACCESS;
  if (!secret) {
    throw new Error(
      "JWT_SECRET_ACCESS is not set in environment variables. Add it (any long random string) to your .env / hosting platform's environment variables and restart the server."
    );
  }

  // Security audit: was 5h, which isn't meaningfully "short-lived" for an
  // access token in an enterprise sense — a stolen 5h token stays valid
  // for a 5h window with no way to revoke it (JWTs are stateless/
  // self-verifying by design). 15 minutes paired with refresh token
  // rotation (see generateRefreshToken.js / sessionManager.js) means a
  // leaked access token is only useful for a short window, while the
  // refresh flow (which the frontend already calls on 401 — see
  // src/lib/axios.js) keeps the user seamlessly logged in.
  const expiresIn = ADMIN_ROLES.has(role)
    ? ADMIN_ACCESS_EXPIRE
    : (process.env.ACCESS_TOKEN_EXPIRE || DEFAULT_ACCESS_EXPIRE);

  const token = jwt.sign({ id: userId }, secret, { expiresIn });

  return token;
};

export default generateAccessToken;
