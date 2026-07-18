import SiteSettingsModel from "../models/siteSettings.model.js";

// Get settings (creates default doc if none exists) - public
export const getSiteSettingsController = async (req, res) => {
  try {
    let settings = await SiteSettingsModel.findOne({ key: "main" });

    if (!settings) {
      settings = await new SiteSettingsModel({ key: "main" }).save();
    }

    return res.json({
      message: "Site settings fetched successfully",
      error: false,
      success: true,
      data: settings,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// Update settings (admin) - partial update, deep-merge style
export const updateSiteSettingsController = async (req, res) => {
  try {
    const updateData = req.body;

    let settings = await SiteSettingsModel.findOne({ key: "main" });

    if (!settings) {
      settings = new SiteSettingsModel({ key: "main" });
    }

    Object.keys(updateData).forEach((field) => {
      const value = updateData[field];

      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        settings[field] &&
        typeof settings.toObject()[field] === "object"
      ) {
        settings[field] = { ...settings.toObject()[field], ...value };
        // Fix 6: dynamic bracket-notation assignment (settings[field] = ...,
        // where `field` is a runtime string) is less reliable for Mongoose's
        // automatic dirty-tracking on nested-schema paths than a literal
        // `settings.footer = ...` would be. Explicitly marking it modified
        // removes any doubt that the nested object actually gets persisted —
        // this is very likely the same underlying class of issue as Fix 3's
        // route-caching bug (which meant even a successful save could look
        // like it "didn't take" to any session other than the one that made
        // the change), but costs nothing to also harden here directly.
        settings.markModified(field);
      } else {
        settings[field] = value;
      }
    });

    const saved = await settings.save();

    return res.json({
      message: "Site settings updated successfully",
      error: false,
      success: true,
      data: saved,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// Add a banner (admin)
export const addBannerController = async (req, res) => {
  try {
    const { image, mobileImage, link, title, order } = req.body;

    let settings = await SiteSettingsModel.findOne({ key: "main" });

    if (!settings) {
      settings = new SiteSettingsModel({ key: "main" });
    }

    settings.banners.push({ image, mobileImage, link, title, order });
    const saved = await settings.save();

    return res.status(201).json({
      message: "Banner added successfully",
      error: false,
      success: true,
      data: saved,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// Delete a banner (admin)
export const deleteBannerController = async (req, res) => {
  try {
    // Fix #7: frontend sends `_id` (matching every other delete endpoint in
    // this app — see deleteProductController etc.) but this controller was
    // reading `bannerId`, which was always undefined. The filter below then
    // never matched any banner's real _id, so nothing was ever actually
    // removed from the database — the banner only *looked* deleted because
    // the admin page also removes it from local React state immediately.
    // On the next refresh (or for any other admin), the untouched DB copy
    // reappeared, which is what looked like "settings not updating."
    const { _id } = req.body;
    if (!_id) {
      return res.status(400).json({ message: "Banner _id is required", error: true, success: false });
    }

    const settings = await SiteSettingsModel.findOne({ key: "main" });

    if (!settings) {
      return res.status(404).json({
        message: "Settings not found",
        error: true,
        success: false,
      });
    }

    settings.banners = settings.banners.filter(
      (b) => b._id.toString() !== _id
    );

    const saved = await settings.save();

    return res.json({
      message: "Banner removed successfully",
      error: false,
      success: true,
      data: saved,
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

// ADMIN: Manage FAQ items (full replace)
export const updateFaqController = async (req, res) => {
  try {
    const { faq } = req.body;
    if (!Array.isArray(faq)) {
      return res.status(400).json({ message: "faq must be an array", error: true, success: false });
    }
    let settings = await SiteSettingsModel.findOne({ key: "main" });
    if (!settings) settings = new SiteSettingsModel({ key: "main" });
    settings.faq = faq;
    const saved = await settings.save();
    return res.json({ message: "FAQ updated", error: false, success: true, data: saved.faq });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// PUBLIC: Get FAQ items
export const getFaqController = async (req, res) => {
  try {
    const settings = await SiteSettingsModel.findOne({ key: "main" });
    const faq = settings?.faq || [];
    return res.json({ message: "FAQ fetched", error: false, success: true, data: faq });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};
