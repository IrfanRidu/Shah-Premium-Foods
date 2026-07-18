import mongoose from "mongoose";

const deliveryZoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Inside Dhaka", "Outside Dhaka"
    matchCities: [{ type: String, trim: true }], // city names that fall in this zone (case-insensitive match)
    charge: { type: Number, required: true, min: 0 },
    freeDeliveryThreshold: { type: Number, default: 0 }, // 0 = no free-delivery offer for this zone
    estimatedDays: { type: String, default: "" }, // e.g. "1-2 days"
    isDefault: { type: Boolean, default: false }, // fallback zone when no city matches
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const DeliveryZoneModel = mongoose.models.deliveryZone || mongoose.model("deliveryZone", deliveryZoneSchema);
export default DeliveryZoneModel;
