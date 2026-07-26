import CategoryModel from "../models/category.model.js";
import SubCategoryModel from "../models/subcategory.model.js";
import ProductModel from "../models/product.model.js";
import cache from "../../lib/cache.js";

// Section 9 (Performance) — "Route cache / API cache / Redis-ready
// architecture" (see lib/cache.js for the full reasoning). Category list
// is fetched by nearly every visitor on nearly every page load (via
// GlobalProvider) and only actually changes when an admin adds/edits/
// deletes one — a textbook cache candidate. TTL is a safety net;
// invalidate() below is the real invalidation path so admin edits show up
// immediately rather than waiting out the TTL.
const CATEGORY_CACHE_KEY = "category:all";

// ADD CATEGORY (admin)
export const addCategoryController = async (req, res) => {
  try {
    const { name, image, translations } = req.body;

    if (!name) {
      return res.status(400).json({
        message: "Category name is required",
        error: true,
        success: false,
      });
    }

    const category = new CategoryModel({ name, image, translations });
    const saved = await category.save();
    await cache.invalidate("category:");

    return res.status(201).json({
      message: "Category added successfully",
      error: false,
      success: true,
      data: saved,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// GET ALL CATEGORIES (public)
export const getCategoriesController = async (req, res) => {
  try {
    const categories = await cache.getOrSet(
      CATEGORY_CACHE_KEY,
      () => CategoryModel.find().sort({ createdAt: 1 }),
      cache.TTL.MEDIUM
    );

    return res.json({
      message: "Categories fetched successfully",
      error: false,
      success: true,
      data: categories,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// UPDATE CATEGORY (admin)
export const updateCategoryController = async (req, res) => {
  try {
    const { _id, name, image, translations } = req.body;

    if (!_id) {
      return res.status(400).json({
        message: "Category id is required",
        error: true,
        success: false,
      });
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (image !== undefined) updateData.image = image;
    if (translations) updateData.translations = translations;

    const updated = await CategoryModel.findByIdAndUpdate(_id, updateData, {
      new: true,
    });
    await cache.invalidate("category:");

    return res.json({
      message: "Category updated successfully",
      error: false,
      success: true,
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// DELETE CATEGORY (admin)
export const deleteCategoryController = async (req, res) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      return res.status(400).json({
        message: "Category id is required",
        error: true,
        success: false,
      });
    }

    const checkSubCategory = await SubCategoryModel.find({
      category: { $in: [_id] },
    });

    const checkProduct = await ProductModel.find({
      category: { $in: [_id] },
    });

    if (checkSubCategory.length > 0 || checkProduct.length > 0) {
      return res.status(400).json({
        message: "Cannot delete category. It is used in sub categories or products.",
        error: true,
        success: false,
      });
    }

    await CategoryModel.findByIdAndDelete(_id);
    await cache.invalidate("category:");

    return res.json({
      message: "Category deleted successfully",
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
