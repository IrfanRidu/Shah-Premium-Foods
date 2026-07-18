import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ["percentage", "fixed"], required: true },
    value: { type: Number, required: true, min: 0 },
    minOrderAmount: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: 0 }, // 0 = no cap
    usageLimit: { type: Number, default: 0 },  // 0 = unlimited uses OVERALL (across every user combined)
    perUserLimit: { type: Number, default: 1 }, // 0 = unlimited uses per individual user; default 1 matches the app's previous hardcoded "once per user" behavior
    usedCount: { type: Number, default: 0 },
    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    applicableCategories: [{ type: mongoose.Schema.ObjectId, ref: "category" }],
    applicableProducts: [{ type: mongoose.Schema.ObjectId, ref: "product" }], // empty array = applies to every product
    description: { type: String, default: "" },
    usedBy: [
      {
        userId: { type: mongoose.Schema.ObjectId, ref: "user" },
        usedAt: { type: Date, default: Date.now },
        orderId: { type: String },
      },
    ],
  },
  { timestamps: true }
);

const CouponModel = mongoose.models.coupon || mongoose.model("coupon", couponSchema);
export default CouponModel;
