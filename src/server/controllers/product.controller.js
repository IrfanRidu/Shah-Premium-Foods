import mongoose from "mongoose";
import ProductModel from "../models/product.model.js";
import InventoryLogModel from "../models/inventoryLog.model.js";
import CategoryModel from "../models/category.model.js";
import SubCategoryModel from "../models/subcategory.model.js";
import OrderModel from "../models/order.model.js";

// Mobile UI pass (Section 11 — "mobile-friendly sorting"): this didn't
// exist before — every public product-list query hardcoded
// .sort({ createdAt: -1 }) with no way to change it. Whitelist-mapped
// rather than accepting a raw client-supplied sort object directly (that
// would let a request specify an arbitrary/expensive sort on an
// unindexed field, a real minor DoS vector on a public, unauthenticated
// endpoint) — only these five known values are accepted, and anything
// else (including undefined/omitted, which is every existing caller,
// including the admin panel) falls back to the exact previous behavior,
// so this is purely additive and can't change any existing response.
export const SORT_OPTIONS = {
  newest:     { createdAt: -1 },
  price_asc:  { price: 1 },
  price_desc: { price: -1 },
  name_asc:   { name: 1 },
  name_desc:  { name: -1 },
};
export const buildSortOption = (sortBy) => SORT_OPTIONS[sortBy] || SORT_OPTIONS.newest;

// Auto-generate a unique SKU like SPF-00001
const generateSKU = async () => {
  const count = await ProductModel.countDocuments();
  const pad = String(count + 1).padStart(5, "0");
  const candidate = `SPF-${pad}`;
  const existing = await ProductModel.findOne({ sku: candidate });
  if (existing) {
    // Collision: use timestamp suffix
    return `SPF-${Date.now().toString(36).toUpperCase()}`;
  }
  return candidate;
};

