import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.ObjectId, ref: "user", default: null },
    sessionId: { type: String, default: "" },
    productId: { type: mongoose.Schema.ObjectId, ref: "product", default: null },
    categoryId: { type: mongoose.Schema.ObjectId, ref: "category", default: null },
    subCategoryId: { type: mongoose.Schema.ObjectId, ref: "subCategory", default: null },
    actionType: {
      type: String,
      // Session 8 (new feature spec: "Dynamic Personalized Homepage
      // Product Recommendation System") — extended from the original 6
      // to cover every event type the recommendation engine's
      // preference/affinity calculation needs as a real, distinguishable
      // signal. Split `wishlist` into explicit add/remove (an add and a
      // remove are opposite-sign signals for preference purposes — a
      // remove shouldn't count as reinforcing interest the way an add
      // does) — safe to do outright rather than keep both old+new: grep
      // confirmed zero existing call sites ever wrote `"wishlist"`, so
      // there's no real historical data using that value to preserve
      // compatibility with. Naming follows this file's own existing
      // lowercase_snake_case convention (the spec's own examples use
      // SCREAMING_SNAKE_CASE, but Section 1 of the spec explicitly says
      // to follow the existing project's naming, not introduce a second
      // convention).
      enum: [
        "view", "add_to_cart", "remove_from_cart", "purchase", "search",
        "wishlist_add", "wishlist_remove", "page_visit",
        "product_click", "category_view", "subcategory_view", "product_share",
      ],
      required: true,
    },
    searchQuery: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ productId: 1, actionType: 1 });

const ActivityLogModel = mongoose.models.activityLog || mongoose.model("activityLog", activityLogSchema);
export default ActivityLogModel;
