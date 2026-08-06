import mongoose from "mongoose";

const wishlistSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.ObjectId,
      ref: "user",
      required: true,
    },
    productId: {
      type: mongoose.Schema.ObjectId,
      ref: "product",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// A user can only wishlist the same product once — prevents duplicate
// entries from a double-click/race on the toggle button — and this
// compound index is also exactly what both real queries this feature
// makes need: "is this specific product already in my wishlist" (userId
// + productId) and "list my whole wishlist" (userId, the index's leading
// field covers this too).
wishlistSchema.index({ userId: 1, productId: 1 }, { unique: true });

const WishlistModel = mongoose.models.wishlist || mongoose.model("wishlist", wishlistSchema);

export default WishlistModel;
