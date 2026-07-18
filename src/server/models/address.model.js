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

const AddressModel = mongoose.models.address || mongoose.model("address", addressSchema);

export default AddressModel;
