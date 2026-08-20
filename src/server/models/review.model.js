import mongoose from "mongoose";

// Session 4 (Rating + Review system) — new model, project-wide grep
// confirmed nothing like this existed before. Shape/conventions match
// the rest of this codebase's models (see wishlist.model.js for the
// closest simple analog): plain Mongoose schema, `timestamps: true`,
// exported as `mongoose.models.x || mongoose.model("x", schema)` so hot
// reload / repeated require() never throws "Cannot overwrite model".
const reviewSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.ObjectId,
      ref: "product",
      required: true,
    },
    userId: {
      type: mongoose.Schema.ObjectId,
      ref: "user",
      required: true,
    },
    // The SPECIFIC order this review is verified against, not just a
    // boolean — lets an admin trace/audit a "Verified Purchase" claim
    // back to a real order if it's ever disputed. Nullable: a review
    // from someone who never ordered the product is still allowed
    // (matches how most real storefronts work — reviews aren't
    // restricted to buyers, they're just visibly LABELED when they are).
    orderId: {
      type: mongoose.Schema.ObjectId,
      ref: "order",
      default: null,
    },
    verifiedPurchase: {
      type: Boolean,
      default: false,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    title: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    // Reuses the existing Cloudinary upload pipeline (same as product
    // images) — just an array of hosted URLs, no new upload machinery.
    images: {
      type: [String],
      default: [],
    },
    // Soft-moderation only — an admin hiding a review never deletes
    // another user's content outright, and can always unhide it later.
    // A genuinely permanent delete is still possible (deleteReview
    // controller action) but is a separate, explicit action from hide.
    status: {
      type: String,
      enum: ["published", "hidden"],
      default: "published",
    },
    // Array of userIds, not a counter — makes "has THIS user already
    // marked this helpful" a simple .includes() check, and structurally
    // prevents double-voting rather than trusting client-side state to
    // not double-submit.
    helpfulVotes: {
      type: [mongoose.Schema.ObjectId],
      default: [],
    },
    // Seller/admin reply — a standard, expected pattern (buyer reviews,
    // seller responds). Nullable object rather than a separate
    // collection since a review has at most one reply in this design.
    adminReply: {
      text: { type: String, default: "" },
      repliedAt: { type: Date, default: null },
      repliedBy: { type: mongoose.Schema.ObjectId, ref: "user", default: null },
    },
  },
  { timestamps: true }
);

// One review per user per product (editable in place — see
// review.controller.js's create logic) — prevents duplicate-review spam
// from repeated clicks/resubmits and matches how real review systems
// behave (you can update your review, not stack five of them).
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
// The two real read patterns this feature needs: "all published reviews
// for a product, newest/highest/lowest/most-helpful first" (productId
// leading, matches every list query) and "does this user have a review
// for this product" (covered by the same compound index above).
reviewSchema.index({ productId: 1, status: 1, createdAt: -1 });
reviewSchema.index({ productId: 1, status: 1, rating: -1 });

const ReviewModel = mongoose.models.review || mongoose.model("review", reviewSchema);

export default ReviewModel;
