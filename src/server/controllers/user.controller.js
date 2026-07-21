import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import UserModel from "../models/user.model.js";
import AddressModel from "../models/address.model.js";
import sendEmail from "../config/sendEmail.js";
import verifyEmailTemplate from "../utils/verifyEmailTemplete.js";
import forgotPasswordTemplate from "../utils/forgetPasswordTemplete.js";
import generateOtp from "../utils/generateOtp.js";
import generateAccessToken from "../utils/generateAccessToken.js";
import generateRefreshToken from "../utils/generateRefreshToken.js";
import uploadImageCloudinary from "../utils/uploadImageCloudinary.js";
import { validateNewPassword } from "../utils/passwordPolicy.js";
import { rotateSession, revokeSession, revokeAllSessions, revokeOtherSessions, listSessions } from "../utils/sessionManager.js";
import { checkLoginAllowed, recordFailedLogin, recordSuccessfulLogin, getClientIpFromPlainHeaders } from "@/lib/security";
import { isValidEmail, isValidMobile, isNonEmptyString } from "@/lib/validate";

// Security audit: bcrypt cost factor. Was 10 everywhere (register, reset,
// update-account) — raised to 12, the commonly recommended minimum for
// 2025+ hardware. Existing users' password hashes already stored at cost
// 10 keep working exactly as before (bcrypt encodes its own cost into the
// hash itself, so verification of an old hash is unaffected) — this only
// changes the cost used for hashes created going forward.
const BCRYPT_COST = 12;

// Security audit: was `sameSite: "None"` in production, which exists for
// genuinely cross-site cookie scenarios (a separate frontend domain, an
// embedded widget, etc.) and specifically weakens CSRF protection by
// telling the browser it's OK to send this cookie along with cross-site
// requests. This app is same-origin by design in production too — the
// frontend and API share one Next.js server/port (see axios.js's own
// comment on `baseURL`) — so there was never an actual reason for `None`
// here; it was strictly a downgrade. `Lax` (already used in dev) is
// correct for both environments: it still allows the cookie on top-level
// navigations (so following a link to the site works normally) while
// refusing it on cross-site subresource/fetch requests, which is exactly
// the CSRF scenario this needs to block. If this app is ever split across
// separate frontend/API domains, this would need to change back to
// `None` + `secure: true`, paired with a real CSRF token (the Origin-
// header check in security.js assumes a single origin).
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax",
};

