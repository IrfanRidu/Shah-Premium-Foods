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
      enum: ["view", "add_to_cart", "purchase", "search", "wishlist", "page_visit"],
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
