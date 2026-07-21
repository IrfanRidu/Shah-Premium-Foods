import mongoose from "mongoose";

const cartProductSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.ObjectId,
      ref: "product",
    },
    quantity: {
      type: Number,
      default: 1,
    },
    userId: {
      type: mongoose.Schema.ObjectId,
      ref: "user",
    },
  },
  {
    timestamps: true,
  }
);

// Database security audit (Section 7 — indexes): every cart fetch filters
// by `{ userId }` — no index existed for it.
cartProductSchema.index({ userId: 1 });

const CartProductModel = mongoose.models.cartProduct || mongoose.model("cartProduct", cartProductSchema);

export default CartProductModel;