// REGISTER
export const registerUserController = async (req, res) => {
  try {
    const { name, password } = req.body;
    const email = req.body.email?.trim().toLowerCase();

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required",
        error: true,
        success: false,
      });
    }

    // Section 8 (API Security) audit: format validation, not just
    // presence — catches obvious garbage before it reaches a DB query.
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email address.", error: true, success: false });
    }
    if (!isNonEmptyString(name, 100)) {
      return res.status(400).json({ message: "Please enter a valid name.", error: true, success: false });
    }

    const existingUser = await UserModel.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        message: "Email already registered",
        error: true,
        success: false,
      });
    }

    // Security audit: enforce password policy (common-password blocklist +
    // best-effort breach check) before any hashing/DB write happens.
    const passwordIssue = await validateNewPassword(password);
    if (passwordIssue) {
      return res.status(400).json({ message: passwordIssue, error: true, success: false });
    }

    const salt = await bcryptjs.genSalt(BCRYPT_COST);
    const hashedPassword = await bcryptjs.hash(password, salt);

    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const newUser = new UserModel({
      name,
      email,
      password: hashedPassword,
      email_verify_otp: otp,
      email_verify_otp_expiry: otpExpiry,
    });

    const savedUser = await newUser.save();

    // A failed email provider should never block account creation — the
    // account already exists at this point regardless of delivery outcome.
    const emailResult = await sendEmail({
      sendTo: email,
      subject: "Verify your email - Shah Premium Foods",
      html: verifyEmailTemplate({ name, otp }),
    });
    if (!emailResult?.success) {
      console.warn(`Verification email to ${email} did not send:`, emailResult?.error);
    }

    return res.status(201).json({
      message: "Account created. Please check your email for a verification code.",
      error: false,
      success: true,
      data: { _id: savedUser._id, name: savedUser.name, email: savedUser.email },
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// VERIFY EMAIL — expects { email, otp } to match the OTP the user received,
// not a Mongo _id (this used to be a link-based flow that didn't match the
// app's actual OTP-entry UI at all).
export const verifyEmailController = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const otp = req.body.otp || req.body.code; // accept either field name for backward compatibility

    if (!email || !otp) {
      return res.status(400).json({
        message: "Email and verification code are required",
        error: true,
        success: false,
      });
    }

    const user = await UserModel.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "Email not found",
        error: true,
        success: false,
      });
    }

    if (user.verify_email) {
      return res.json({ message: "Email already verified", error: false, success: true });
    }

    if (!user.email_verify_otp || !user.email_verify_otp_expiry || user.email_verify_otp_expiry < new Date()) {
      return res.status(400).json({
        message: "Verification code has expired. Please request a new one.",
        error: true,
        success: false,
      });
    }

    if (String(otp).trim() !== String(user.email_verify_otp)) {
      return res.status(400).json({
        message: "Invalid verification code",
        error: true,
        success: false,
      });
    }

    await UserModel.updateOne(
      { _id: user._id },
      { verify_email: true, email_verify_otp: null, email_verify_otp_expiry: null }
    );

    return res.json({
      message: "Email verified successfully",
      success: true,
      error: false,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// RESEND EMAIL VERIFICATION OTP
export const resendVerificationOtpController = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ message: "Email is required", error: true, success: false });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Email not found", error: true, success: false });
    }
    if (user.verify_email) {
      return res.json({ message: "Email already verified", error: false, success: true });
    }

    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + 60 * 60 * 1000);
    await UserModel.updateOne({ _id: user._id }, { email_verify_otp: otp, email_verify_otp_expiry: otpExpiry });

    const emailResult = await sendEmail({
      sendTo: email,
      subject: "Your new verification code - Shah Premium Foods",
      html: verifyEmailTemplate({ name: user.name, otp }),
    });
    if (!emailResult?.success) {
      console.warn(`Resent verification email to ${email} did not send:`, emailResult?.error);
    }

    return res.json({ message: "A new verification code has been sent", error: false, success: true });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// LOGIN
