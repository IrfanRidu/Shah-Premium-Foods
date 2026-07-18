import CouponModel from "../models/coupon.model.js";
import ProductModel from "../models/product.model.js";
import { evaluateCoupon } from "../utils/couponEligibility.js";

// VALIDATE coupon (user) — live "Apply" button on the Cart page.
// Accepts the cart's line items (not just a raw total) so product-scoped
// coupons (item 1: admin can restrict a coupon to specific products) can be
// checked and discounted correctly; falls back to `orderAmount` as a single
// unscoped item if `items` isn't sent (keeps older callers working).
export const validateCouponController = async (req, res) => {
  try {
    const { code, orderAmount, userId, items } = req.body;
    if (!code) return res.status(400).json({ success: false, error: true, message: "Coupon code required" });

    const coupon = await CouponModel.findOne({ code: code.toUpperCase().trim(), isActive: true });
    if (!coupon) return res.status(404).json({ success: false, error: true, message: "Invalid or expired coupon code" });

    const cartItems = Array.isArray(items) && items.length > 0
      ? items
      : [{ productId: null, price: Number(orderAmount) || 0, quantity: 1 }];

    let discount;
    try {
      ({ discount } = evaluateCoupon(coupon, cartItems, userId));
    } catch (evalErr) {
      return res.status(400).json({ success: false, error: true, message: evalErr.message });
    }

    return res.json({
      success: true, error: false,
      data: {
        coupon: {
          _id: coupon._id, code: coupon.code, type: coupon.type, value: coupon.value,
          description: coupon.description, applicableProducts: coupon.applicableProducts,
        },
        discount: Math.round(discount * 100) / 100,
        finalAmount: Math.round((Number(orderAmount || 0) - discount) * 100) / 100,
      },
      message: "Coupon applied successfully",
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// GET all coupons (admin)
export const getAllCouponsController = async (req, res) => {
  try {
    const coupons = await CouponModel.find().sort({ createdAt: -1 })
      .select("-usedBy")
      .populate("applicableProducts", "name image price");
    return res.json({ success: true, error: false, data: coupons });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// GET public active coupons
export const getActiveCouponsController = async (req, res) => {
  try {
    const now = new Date();
    const coupons = await CouponModel.find({ isActive: true, validFrom: { $lte: now }, validTo: { $gte: now } })
      .select("code type value minOrderAmount maxDiscount description validTo applicableProducts")
      .populate("applicableProducts", "name")
      .sort({ createdAt: -1 });
    return res.json({ success: true, error: false, data: coupons });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// CREATE coupon (admin)
export const createCouponController = async (req, res) => {
  try {
    const { code, type, value, minOrderAmount, maxDiscount, usageLimit, perUserLimit, validFrom, validTo, isActive, applicableCategories, applicableProducts, description } = req.body;
    if (!code || !type || !value || !validFrom || !validTo)
      return res.status(400).json({ success: false, error: true, message: "code, type, value, validFrom, validTo are required" });

    const existing = await CouponModel.findOne({ code: code.toUpperCase().trim() });
    if (existing) return res.status(400).json({ success: false, error: true, message: "Coupon code already exists" });

    const coupon = new CouponModel({
      code: code.toUpperCase().trim(), type, value,
      minOrderAmount: minOrderAmount || 0, maxDiscount: maxDiscount || 0,
      usageLimit: usageLimit || 0,
      perUserLimit: perUserLimit === undefined || perUserLimit === null ? 1 : perUserLimit,
      validFrom, validTo, isActive: isActive !== false,
      applicableCategories: applicableCategories || [],
      applicableProducts: applicableProducts || [],
      description: description || "",
    });
    await coupon.save();
    return res.status(201).json({ success: true, error: false, data: coupon, message: "Coupon created" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// UPDATE coupon (admin)
export const updateCouponController = async (req, res) => {
  try {
    const { _id, ...updates } = req.body;
    if (updates.code) updates.code = updates.code.toUpperCase().trim();
    const coupon = await CouponModel.findByIdAndUpdate(_id, updates, { new: true }).select("-usedBy");
    if (!coupon) return res.status(404).json({ success: false, error: true, message: "Coupon not found" });
    return res.json({ success: true, error: false, data: coupon, message: "Updated" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// DELETE coupon (admin)
export const deleteCouponController = async (req, res) => {
  try {
    const { _id } = req.body;
    await CouponModel.findByIdAndDelete(_id);
    return res.json({ success: true, error: false, message: "Coupon deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// MARK coupon as used (internal, called after order)
export const markCouponUsedController = async (req, res) => {
  try {
    const { code, userId, orderId } = req.body;
    await CouponModel.findOneAndUpdate(
      { code: code.toUpperCase() },
      { $inc: { usedCount: 1 }, $push: { usedBy: { userId, orderId, usedAt: new Date() } } }
    );
    return res.json({ success: true, error: false, message: "Coupon marked as used" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
