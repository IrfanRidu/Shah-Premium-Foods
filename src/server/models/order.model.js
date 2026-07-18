import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.ObjectId, ref: "user" },
    orderId: { type: String, required: [true, "Order ID is required"], unique: true },
    productDetails: [
      {
        productId: { type: mongoose.Schema.ObjectId, ref: "product" },
        name: String,
        image: [String],
        quantity: Number,
        price: Number,
        costPrice: { type: Number, default: 0 },
      },
    ],
    paymentId: { type: String, default: "" },
    payment_status: { type: String, default: "PENDING" },
    delivery_address: { type: mongoose.Schema.ObjectId, ref: "address" },
    subTotalAmt: { type: Number, default: 0 },
    discountAmt: { type: Number, default: 0 },
    deliveryCharge: { type: Number, default: 0 },
    deliveryChargePaidOnline: { type: Boolean, default: false },
    deliveryZoneName: { type: String, default: "" },
    deliveryZoneId: { type: mongoose.Schema.ObjectId, ref: "deliveryZone", default: null },
    totalAmt: { type: Number, default: 0 },
    invoice_receipt: { type: String, default: "" },
    couponCode: { type: String, default: "" },
    order_status: {
      type: String,
      enum: ["Pending","Confirmed","On-Hold","On the way","Delivered","Cancelled","Return","Refunded"],
      default: "Pending",
    },
    statusHistory: [
      {
        status: { type: String },
        note: { type: String, default: "" },
        changedBy: { type: mongoose.Schema.ObjectId, ref: "user", default: null },
        changedAt: { type: Date, default: Date.now },
      },
    ],
    customerSnapshot: {
      name: { type: String, default: "" },
      email: { type: String, default: "" },
      mobile: { type: String, default: "" },
    },
    refundNote: { type: String, default: "" },
    refundedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

orderSchema.index({ order_status: 1, createdAt: -1 });
orderSchema.index({ userId: 1, createdAt: -1 });

const OrderModel = mongoose.models.order || mongoose.model("order", orderSchema);
export default OrderModel;
