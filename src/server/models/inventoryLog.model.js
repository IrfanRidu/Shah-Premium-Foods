import mongoose from "mongoose";

const inventoryLogSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.ObjectId, ref: "product", required: true },
    type: {
      type: String,
      enum: ["restock", "sale", "adjustment", "return", "damage", "initial"],
      required: true,
    },
    quantity: { type: Number, required: true },
    previousStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    note: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.ObjectId, ref: "user", default: null },
    reference: { type: String, default: "" }, // orderId or other ref
  },
  { timestamps: true }
);

inventoryLogSchema.index({ productId: 1, createdAt: -1 });

const InventoryLogModel = mongoose.models.inventoryLog || mongoose.model("inventoryLog", inventoryLogSchema);
export default InventoryLogModel;
