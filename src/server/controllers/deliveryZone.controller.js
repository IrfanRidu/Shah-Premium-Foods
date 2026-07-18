import DeliveryZoneModel from "../models/deliveryZone.model.js";

// Resolve the delivery charge for an order.
// If `zoneId` is supplied (the zone the user explicitly picked at checkout — see Fix 7),
// that zone is authoritative and is used directly, after confirming it's still active.
// Otherwise falls back to matching the address city against each zone's matchCities list.
// The CHARGE itself is always recomputed server-side from the zone's stored rate — the
// client-side quote is for display only and is never trusted for what gets billed.
export const resolveDeliveryCharge = async (city = "", orderAmount = 0, zoneId = null) => {
  const zones = await DeliveryZoneModel.find({ isActive: true }).sort({ displayOrder: 1 });
  if (zones.length === 0) return { charge: 0, zoneName: "", zoneId: null, estimatedDays: "" };

  let matched = null;

  if (zoneId) {
    matched = zones.find((z) => z._id.toString() === zoneId.toString());
    // If the requested zoneId is invalid/inactive, fall through to city matching
    // rather than silently failing the order.
  }

  if (!matched) {
    const cityLower = (city || "").trim().toLowerCase();
    matched = zones.find((z) =>
      z.matchCities.some((c) => c.trim().toLowerCase() === cityLower)
    );
  }

  if (!matched) matched = zones.find((z) => z.isDefault) || zones[0];

  let charge = matched.charge;
  if (matched.freeDeliveryThreshold > 0 && orderAmount >= matched.freeDeliveryThreshold) {
    charge = 0;
  }
  return { charge, zoneName: matched.name, zoneId: matched._id, estimatedDays: matched.estimatedDays };
};

// PUBLIC: quote a delivery charge for checkout (before placing the order)
export const quoteDeliveryChargeController = async (req, res) => {
  try {
    const { city, orderAmount } = req.query;
    const result = await resolveDeliveryCharge(city, Number(orderAmount) || 0);
    return res.json({ success: true, error: false, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// PUBLIC: list active zones (e.g. to show "Delivery charges by area" info on storefront)
export const getActiveZonesController = async (req, res) => {
  try {
    const zones = await DeliveryZoneModel.find({ isActive: true }).sort({ displayOrder: 1 });
    return res.json({ success: true, error: false, data: zones });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ADMIN: list all zones
export const getAllZonesController = async (req, res) => {
  try {
    const zones = await DeliveryZoneModel.find().sort({ displayOrder: 1 });
    return res.json({ success: true, error: false, data: zones });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ADMIN: create zone
export const createZoneController = async (req, res) => {
  try {
    const { name, matchCities, charge, freeDeliveryThreshold, estimatedDays, isDefault, displayOrder } = req.body;
    if (!name || charge === undefined) {
      return res.status(400).json({ success: false, error: true, message: "Name and charge are required" });
    }
    if (isDefault) await DeliveryZoneModel.updateMany({}, { isDefault: false });

    const zone = new DeliveryZoneModel({
      name,
      matchCities: (matchCities || []).map((c) => c.trim()).filter(Boolean),
      charge: Number(charge),
      freeDeliveryThreshold: Number(freeDeliveryThreshold) || 0,
      estimatedDays: estimatedDays || "",
      isDefault: !!isDefault,
      displayOrder: Number(displayOrder) || 0,
    });
    await zone.save();
    return res.status(201).json({ success: true, error: false, data: zone, message: "Delivery zone created" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ADMIN: update zone
export const updateZoneController = async (req, res) => {
  try {
    const { _id, ...updates } = req.body;
    if (updates.matchCities) updates.matchCities = updates.matchCities.map((c) => c.trim()).filter(Boolean);
    if (updates.isDefault) await DeliveryZoneModel.updateMany({ _id: { $ne: _id } }, { isDefault: false });

    const zone = await DeliveryZoneModel.findByIdAndUpdate(_id, updates, { new: true });
    if (!zone) return res.status(404).json({ success: false, error: true, message: "Zone not found" });
    return res.json({ success: true, error: false, data: zone, message: "Zone updated" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ADMIN: delete zone
export const deleteZoneController = async (req, res) => {
  try {
    const { _id } = req.body;
    await DeliveryZoneModel.findByIdAndDelete(_id);
    return res.json({ success: true, error: false, message: "Zone deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
