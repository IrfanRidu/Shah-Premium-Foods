import InventoryLogModel from "../models/inventoryLog.model.js";
import ProductModel from "../models/product.model.js";

// GET inventory for all products (admin)
export const getInventoryController = async (req, res) => {
  try {
    const { page = 1, limit = 30, search = "", lowStock } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = { publish: true };
    if (search) query.$text = { $search: search };
    if (lowStock === "true") query.$expr = { $lte: ["$stock", 10] };

    const [products, total] = await Promise.all([
      ProductModel.find(query).sort({ stock: 1 }).skip(skip).limit(parseInt(limit)).select("name image price stock unit category").populate("category", "name"),
      ProductModel.countDocuments(query),
    ]);
    return res.json({ success: true, error: false, data: { products, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ADJUST stock (admin)
export const adjustStockController = async (req, res) => {
  try {
    const { productId, type, quantity, note } = req.body;
    const userId = req.userId;
    const product = await ProductModel.findById(productId);
    if (!product) return res.status(404).json({ success: false, error: true, message: "Product not found" });

    const previousStock = product.stock;
    let newStock = previousStock;
    if (type === "restock" || type === "return") newStock += parseInt(quantity);
    else if (type === "adjustment") newStock = parseInt(quantity);
    else if (type === "damage") newStock -= parseInt(quantity);
    else return res.status(400).json({ success: false, error: true, message: "Invalid adjustment type" });

    newStock = Math.max(0, newStock);
    await ProductModel.findByIdAndUpdate(productId, { stock: newStock });
    const log = new InventoryLogModel({ productId, type, quantity: parseInt(quantity), previousStock, newStock, note: note || "", createdBy: userId });
    await log.save();

    return res.json({ success: true, error: false, data: { previousStock, newStock, log }, message: "Stock adjusted" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// GET inventory logs for a product (admin)
export const getInventoryLogsController = async (req, res) => {
  try {
    const { productId, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = productId ? { productId } : {};
    const [logs, total] = await Promise.all([
      InventoryLogModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
        .populate("productId", "name image unit").populate("createdBy", "name email"),
      InventoryLogModel.countDocuments(query),
    ]);
    return res.json({ success: true, error: false, data: { logs, total } });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// GET low stock products (admin)
export const getLowStockController = async (req, res) => {
  try {
    const { threshold = 10 } = req.query;
    const products = await ProductModel.find({ stock: { $lte: parseInt(threshold) }, publish: true })
      .sort({ stock: 1 }).select("name image price stock unit").limit(50);
    return res.json({ success: true, error: false, data: products });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ── Fix 36: Damaged / Dead Stock tracking ──────────────────────
// MARK a quantity of a product as damaged/unsold (removes it from sellable stock,
// logs it distinctly so it can be reported as "Dead Stock Value" in analytics).
export const markDamagedController = async (req, res) => {
  try {
    const { productId, quantity, note } = req.body;
    const userId = req.userId;
    const qty = parseInt(quantity);
    if (!productId || !qty || qty <= 0) {
      return res.status(400).json({ success: false, error: true, message: "Product and a positive quantity are required" });
    }
    const product = await ProductModel.findById(productId);
    if (!product) return res.status(404).json({ success: false, error: true, message: "Product not found" });

    const previousStock = product.stock;
    const newStock = Math.max(0, previousStock - qty);
    await ProductModel.findByIdAndUpdate(productId, { stock: newStock });

    const log = new InventoryLogModel({
      productId, type: "damage", quantity: qty, previousStock, newStock,
      note: note || "Marked as damaged/unsold inventory", createdBy: userId,
    });
    await log.save();

    return res.json({ success: true, error: false, data: { previousStock, newStock, log }, message: "Marked as damaged inventory" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// LIST all damaged-inventory log entries with computed dead-stock value
export const getDamagedInventoryController = async (req, res) => {
  try {
    const { from, to } = req.query;
    const query = { type: "damage" };
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) { const e = new Date(to); e.setHours(23,59,59,999); query.createdAt.$lte = e; }
    }
    const logs = await InventoryLogModel.find(query).sort({ createdAt: -1 })
      .populate("productId", "name image price costPrice unit").populate("createdBy", "name");

    let deadStockValue = 0;
    const rows = logs.map((l) => {
      const costBasis = l.productId?.costPrice > 0 ? l.productId.costPrice : (l.productId?.price || 0) * 0.6;
      const value = costBasis * l.quantity;
      deadStockValue += value;
      return { ...l.toObject(), value: Math.round(value * 100) / 100 };
    });

    return res.json({ success: true, error: false, data: { logs: rows, deadStockValue: Math.round(deadStockValue * 100) / 100 } });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
