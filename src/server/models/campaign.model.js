import mongoose from "mongoose";

// A "Campaign" is the general concept — admin names it whatever they like
// ("Weekend Mega Sale", "Eid Special", "Clearance Week"...). If the admin
// leaves the name/icon blank, it falls back to the classic "Flash Sale" ⚡ look.
const campaignSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Flash Sale", trim: true },
    icon: { type: String, default: "bolt" }, // icon key — see ICONS map on the frontend (bolt, gift, fire, tag, star, percent)
    description: { type: String, default: "" },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    products: [
      {
        productId: { type: mongoose.Schema.ObjectId, ref: "product" },
        specialPrice: { type: Number, default: 0 },
        specialDiscount: { type: Number, default: 0 },
      },
    ],
    isActive: { type: Boolean, default: true },
    showOnHomepage: { type: Boolean, default: true },
    showOnProductPage: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    bannerImage: { type: String, default: "" },
    // Fix 21: badge styling — solid color remains the default/fallback,
    // but admin can instead choose a gradient or upload a custom badge background image.
    badgeColor: { type: String, default: "#ef4444" },
    badgeStyle: { type: String, enum: ["solid", "gradient", "image"], default: "solid" },
    badgeGradient: { type: String, default: "" }, // e.g. "linear-gradient(135deg, #ef4444, #f97316)"
    badgeImage: { type: String, default: "" },     // uploaded badge background
    textColor: { type: String, default: "#ffffff" },
    iconColor: { type: String, default: "#ffffff" },
  },
  { timestamps: true }
);

// Collection name kept as "flashSale" so existing data from earlier phases keeps working —
// only the concept/label/UI is renamed to "Campaign".
const CampaignModel = mongoose.models.flashSale || mongoose.model("flashSale", campaignSchema);
export default CampaignModel;
