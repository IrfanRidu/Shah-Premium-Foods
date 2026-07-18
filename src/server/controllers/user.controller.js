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

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
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

    const existingUser = await UserModel.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        message: "Email already registered",
        error: true,
        success: false,
      });
    }

    const salt = await bcryptjs.genSalt(10);
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

    const user = await UserModel.findOne({ email });

    if (!user) {
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
      return res.status(400).json({
        message: "Incorrect password",
        error: true,
        success: false,
      });
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = await generateRefreshToken(user._id);

    await UserModel.updateOne(
      { _id: user._id },
      { last_login_date: new Date() }
    );

    res.cookie("accessToken", accessToken, cookieOptions);
    res.cookie("refreshToken", refreshToken, cookieOptions);

    const userData = await UserModel.findById(user._id)
      .select("-password -refresh_token -forgot_password_otp -forgot_password_expiry")
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

// LOGOUT
export const logoutUserController = async (req, res) => {
  try {
    const userId = req.userId;

    res.clearCookie("accessToken", cookieOptions);
    res.clearCookie("refreshToken", cookieOptions);

    await UserModel.findByIdAndUpdate(userId, { refresh_token: "" });

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
    ).select("-password -refresh_token");

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
      const salt = await bcryptjs.genSalt(10);
      updateData.password = await bcryptjs.hash(password, salt);
    }

    await UserModel.updateOne({ _id: userId }, updateData);

    const updatedUser = await UserModel.findById(userId)
      .select("-password -refresh_token -forgot_password_otp -forgot_password_expiry")
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

    const salt = await bcryptjs.genSalt(10);
    const hashedPassword = await bcryptjs.hash(newPassword, salt);

    await UserModel.findByIdAndUpdate(user._id, {
      password: hashedPassword,
    });

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

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET_REFRESH);

    if (!decoded) {
      return res.status(401).json({
        message: "Invalid or expired refresh token",
        error: true,
        success: false,
      });
    }

    const newAccessToken = generateAccessToken(decoded.id);

    res.cookie("accessToken", newAccessToken, cookieOptions);

    return res.json({
      message: "Access token refreshed",
      error: false,
      success: true,
      data: { accessToken: newAccessToken },
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
      .select("-password -refresh_token")
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
      .select("-password -refresh_token")
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
