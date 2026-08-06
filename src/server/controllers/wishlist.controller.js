import WishlistModel from "../models/wishlist.model.js";
import ProductModel from "../models/product.model.js";

// GET WISHLIST (populated with the actual product docs)
export const getWishlistController = async (req, res) => {
  try {
    const userId = req.userId;
    const items = await WishlistModel.find({ userId }).sort({ createdAt: -1 }).populate("productId");
    // If a wishlisted product was later deleted from the catalog,
    // populate() leaves productId as null rather than throwing — filter
    // those out so the wishlist page never has to render a broken card.
    const valid = items.filter((i) => i.productId);
    return res.json({
      message: "Wishlist fetched successfully",
      error: false,
      success: true,
      data: valid,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// ADD TO WISHLIST
export const addToWishlistController = async (req, res) => {
  try {
    const userId = req.userId;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ message: "Product id is required", error: true, success: false });
    }
    const product = await ProductModel.findById(productId).select("_id");
    if (!product) {
      return res.status(404).json({ message: "Product not found", error: true, success: false });
    }

    // Upsert-style: wishlisting something already there is a harmless
    // no-op, not an error — matches how "add to cart" treats a repeat.
    const entry = await WishlistModel.findOneAndUpdate(
      { userId, productId },
      { userId, productId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({
      message: "Added to wishlist",
      error: false,
      success: true,
      data: entry,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// REMOVE FROM WISHLIST
export const removeFromWishlistController = async (req, res) => {
  try {
    const userId = req.userId;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ message: "Product id is required", error: true, success: false });
    }

    await WishlistModel.deleteOne({ userId, productId });

    return res.json({
      message: "Removed from wishlist",
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

// TOGGLE (used by the heart-icon button on product cards / the PDP —
// a single click always does the opposite of the product's current
// state, without the frontend needing to already know that state)
export const toggleWishlistController = async (req, res) => {
  try {
    const userId = req.userId;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ message: "Product id is required", error: true, success: false });
    }

    const existing = await WishlistModel.findOne({ userId, productId });
    if (existing) {
      await WishlistModel.deleteOne({ _id: existing._id });
      return res.json({ message: "Removed from wishlist", error: false, success: true, data: { wishlisted: false } });
    }

    const product = await ProductModel.findById(productId).select("_id");
    if (!product) {
      return res.status(404).json({ message: "Product not found", error: true, success: false });
    }
    await WishlistModel.create({ userId, productId });
    return res.status(201).json({ message: "Added to wishlist", error: false, success: true, data: { wishlisted: true } });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};
