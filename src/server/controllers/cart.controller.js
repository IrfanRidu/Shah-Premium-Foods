import CartProductModel from "../models/cartProduct.model.js";
import UserModel from "../models/user.model.js";
import ProductModel from "../models/product.model.js";

// ADD TO CART
export const addToCartItemController = async (req, res) => {
  try {
    const userId = req.userId;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        message: "Product id is required",
        error: true,
        success: false,
      });
    }

    const existingItem = await CartProductModel.findOne({
      userId,
      productId,
    });

    if (existingItem) {
      return res.status(400).json({
        message: "Product already exists in cart",
        error: true,
        success: false,
      });
    }

    const cartItem = new CartProductModel({
      productId,
      quantity: 1,
      userId,
    });

    const saved = await cartItem.save();

    await UserModel.updateOne(
      { _id: userId },
      { $push: { shopping_cart: saved._id } }
    );

    return res.status(201).json({
      message: "Item added to cart",
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

// GET CART ITEMS
export const getCartItemController = async (req, res) => {
  try {
    const userId = req.userId;

    const cartItems = await CartProductModel.find({ userId }).populate(
      "productId"
    );

    return res.json({
      message: "Cart items fetched successfully",
      error: false,
      success: true,
      data: cartItems,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// UPDATE CART ITEM QUANTITY
export const updateCartItemQtyController = async (req, res) => {
  try {
    const userId = req.userId;
    const { _id, qty } = req.body;

    if (!_id || qty === undefined) {
      return res.status(400).json({
        message: "Cart item id and quantity are required",
        error: true,
        success: false,
      });
    }

    if (qty < 1) {
      return res.status(400).json({
        message: "Quantity must be at least 1",
        error: true,
        success: false,
      });
    }

    const updated = await CartProductModel.findOneAndUpdate(
      { _id, userId },
      { quantity: qty },
      { new: true }
    );

    return res.json({
      message: "Cart item updated",
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

// DELETE CART ITEM
export const deleteCartItemController = async (req, res) => {
  try {
    const userId = req.userId;
    const { _id } = req.body;

    if (!_id) {
      return res.status(400).json({
        message: "Cart item id is required",
        error: true,
        success: false,
      });
    }

    await CartProductModel.deleteOne({ _id, userId });

    await UserModel.updateOne(
      { _id: userId },
      { $pull: { shopping_cart: _id } }
    );

    return res.json({
      message: "Cart item removed",
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

// CLEAR CART (used after order placed)
export const clearCartController = async (req, res) => {
  try {
    const userId = req.userId;

    await CartProductModel.deleteMany({ userId });
    await UserModel.updateOne({ _id: userId }, { shopping_cart: [] });

    return res.json({
      message: "Cart cleared",
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