export const loginUserController = async (req, res) => {
  try {
    const { password } = req.body;
    const email = req.body.email?.trim().toLowerCase();

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
        error: true,
        success: false,
      });
    }

    // Security audit (Section 4 — rate limiting): brute-force detection,
    // on top of the per-IP-per-route rate limiter already applied to this
    // endpoint in apiHandler.js. Checked BEFORE the DB lookup even
    // happens, so a locked-out attempt costs nothing but a Map read. See
    // security.js's own top-of-section comment for exactly what this adds
    // that the plain rate limiter alone doesn't catch (distributed brute
    // force against one account, and credential stuffing across many
    // accounts from one IP).
    const ip = getClientIpFromPlainHeaders(req.headers);
    const preCheck = checkLoginAllowed(email, ip);
    if (!preCheck.allowed) {
      const minutes = Math.ceil(preCheck.retryAfterMs / 60000);
      return res.status(429).json({
        message:
          preCheck.reason === "account"
            ? `Too many failed attempts on this account. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
            : "Too many failed login attempts from this network. Please try again later.",
        error: true,
        success: false,
      });
    }

    const user = await UserModel.findOne({ email });

    if (!user) {
      recordFailedLogin(email, ip);
      return res.status(400).json({
        message: "User not registered",
        error: true,
        success: false,
      });
    }

    if (user.status !== "Active") {
      return res.status(403).json({
        message: "Your account is not active. Please contact support.",
        error: true,
        success: false,
      });
    }

    const checkPassword = await bcryptjs.compare(password, user.password);

    if (!checkPassword) {
      const { accountLocked, accountRetryAfterMs } = recordFailedLogin(email, ip);
      if (accountLocked) {
        const minutes = Math.ceil(accountRetryAfterMs / 60000);
        return res.status(429).json({
          message: `Too many failed attempts on this account. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
          error: true,
          success: false,
        });
      }
      return res.status(400).json({
        message: "Incorrect password",
        error: true,
        success: false,
      });
    }

    recordSuccessfulLogin(email);

    const accessToken = generateAccessToken(user._id);
    const refreshToken = await generateRefreshToken(user._id, req);

    await UserModel.updateOne(
      { _id: user._id },
      { last_login_date: new Date() }
    );

    res.cookie("accessToken", accessToken, cookieOptions);
    res.cookie("refreshToken", refreshToken, cookieOptions);

    const userData = await UserModel.findById(user._id)
      .select("-password -sessions -forgot_password_otp -forgot_password_expiry")
      .populate("address_details");

    return res.json({
      message: "Login successful",
      error: false,
      success: true,
      data: {
        accessToken,
        refreshToken,
        data: userData,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// LOGOUT (current device only)
export const logoutUserController = async (req, res) => {
  try {
    const userId = req.userId;
    const refreshToken =
      req.cookies?.refreshToken || req?.headers?.authorization?.split(" ")[1];

    res.clearCookie("accessToken", cookieOptions);
    res.clearCookie("refreshToken", cookieOptions);

    // Security audit: only revoke THIS device's session, not every
    // session on the account — logging out on one device shouldn't sign
    // you out everywhere else. Best-effort: if the refresh token is
    // missing/already invalid, decoding just fails silently here since the
    // cookies are cleared either way and the user is logged out from this
    // browser's point of view regardless.
    if (refreshToken && process.env.JWT_SECRET_REFRESH) {
      try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET_REFRESH);
        if (decoded?.jti) await revokeSession(userId, decoded.jti);
      } catch {
        // token already invalid/expired — nothing to revoke, that's fine
      }
    }

    return res.json({
      message: "Logged out successfully",
      error: false,
      success: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// LOGOUT — ALL DEVICES (session invalidation / revocation, explicit request)
export const logoutAllDevicesController = async (req, res) => {
  try {
    const userId = req.userId;
    await revokeAllSessions(userId);
    res.clearCookie("accessToken", cookieOptions);
    res.clearCookie("refreshToken", cookieOptions);
    return res.json({
      message: "Logged out of all devices",
      error: false,
      success: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// LIST ACTIVE SESSIONS (multi-device support, visible to the user)
export const listSessionsController = async (req, res) => {
  try {
    const userId = req.userId;
    const refreshToken =
      req.cookies?.refreshToken || req?.headers?.authorization?.split(" ")[1];
    let currentTokenId = null;
    if (refreshToken && process.env.JWT_SECRET_REFRESH) {
      try {
        currentTokenId = jwt.verify(refreshToken, process.env.JWT_SECRET_REFRESH)?.jti || null;
      } catch { /* not fatal — just won't be able to flag "this device" */ }
    }
    const sessions = await listSessions(userId, currentTokenId);
    return res.json({ error: false, success: true, data: sessions });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// REVOKE ONE SESSION (sign out one specific device remotely)
export const revokeSessionController = async (req, res) => {
  try {
    const userId = req.userId;
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required", error: true, success: false });
    }
    await revokeSession(userId, sessionId);
    return res.json({ message: "Device signed out", error: false, success: true });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// UPLOAD AVATAR
// Supports two call shapes:
//   1) multipart/form-data with a raw file in req.file (direct upload)
//   2) JSON body { avatar: "<url>" } — used when the client already uploaded
//      the image via /api/file/upload and just needs to attach the resulting
//      URL to the user record (avoids uploading the same file twice).
export const uploadAvatarController = async (req, res) => {
  try {
    const userId = req.userId;
    const file = req.file;
    const bodyAvatarUrl = typeof req.body?.avatar === "string" ? req.body.avatar.trim() : "";

    let avatarUrl = "";

    if (file) {
      const upload = await uploadImageCloudinary(file);
      avatarUrl = upload.secure_url;
    } else if (bodyAvatarUrl) {
      avatarUrl = bodyAvatarUrl;
    } else {
      return res.status(400).json({
        message: "No file uploaded",
        error: true,
        success: false,
      });
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      userId,
      { avatar: avatarUrl },
      { new: true }
    ).select("-password -sessions");

    return res.json({
      message: "Avatar uploaded successfully",
      success: true,
      error: false,
      data: { _id: userId, avatar: avatarUrl, user: updatedUser },
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// UPDATE USER DETAILS
export const updateUserDetailsController = async (req, res) => {
  try {
    const userId = req.userId;
    const { name, email, mobile, password } = req.body;

    const updateData = {};

    if (name) updateData.name = name;
    if (email) updateData.email = email.trim().toLowerCase();
    if (mobile) updateData.mobile = mobile;

    if (password) {
      const passwordIssue = await validateNewPassword(password);
      if (passwordIssue) {
        return res.status(400).json({ message: passwordIssue, error: true, success: false });
      }
      const salt = await bcryptjs.genSalt(BCRYPT_COST);
      updateData.password = await bcryptjs.hash(password, salt);
    }

    await UserModel.updateOne({ _id: userId }, updateData);

    // Security audit: same OWASP session-invalidation guidance as the
    // forgot-password reset flow — a password change should kill other
    // sessions. Here specifically it keeps THIS device logged in (the
    // request that just changed the password) and signs out everywhere
    // else, rather than logging the user out of their own request.
    if (password) {
      const refreshToken =
        req.cookies?.refreshToken || req?.headers?.authorization?.split(" ")[1];
      let currentTokenId = null;
      if (refreshToken && process.env.JWT_SECRET_REFRESH) {
        try { currentTokenId = jwt.verify(refreshToken, process.env.JWT_SECRET_REFRESH)?.jti || null; }
        catch { /* fine — falls through to revoking everything if we can't identify "this" session */ }
      }
      await revokeOtherSessions(userId, currentTokenId);
    }

    const updatedUser = await UserModel.findById(userId)
      .select("-password -sessions -forgot_password_otp -forgot_password_expiry")
      .populate("address_details");

    return res.json({
      message: "User details updated successfully",
      error: false,
      success: true,
      data: updatedUser,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// FORGOT PASSWORD - send OTP
export const forgotPasswordController = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
        error: true,
        success: false,
      });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email address.", error: true, success: false });
    }

    const user = await UserModel.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "Email not registered",
        error: true,
        success: false,
      });
    }

    const otp = generateOtp();
    const expireTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await UserModel.findByIdAndUpdate(user._id, {
      forgot_password_otp: otp,
      forgot_password_expiry: expireTime,
    });

    await sendEmail({
      sendTo: email,
      subject: "Password Reset OTP - Shah Premium Foods",
      html: forgotPasswordTemplate({ name: user.name, otp }),
    }).then((r) => {
      if (!r?.success) console.warn(`Password reset email to ${email} did not send:`, r?.error);
    });

    return res.json({
      message: "OTP sent to your email",
      error: false,
      success: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// VERIFY FORGOT PASSWORD OTP
export const verifyForgotPasswordOtpController = async (req, res) => {
  try {
    const { otp } = req.body;
    const email = req.body.email?.trim().toLowerCase();

    const user = await UserModel.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "Email not registered",
        error: true,
        success: false,
      });
    }

    const currentTime = new Date();

    if (!user.forgot_password_expiry || user.forgot_password_expiry < currentTime) {
      return res.status(400).json({
        message: "OTP has expired. Please request a new one.",
        error: true,
        success: false,
      });
    }

    if (otp !== user.forgot_password_otp) {
      return res.status(400).json({
        message: "Invalid OTP",
        error: true,
        success: false,
      });
    }

    await UserModel.findByIdAndUpdate(user._id, {
      forgot_password_otp: "",
      forgot_password_expiry: null,
    });

    return res.json({
      message: "OTP verified successfully",
      error: false,
      success: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// RESET PASSWORD
export const resetPasswordController = async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    const email = req.body.email?.trim().toLowerCase();

    if (!email || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: "All fields are required",
        error: true,
        success: false,
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "Passwords do not match",
        error: true,
        success: false,
      });
    }

    const user = await UserModel.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "Email not registered",
        error: true,
        success: false,
      });
    }

    const passwordIssue = await validateNewPassword(newPassword);
    if (passwordIssue) {
      return res.status(400).json({ message: passwordIssue, error: true, success: false });
    }

    const salt = await bcryptjs.genSalt(BCRYPT_COST);
    const hashedPassword = await bcryptjs.hash(newPassword, salt);

    await UserModel.findByIdAndUpdate(user._id, {
      password: hashedPassword,
    });

    // Security audit: a password reset means either the legitimate owner
    // is regaining control, or (less happily) is exactly the moment an
    // attacker who guessed/reset the password would want every OTHER
    // session to stay alive. Either way, the correct behavior is the
    // same: invalidate every existing session so a stale/possibly-
    // compromised login elsewhere doesn't silently persist through a
    // password change.
    await revokeAllSessions(user._id);

    return res.json({
      message: "Password reset successfully",
      error: false,
      success: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// REFRESH TOKEN
export const refreshTokenController = async (req, res) => {
  try {
    const refreshToken =
      req.cookies?.refreshToken || req?.headers?.authorization?.split(" ")[1];

    if (!refreshToken) {
      return res.status(401).json({
        message: "Refresh token not found. Please log in again.",
        error: true,
        success: false,
      });
    }

    if (!process.env.JWT_SECRET_REFRESH) {
      console.error("JWT_SECRET_REFRESH is not set in environment variables.");
      return res.status(500).json({
        message: "Server misconfiguration: JWT_SECRET_REFRESH is not set. Add it to your environment variables and restart the server.",
        error: true,
        success: false,
      });
    }

    // Security audit: a JWT that fails verification (expired, bad
    // signature, tampered) should be a 401 Unauthorized — the caller needs
    // to log in again — not a 500, which previously happened here because
    // jwt.verify()'s throw fell through to the generic catch block below.
    // A 500 also pollutes error monitoring with what's actually a routine,
    // expected event (access tokens expire every 15 minutes by design).
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET_REFRESH);
    } catch {
      res.clearCookie("accessToken", cookieOptions);
      res.clearCookie("refreshToken", cookieOptions);
      return res.status(401).json({
        message: "Your session has expired. Please log in again.",
        error: true,
        success: false,
      });
    }

    // Security audit: refresh token ROTATION with reuse detection (see
    // sessionManager.js's own top-of-file comment for the full mechanics
    // and why the reused-token case revokes every session on the account
    // rather than just this one). Every successful refresh now issues a
    // BRAND NEW refresh token — the one just presented becomes permanently
    // invalid the instant it's used, whether or not it's still within its
    // 7-day expiry.
    const expireStr = process.env.REFRESH_TOKEN_EXPIRE || "7d";
    const match = /^(\d+)([smhd])$/.exec(expireStr);
    const unitMs = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
    const expiresAt = new Date(Date.now() + (match ? Number(match[1]) * unitMs[match[2]] : 7 * 24 * 60 * 60 * 1000));

    const { reused, newTokenId } = await rotateSession(decoded.id, decoded.jti, req, expiresAt);
    if (reused) {
      res.clearCookie("accessToken", cookieOptions);
      res.clearCookie("refreshToken", cookieOptions);
      return res.status(401).json({
        message: "This session is no longer valid — for your security, all devices have been signed out. Please log in again.",
        error: true,
        success: false,
      });
    }

    const newAccessToken = generateAccessToken(decoded.id);
    const newRefreshToken = jwt.sign({ id: decoded.id, jti: newTokenId }, process.env.JWT_SECRET_REFRESH, { expiresIn: expireStr });

    res.cookie("accessToken", newAccessToken, cookieOptions);
    res.cookie("refreshToken", newRefreshToken, cookieOptions);

    return res.json({
      message: "Access token refreshed",
      error: false,
      success: true,
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// GET LOGGED IN USER DETAILS
export const getUserDetailsController = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await UserModel.findById(userId)
      .select("-password -sessions")
      .populate("address_details");

    return res.json({
      message: "User details fetched successfully",
      error: false,
      success: true,
      data: user,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// ADMIN: GET ALL USERS
export const getAllUsersController = async (req, res) => {
  try {
    const users = await UserModel.find()
      .select("-password -sessions")
      .sort({ createdAt: -1 });

    return res.json({
      message: "Users fetched successfully",
      error: false,
      success: true,
      data: users,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// ADMIN: UPDATE USER ROLE / STATUS
export const updateUserRoleController = async (req, res) => {
  try {
    const { userId, role, status } = req.body;

    const updateData = {};
    if (role) updateData.role = role;
    if (status) updateData.status = status;

    await UserModel.findByIdAndUpdate(userId, updateData);

    return res.json({
      message: "User updated successfully",
      error: false,
      success: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};
