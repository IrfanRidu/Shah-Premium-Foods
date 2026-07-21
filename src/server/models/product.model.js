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
    // Database security audit (Section 7 — optimistic concurrency):
    // complements (doesn't replace) the atomic `$inc`-based stock
    // decrement in order.controller.js's decrementStockAndLog — that
    // atomic update is what actually prevents the stock-specific race
    // condition/oversell bug, and isn't affected by this setting either
    // way (`findOneAndUpdate` doesn't participate in Mongoose's version
    // check, only `.save()` does). This schema-level option is broader
    // defense in depth: it makes Mongoose check the document's version
    // key (`__v`) on every `.save()` call and reject with a
    // `VersionError` if the document changed since it was loaded.
    // One real place this can now surface: campaign.controller.js's
    // `syncProductCampaignDiscount()` does a genuine fetch → mutate →
    // save on a Product when campaigns are added/removed — if that ever
    // races against another `.save()` on the exact same product within
    // the same moment, it'll now throw instead of silently letting
    // whichever write finishes last silently overwrite the other. That's
    // the intended trade-off of optimistic concurrency (surfacing a rare
    // conflict beats hiding a lost update), and every caller of that
    // function already runs inside a try/catch that turns any thrown
    // error into a normal error response rather than crashing.
    optimisticConcurrency: true,
  }
);

// Text index for search — includes alternativeSpellings
productSchema.index({ name: "text", description: "text", alternativeSpellings: "text" });
// Database security audit (Section 7 — indexes): storefront category
// browsing filters by `{ publish: true, category: ... }` together —
// `publish` first, since almost every storefront query includes it and
// it narrows the collection down before `category` is applied.
productSchema.index({ publish: 1, category: 1 });
// Inventory low-stock / stock-level queries and sorts.
productSchema.index({ stock: 1 });

const ProductModel = mongoose.models.product || mongoose.model("product", productSchema);

export default ProductModel;
