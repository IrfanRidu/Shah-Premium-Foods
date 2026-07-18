import mongoose from "mongoose";
import ProductModel from "../models/product.model.js";
import OrderModel from "../models/order.model.js";
import InventoryLogModel from "../models/inventoryLog.model.js";

// A single "scan anything" endpoint: a USB/camera barcode scanner just types
// the code + Enter into whatever input is focused. Whether that code is a
// product's SKU (printed on a shelf label) or an order ID (printed on a
// packed box label), this resolves it and tells the frontend which it found.
export const lookupBarcodeController = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, error: true, message: "No code provided" });
    }
    const trimmed = code.trim();

    // 1. Try as a product SKU (case-insensitive exact match)
    let product = await ProductModel.findOne({ sku: { $regex: `^${trimmed}$`, $options: "i" } })
      .populate("category", "name");

    // 2. Fall back to product Mongo _id (for products without a manually-set SKU)
    if (!product && mongoose.Types.ObjectId.isValid(trimmed)) {
      product = await ProductModel.findById(trimmed).populate("category", "name");
    }

    if (product) {
      return res.json({ success: true, error: false, data: { type: "product", product } });
    }

    // 3. Try as an order ID (printed on a packed box label)
    const order = await OrderModel.findOne({ orderId: trimmed })
      .populate("delivery_address").populate("userId", "name email mobile");

    if (order) {
      return res.json({ success: true, error: false, data: { type: "order", order } });
    }

    return res.status(404).json({ success: false, error: true, message: `No product or order matches "${trimmed}"` });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Quick in-store sale by scan — decrements stock and logs it, without going
// through the full cart/checkout flow. Useful for a counter-sale register.
export const quickSaleController = async (req, res) => {
  try {
    const { code, quantity } = req.body;
    const qty = Math.max(1, parseInt(quantity) || 1);

    let product = await ProductModel.findOne({ sku: { $regex: `^${code?.trim()}$`, $options: "i" } });
    if (!product && mongoose.Types.ObjectId.isValid(code?.trim())) {
      product = await ProductModel.findById(code.trim());
    }
    if (!product) return res.status(404).json({ success: false, error: true, message: "Product not found" });
    if (product.stock < qty) return res.status(400).json({ success: false, error: true, message: `Only ${product.stock} in stock` });

    const previousStock = product.stock;
    const newStock = previousStock - qty;
    await ProductModel.findByIdAndUpdate(product._id, { stock: newStock });
    await new InventoryLogModel({
      productId: product._id, type: "sale", quantity: qty, previousStock, newStock,
      note: "POS quick sale via barcode scan", createdBy: req.userId,
    }).save();

    return res.json({ success: true, error: false, data: { ...product.toObject(), stock: newStock }, message: `Sold ${qty} × ${product.name}` });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
