import CampaignModel from "../models/campaign.model.js";
import ProductModel from "../models/product.model.js";

const DEFAULT_NAME = "Flash Sale";
const DEFAULT_ICON = "bolt";

// ── Discount sync helper ────────────────────────────────────────────────
// A product's own `discount` is turned OFF (set to 0) the moment it's
// selected for ANY campaign — the campaign's specialDiscount takes over
// instead. The original discount is stashed in `preCampaignDiscount` so it
// can be restored automatically once the product is no longer part of any
// campaign at all.
const syncProductCampaignDiscount = async (productIds = []) => {
  const uniqueIds = [...new Set(productIds.filter(Boolean).map((id) => id.toString()))];
  if (uniqueIds.length === 0) return;

  for (const productId of uniqueIds) {
    const stillInCampaign = await CampaignModel.exists({ "products.productId": productId });
    const product = await ProductModel.findById(productId);
    if (!product) continue;

    if (stillInCampaign) {
      // Turn off the regular discount, stash it if not already stashed
      if (product.discount > 0) {
        product.preCampaignDiscount = product.discount;
        product.discount = 0;
        await product.save();
      }
    } else {
      // No longer in any campaign — restore the original discount
      if (product.preCampaignDiscount > 0) {
        product.discount = product.preCampaignDiscount;
        product.preCampaignDiscount = 0;
        await product.save();
      }
    }
  }
};

// GET active campaigns (public)
export const getActiveCampaignsController = async (req, res) => {
  try {
    const now = new Date();
    const campaigns = await CampaignModel.find({
      isActive: true,
      startTime: { $lte: now },
      endTime: { $gte: now },
    })
      .sort({ displayOrder: 1, createdAt: -1 })
      .populate({ path: "products.productId", select: "name image price discount unit stock publish sku" });

    const withValidity = campaigns.map((c) => ({
      ...c.toObject(),
      name: c.name || DEFAULT_NAME,
      icon: c.icon || DEFAULT_ICON,
      products: c.products.filter((p) => p.productId && p.productId.publish !== false),
    }));

    return res.json({ success: true, error: false, data: withValidity });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// GET all campaigns (admin)
export const getAllCampaignsController = async (req, res) => {
  try {
    const campaigns = await CampaignModel.find()
      .sort({ createdAt: -1 })
      .populate({ path: "products.productId", select: "name image price discount" });
    return res.json({ success: true, error: false, data: campaigns });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// GET single campaign
export const getCampaignByIdController = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await CampaignModel.findById(id).populate({
      path: "products.productId", select: "name image price discount unit stock",
    });
    if (!campaign) return res.status(404).json({ success: false, error: true, message: "Campaign not found" });
    return res.json({ success: true, error: false, data: campaign });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// CREATE campaign (admin) — name/icon optional, falls back to classic Flash Sale look
export const createCampaignController = async (req, res) => {
  try {
    const { name, icon, description, startTime, endTime, products, isActive, showOnHomepage, showOnProductPage, displayOrder, bannerImage, badgeColor } = req.body;
    if (!startTime || !endTime)
      return res.status(400).json({ success: false, error: true, message: "startTime and endTime are required" });

    const campaign = new CampaignModel({
      name: (name || "").trim() || DEFAULT_NAME,
      icon: icon || DEFAULT_ICON,
      description, startTime, endTime,
      products: products || [],
      isActive, showOnHomepage, showOnProductPage,
      displayOrder: displayOrder || 0,
      bannerImage: bannerImage || "",
      badgeColor: badgeColor || "#ef4444",
    });
    await campaign.save();

    // Turn off regular discount for every product just added to this campaign
    await syncProductCampaignDiscount((products || []).map((p) => p.productId));

    const populated = await CampaignModel.findById(campaign._id).populate({
      path: "products.productId", select: "name image price discount unit",
    });

    return res.status(201).json({ success: true, error: false, data: populated, message: "Campaign created" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// UPDATE campaign (admin)
export const updateCampaignController = async (req, res) => {
  try {
    const { _id, ...updates } = req.body;
    if (updates.name !== undefined) updates.name = updates.name.trim() || DEFAULT_NAME;
    if (updates.icon !== undefined) updates.icon = updates.icon || DEFAULT_ICON;

    // Capture the product list BEFORE the update so we know which products
    // were removed (and may need their discount restored) as well as which
    // were newly added (and need their discount turned off).
    const before = await CampaignModel.findById(_id).select("products");
    const beforeIds = (before?.products || []).map((p) => p.productId?.toString());

    const campaign = await CampaignModel.findByIdAndUpdate(_id, updates, { new: true }).populate({
      path: "products.productId", select: "name image price discount unit",
    });
    if (!campaign) return res.status(404).json({ success: false, error: true, message: "Not found" });

    if (updates.products !== undefined) {
      const afterIds = campaign.products.map((p) => (p.productId?._id || p.productId)?.toString());
      const affected = [...new Set([...beforeIds, ...afterIds])];
      await syncProductCampaignDiscount(affected);
    }

    const refreshed = await CampaignModel.findById(_id).populate({
      path: "products.productId", select: "name image price discount unit",
    });

    return res.json({ success: true, error: false, data: refreshed, message: "Updated" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// DELETE campaign (admin)
export const deleteCampaignController = async (req, res) => {
  try {
    const { _id } = req.body;
    const campaign = await CampaignModel.findById(_id).select("products");
    const productIds = (campaign?.products || []).map((p) => p.productId);

    await CampaignModel.findByIdAndDelete(_id);

    // Restore discounts for any product that's no longer in any campaign
    await syncProductCampaignDiscount(productIds);

    return res.json({ success: true, error: false, message: "Deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ADD product to campaign (admin)
export const addProductToCampaignController = async (req, res) => {
  try {
    const { campaignId, productId, specialPrice, specialDiscount } = req.body;
    const campaign = await CampaignModel.findById(campaignId);
    if (!campaign) return res.status(404).json({ success: false, error: true, message: "Campaign not found" });
    const exists = campaign.products.find((p) => p.productId?.toString() === productId);
    if (exists) return res.status(400).json({ success: false, error: true, message: "Product already in this campaign" });
    campaign.products.push({ productId, specialPrice: specialPrice || 0, specialDiscount: specialDiscount || 0 });
    await campaign.save();

    // Turn off this product's regular discount — the campaign discount governs now
    await syncProductCampaignDiscount([productId]);

    const updated = await CampaignModel.findById(campaignId).populate({ path: "products.productId", select: "name image price discount unit" });
    return res.json({ success: true, error: false, data: updated, message: "Product added to campaign" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// REMOVE product from campaign (admin)
export const removeProductFromCampaignController = async (req, res) => {
  try {
    const { campaignId, productId } = req.body;
    const campaign = await CampaignModel.findByIdAndUpdate(
      campaignId,
      { $pull: { products: { productId } } },
      { new: true }
    ).populate({ path: "products.productId", select: "name image price discount unit" });

    // Restore the product's regular discount if it's not in any other campaign
    await syncProductCampaignDiscount([productId]);

    return res.json({ success: true, error: false, data: campaign, message: "Product removed" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
