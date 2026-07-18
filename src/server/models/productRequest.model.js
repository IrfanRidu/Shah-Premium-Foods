import mongoose from "mongoose";

// Customers can send in their regular shopping list — typed out, or a photo
// of a handwritten/printed list — instead of adding everything to the cart
// item by item. Admin reviews these as a queue and fulfils/contacts the
// customer accordingly.
const productRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.ObjectId, ref: "user", required: true },
    type: { type: String, enum: ["text", "image"], required: true },
    textContent: { type: String, default: "" }, // used when type === "text"
    imageUrl: { type: String, default: "" },     // used when type === "image" (Cloudinary URL)
    period: { type: String, enum: ["once", "daily", "weekly", "monthly"], default: "once" },
    status: { type: String, enum: ["Pending", "Processing", "Fulfilled", "Rejected"], default: "Pending" },
    adminNote: { type: String, default: "" },
    customerNote: { type: String, default: "" },
  },
  { timestamps: true }
);

productRequestSchema.index({ userId: 1, createdAt: -1 });
productRequestSchema.index({ status: 1, createdAt: -1 });

const ProductRequestModel = mongoose.models.productRequest || mongoose.model("productRequest", productRequestSchema);
export default ProductRequestModel;
