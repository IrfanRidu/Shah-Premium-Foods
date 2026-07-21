import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    avatar: {
      type: String,
      default: "",
    },
    mobile: {
      type: String,
      default: null,
    },
    // Security audit: replaced the old single `refresh_token: String` field
    // with a real multi-device session list. The old design stored exactly
    // one refresh token per user — logging in on a second device silently
    // overwrote it, which meant "multi-device support" was actually the
    // opposite: signing in anywhere logged you out everywhere else. Each
    // entry here is one device/browser session: `tokenId` is the random
    // `jti` embedded in that session's current refresh-token JWT (never
    // the raw token itself — nothing here lets you forge a valid token,
    // only recognize/revoke one that already validated by signature+expiry
    // first). See generateRefreshToken.js / sessionManager.js for how
    // rotation, reuse detection, and revocation use this.
    sessions: {
      type: [
        {
          tokenId:    { type: String, required: true },
          userAgent:  { type: String, default: "" },
          ip:         { type: String, default: "" },
          createdAt:  { type: Date, default: Date.now },
          lastUsedAt: { type: Date, default: Date.now },
          expiresAt:  { type: Date, required: true },
        },
      ],
      default: [],
    },
    verify_email: {
      type: Boolean,
      default: false,
    },
    email_verify_otp: {
      type: String,
      default: null,
    },
    email_verify_otp_expiry: {
      type: Date,
      default: null,
    },
    last_login_date: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["Active", "Inactive", "Suspended"],
      default: "Active",
    },
    address_details: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "address",
      },
    ],
    shopping_cart: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "cartProduct",
      },
    ],
    orderHistory: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "order",
      },
    ],
    forgot_password_otp: {
      type: String,
      default: null,
    },
    forgot_password_expiry: {
      type: Date,
      default: null,
    },
    role: {
      type: String,
      default: "USER",
      uppercase: true,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: "user",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const UserModel = mongoose.models.user || mongoose.model("user", userSchema);

export default UserModel;
