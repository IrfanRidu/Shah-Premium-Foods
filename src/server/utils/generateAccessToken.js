import jwt from "jsonwebtoken";

const generateAccessToken = (userId) => {
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
  const token = jwt.sign({ id: userId }, secret, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRE || "15m",
  });

  return token;
};

export default generateAccessToken;
