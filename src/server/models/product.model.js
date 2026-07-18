import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    image: {
      type: [String],
      default: [],
    },
    category: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "category",
      },
    ],
    subCategory: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "subCategory",
      },
    ],
    unit: {
      type: String,
      default: "",
    },
    sku: {
      type: String,
      default: "",
      trim: true,
    },
    alternativeSpellings: {
      type: [String],
      default: [],
    },
    preCampaignDiscount: {
      type: Number,
      default: 0,
    },
    stock: {
      type: Number,
      default: 0,
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
    },
    overstockThreshold: {
      type: Number,
      default: 200,
    },
    price: {
      type: Number,
      required: true,
    },
    costPrice: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    // Stores the product's own discount value while it's been zeroed out
    // because the product is currently assigned to one or more campaigns.
    // Restored automatically once the product is removed from all campaigns.
    preCampaignDiscount: {
      type: Number,
      default: 0,
    },
    shortDescription: {
      type: String,
      default: "",
      maxlength: 200,
    },
    description: {
      type: String,
      default: "",
    },
    more_details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    publish: {
      type: Boolean,
      default: true,
    },
    translations: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Text index for search — includes alternativeSpellings
productSchema.index({ name: "text", description: "text", alternativeSpellings: "text" });

const ProductModel = mongoose.models.product || mongoose.model("product", productSchema);

export default ProductModel;
