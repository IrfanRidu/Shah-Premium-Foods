import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    address_line: {
      type: String,
      default: "",
    },
    city: {
      type: String,
      default: "",
    },
    state: {
      type: String,
      default: "",
    },
    pincode: {
      type: String,
      default: "",
    },
    country: {
      type: String,
      default: "",
    },
    mobile: {
      type: String,
      default: "",
    },
    userId: {
      type: mongoose.Schema.ObjectId,
      ref: "user",
    },
    status: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Database security audit (Section 7 — indexes): every address list fetch
// filters by `{ userId }` (see address.controller.js) — this field had no
// index at all, meaning that query required a full collection scan.
// ObjectId ref fields are NOT automatically indexed by Mongoose just for
// being defined with `ref:` — an explicit index is needed.
addressSchema.index({ userId: 1 });

const AddressModel = mongoose.models.address || mongoose.model("address", addressSchema);

export default AddressModel;