// ADD PRODUCT (admin)
export const addProductController = async (req, res) => {
  try {
    const {
      name, image, category, subCategory, unit,
      stock, lowStockThreshold, price, costPrice, discount,
      shortDescription, description, more_details, publish, translations,
      alternativeSpellings,
    } = req.body;

    let { sku } = req.body;

    if (!name || !image || !price) {
      return res.status(400).json({ message: "Name, image and price are required", error: true, success: false });
    }

    // Auto-generate SKU if blank
    if (!sku || !sku.trim()) {
      sku = await generateSKU();
    }

    const product = new ProductModel({
      name, image, category, subCategory, unit, sku: sku.trim(),
      stock: stock || 0,
      lowStockThreshold: lowStockThreshold || 10,
      price, costPrice: costPrice || 0, discount,
      shortDescription, description, more_details, publish, translations,
      alternativeSpellings: Array.isArray(alternativeSpellings) ? alternativeSpellings : [],
    });

    const saved = await product.save();

    if (saved.stock > 0) {
      await new InventoryLogModel({
        productId: saved._id, type: "initial", quantity: saved.stock,
        previousStock: 0, newStock: saved.stock, note: "Initial stock on product creation",
        createdBy: req.userId,
      }).save();
    }

    return res.status(201).json({ message: "Product added successfully", error: false, success: true, data: saved });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// GET PRODUCTS (public, paginated)
export const getProductsController = async (req, res) => {
  try {
    let { page, limit, search, sortBy } = req.body;
    page = page || 1;
    limit = limit || 10;
    const sortOption = buildSortOption(sortBy);

    const term = (search || "").trim();
    const query = term
      ? { publish: true, $or: [
          { name: { $regex: escapeRegex(term), $options: "i" } },
          { alternativeSpellings: { $elemMatch: { $regex: escapeRegex(term), $options: "i" } } },
          { sku: { $regex: escapeRegex(term), $options: "i" } },
        ] }
      : { publish: true };
    const skip = (page - 1) * limit;

    // Database security/performance audit (Section 7 — lean queries):
    // `.lean()` skips Mongoose document hydration (change tracking,
    // virtuals, instance methods) for queries whose results are only ever
    // read and serialized straight into a JSON response, never mutated —
    // exactly this case. Applied to this and the other public, read-only,
    // high-traffic product-browsing queries below; not a full audit of
    // every read query in the app (23 controllers is a lot of ground),
    // but the highest-traffic ones are covered.
    const [data, totalCount] = await Promise.all([
      ProductModel.find(query).sort(sortOption).skip(skip).limit(limit).populate("category").populate("subCategory").lean(),
      ProductModel.countDocuments(query),
    ]);

    return res.json({ message: "Products fetched successfully", error: false, success: true,
      data: { data, totalCount, totalPage: Math.ceil(totalCount / limit), page, limit } });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// GET PRODUCTS BY CATEGORY
export const getProductsByCategoryController = async (req, res) => {
  try {
    let { id, page, limit, sortBy } = req.body;
    if (!id) return res.status(400).json({ message: "Category id is required", error: true, success: false });
    page = page || 1; limit = limit || 15;
    const skip = (page - 1) * limit;
    const query = { category: { $in: [id] }, publish: true };
    const [data, totalCount] = await Promise.all([
      ProductModel.find(query).sort(buildSortOption(sortBy)).skip(skip).limit(limit).lean(),
      ProductModel.countDocuments(query),
    ]);
    return res.json({ message: "Products fetched successfully", error: false, success: true,
      data: { data, totalCount, totalPage: Math.ceil(totalCount / limit), page, limit } });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// GET PRODUCTS BY CATEGORY AND SUBCATEGORY
export const getProductsByCategoryAndSubCategoryController = async (req, res) => {
  try {
    let { categoryId, subCategoryId, page, limit, sortBy } = req.body;
    if (!categoryId || !subCategoryId)
      return res.status(400).json({ message: "Category and sub category id are required", error: true, success: false });
    page = page || 1; limit = limit || 10;
    const skip = (page - 1) * limit;
    const query = { category: { $in: [categoryId] }, subCategory: { $in: [subCategoryId] } };
    const [data, dataCount] = await Promise.all([
      ProductModel.find(query).sort(buildSortOption(sortBy)).skip(skip).limit(limit).lean(),
      ProductModel.countDocuments(query),
    ]);
    return res.json({ message: "Products fetched successfully", error: false, success: true,
      data: { data, page, limit, totalCount: dataCount, totalPage: Math.ceil(dataCount / limit) } });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// GET SINGLE PRODUCT DETAILS
export const getProductDetailsController = async (req, res) => {
  try {
    const { productId } = req.body;
    const product = await ProductModel.findById(productId).populate("category").populate("subCategory").lean();
    if (!product) return res.status(404).json({ message: "Product not found", error: true, success: false });
    return res.json({ message: "Product details fetched successfully", error: false, success: true, data: product });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// UPDATE PRODUCT (admin)
export const updateProductController = async (req, res) => {
  try {
    const { _id, ...rest } = req.body;
    if (!_id) return res.status(400).json({ message: "Product id is required", error: true, success: false });
    const existing = await ProductModel.findById(_id);
    if (!existing) return res.status(404).json({ message: "Product not found", error: true, success: false });

    // Auto-generate SKU if being blanked out
    if (rest.sku !== undefined && !rest.sku?.trim()) {
      rest.sku = await generateSKU();
    }

    if (rest.alternativeSpellings !== undefined && !Array.isArray(rest.alternativeSpellings)) {
      rest.alternativeSpellings = [];
    }

    const updated = await ProductModel.findByIdAndUpdate(_id, rest, { new: true });

    if (rest.stock !== undefined && Number(rest.stock) !== existing.stock) {
      await new InventoryLogModel({
        productId: _id, type: "adjustment", quantity: Number(rest.stock),
        previousStock: existing.stock, newStock: Number(rest.stock),
        note: "Manual stock edit via product form", createdBy: req.userId,
      }).save();
    }

    return res.json({ message: "Product updated successfully", error: false, success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// DELETE PRODUCT (admin)
export const deleteProductController = async (req, res) => {
  try {
    const { _id } = req.body;
    if (!_id) return res.status(400).json({ message: "Product id is required", error: true, success: false });
    await ProductModel.findByIdAndDelete(_id);
    return res.json({ message: "Product deleted successfully", error: false, success: true });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// Escape regex special characters so raw user input can never throw or be
// mis-interpreted as a pattern (Fix 45).
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// SEARCH PRODUCTS — matches name + alternativeSpellings, letter-by-letter.
//
// Fix 45 root cause: the previous query combined `$text` *inside* an `$or`
// clause. MongoDB does not reliably support `$text` nested inside `$or`
// alongside other conditions (in many server versions/configurations it
// throws "text expression not allowed"), so the query threw on every
// request — the frontend's try/catch silently swallowed it and just
// rendered "no results" no matter what was typed. On top of that, `$text`
// only ever matches whole/stemmed words, never partial prefixes, so even a
// working `$text` query could never satisfy "start suggesting after a
// single letter." Both problems are solved by dropping `$text` entirely and
// using escaped, case-insensitive regex — prefix matches are ranked first,
// then any-position substring matches, across both `name` and
// `alternativeSpellings`.
export const searchProductController = async (req, res) => {
  try {
    let { search, page, limit } = req.body;
    page = page || 1; limit = limit || 10;
    const skip = (page - 1) * limit;
    const term = (search || "").trim();

    let query = {};
    if (term) {
      const safe = escapeRegex(term);
      query = {
        $or: [
          { name: { $regex: safe, $options: "i" } },
          { alternativeSpellings: { $elemMatch: { $regex: safe, $options: "i" } } },
          { sku: { $regex: safe, $options: "i" } },
        ],
      };
    }

    let data = await ProductModel.find(query).sort({ createdAt: -1 }).limit(term ? 200 : limit).lean();

    if (term) {
      // Rank prefix matches (name starts with the term) above mid-string
      // matches, so typing "app" surfaces "Apple" before "Pineapple".
      const prefixRe = new RegExp("^" + escapeRegex(term), "i");
      data = data
        .map((p) => ({ p, rank: prefixRe.test(p.name) ? 0 : 1 }))
        .sort((a, b) => a.rank - b.rank)
        .map((x) => x.p);
      const dataCount = data.length;
      data = data.slice(skip, skip + limit);
      return res.json({ message: "Products fetched successfully", error: false, success: true,
        data, page, limit, totalCount: dataCount, totalPage: Math.ceil(dataCount / limit) });
    }

    const dataCount = await ProductModel.countDocuments(query);
    return res.json({ message: "Products fetched successfully", error: false, success: true,
      data, page, limit, totalCount: dataCount, totalPage: Math.ceil(dataCount / limit) });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// Session 4 (Luxury PDP redesign) — "Frequently Bought Together". Real
// co-purchase aggregation, not a relabeled "related products" query:
// looks at every OTHER order that also contains this product, ranks the
// other productIds in those same orders by how often they co-occur,
// and returns the top matches — excluding out-of-stock/unpublished
// items so the panel never suggests something that can't actually be
// added to cart. Computed on demand (not denormalized like rating/
// numReviews) since this is a single PDP-load cost, not a per-card, per
// -grid-item cost the way rating is.
export const getFrequentlyBoughtTogetherController = async (req, res) => {
  try {
    const { productId, limit = 4 } = req.query;
    if (!productId) {
      return res.status(400).json({ message: "Product id is required", error: true, success: false });
    }
    const limitNum = Math.min(8, Math.max(1, parseInt(limit) || 4));
    const objectId = new mongoose.Types.ObjectId(productId);

    const coOccurrence = await OrderModel.aggregate([
      { $match: { "productDetails.productId": objectId } },
      { $unwind: "$productDetails" },
      { $match: { "productDetails.productId": { $ne: objectId } } },
      { $group: { _id: "$productDetails.productId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      // Over-fetch candidates since some will be filtered out below
      // (unpublished / out of stock) — keeps the final list at the
      // requested size whenever enough real alternatives exist.
      { $limit: limitNum * 3 },
    ]);

    const candidateIds = coOccurrence.map((row) => row._id);
    const products = candidateIds.length
      ? await ProductModel.find({ _id: { $in: candidateIds }, publish: true, stock: { $gt: 0 } }).lean()
      : [];

    // Preserve the co-occurrence ranking (Mongo's $in doesn't guarantee
    // result order matches the id array order).
    const byId = new Map(products.map((p) => [p._id.toString(), p]));
    const ordered = candidateIds
      .map((id) => byId.get(id.toString()))
      .filter(Boolean)
      .slice(0, limitNum);

    return res.json({
      message: "Frequently bought together fetched",
      error: false,
      success: true,
      data: ordered,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};
