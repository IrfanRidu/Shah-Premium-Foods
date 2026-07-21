import jwt from "jsonwebtoken";
import { createSession } from "./sessionManager.js";

const DEFAULT_EXPIRE = "7d";

function parseDurationToMs(str) {
  const match = /^(\d+)([smhd])$/.exec(str || DEFAULT_EXPIRE);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  const unitMs = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 }[match[2]];
  return n * unitMs;
}

// Security audit: this used to just sign a JWT and overwrite a single
// `refresh_token` field on the user document — meaning only ONE refresh
// token could ever be valid at a time, so logging in on a second device
// silently invalidated the first device's session. Now creates a real
// per-device session (see sessionManager.js / user.model.js) and embeds
// that session's random `tokenId` as the JWT's `jti` claim, so multiple
// devices can each hold their own valid, independently-revocable refresh
// token at once — and see generateRefreshToken's caller in
// user.controller.js for how rotation + reuse detection use that `jti` on
// every subsequent refresh.
const generateRefreshToken = async (userId, mockReq) => {
  const secret = process.env.JWT_SECRET_REFRESH;
  if (!secret) {
    throw new Error(
      "JWT_SECRET_REFRESH is not set in environment variables. Add it (any long random string, different from JWT_SECRET_ACCESS) to your .env / hosting platform's environment variables and restart the server."
    );
  }

  const expireStr = process.env.REFRESH_TOKEN_EXPIRE || DEFAULT_EXPIRE;
  const expiresAt = new Date(Date.now() + parseDurationToMs(expireStr));
  const tokenId = await createSession(userId, mockReq, expiresAt);

  const token = jwt.sign({ id: userId, jti: tokenId }, secret, { expiresIn: expireStr });

  return token;
};

export default generateRefreshToken;
