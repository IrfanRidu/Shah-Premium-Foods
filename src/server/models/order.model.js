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
  {
    timestamps: true,
    // Database security audit (Section 7 — optimistic concurrency): every
    // `.save()` on an Order in this codebase is either a brand-new order
    // being created (no conflict possible) or an admin status update —
    // and status updates go through `order.save()` after loading the
    // document in updateOrderStatusController/cancelOwnOrderController.
    // If two admins update the same order's status at nearly the same
    // moment, this now makes the second one fail with a clear conflict
    // instead of silently overwriting the first admin's change (e.g. one
    // marks it "Cancelled" while another marks it "Shipped" — without
    // this, whichever write lands last silently wins with no trace of
    // the other ever happening).
    optimisticConcurrency: true,
  }
);

orderSchema.index({ order_status: 1, createdAt: -1 });
orderSchema.index({ userId: 1, createdAt: -1 });

const OrderModel = mongoose.models.order || mongoose.model("order", orderSchema);
export default OrderModel;
