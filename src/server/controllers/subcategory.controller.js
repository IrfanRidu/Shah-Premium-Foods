import SubCategoryModel from "../models/subcategory.model.js";
import ProductModel from "../models/product.model.js";


// ADD SUB CATEGORY (admin)
export const addSubCategoryController = async (req, res) => {
  try {
    const { name, image, category, translations } = req.body;

    if (!name || !category || category.length === 0) {
      return res.status(400).json({
        message: "Sub category name and category are required",
        error: true,
        success: false,
      });
    }

    const subCategory = new SubCategoryModel({
      name,
      image,
      category,
      translations,
    });

    const saved = await subCategory.save();

    return res.status(201).json({
      message: "Sub category added successfully",
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

// GET ALL SUB CATEGORIES (public)
export const getSubCategoriesController = async (req, res) => {
  try {
    const subCategories = await SubCategoryModel.find()
      .sort({ createdAt: -1 })
      .populate("category");

    return res.json({
      message: "Sub categories fetched successfully",
      error: false,
      success: true,
      data: subCategories,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// UPDATE SUB CATEGORY (admin)
export const updateSubCategoryController = async (req, res) => {
  try {
    const { _id, name, image, category, translations } = req.body;

    if (!_id) {
      return res.status(400).json({
        message: "Sub category id is required",
        error: true,
        success: false,
      });
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (image !== undefined) updateData.image = image;
    if (category) updateData.category = category;
    if (translations) updateData.translations = translations;

    const updated = await SubCategoryModel.findByIdAndUpdate(_id, updateData, {
      new: true,
    });

    return res.json({
      message: "Sub category updated successfully",
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

// DELETE SUB CATEGORY (admin)
export const deleteSubCategoryController = async (req, res) => {
  try {
    const { _id } = req.body;

    if (!_id) {
      return res.status(400).json({
        message: "Sub category id is required",
        error: true,
        success: false,
      });
    }

    const checkProduct = await ProductModel.find({
      subCategory: { $in: [_id] },
    });

    if (checkProduct.length > 0) {
      return res.status(400).json({
        message: "Cannot delete sub category. It is used in products.",
        error: true,
        success: false,
      });
    }

    await SubCategoryModel.findByIdAndDelete(_id);

    return res.json({
      message: "Sub category deleted successfully",
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
