import AnalyticsSettingsModel from "../models/analyticsSettings.model.js";

export const getAnalyticsSettingsController = async (req, res) => {
  try {
    let settings = await AnalyticsSettingsModel.findOne({ key: "main" });
    if (!settings) settings = await new AnalyticsSettingsModel({ key: "main" }).save();
    return res.json({ success: true, error: false, data: settings });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

export const updateAnalyticsSettingsController = async (req, res) => {
  try {
    const { monthlyExpenses, investment, equity, cashBalance, bankBalance, assets, liabilities,
      adSpend, adClicks, adRevenue, emailsSent, emailOpens, emailClicks, enabledMetrics,
      salesTaxRate, depreciationAmortization } = req.body;

    let settings = await AnalyticsSettingsModel.findOne({ key: "main" });
    if (!settings) settings = new AnalyticsSettingsModel({ key: "main" });

    if (monthlyExpenses) settings.monthlyExpenses = { ...settings.monthlyExpenses?.toObject?.() || settings.monthlyExpenses, ...monthlyExpenses };
    if (investment !== undefined)  settings.investment  = investment;
    if (equity !== undefined)      settings.equity      = equity;
    if (cashBalance !== undefined) settings.cashBalance = cashBalance;
    if (bankBalance !== undefined) settings.bankBalance = bankBalance;
    if (assets !== undefined)      settings.assets      = assets;
    if (liabilities !== undefined) settings.liabilities = liabilities;
    if (adSpend !== undefined)     settings.adSpend     = adSpend;
    if (adClicks !== undefined)    settings.adClicks    = adClicks;
    if (adRevenue !== undefined)   settings.adRevenue   = adRevenue;
    if (emailsSent !== undefined)  settings.emailsSent  = emailsSent;
    if (emailOpens !== undefined)  settings.emailOpens  = emailOpens;
    if (emailClicks !== undefined) settings.emailClicks = emailClicks;
    if (enabledMetrics) {
      settings.enabledMetrics = new Map(Object.entries(enabledMetrics));
    }
    if (salesTaxRate !== undefined) settings.salesTaxRate = salesTaxRate;
    if (depreciationAmortization !== undefined) settings.depreciationAmortization = depreciationAmortization;

    await settings.save();
    return res.json({ success: true, error: false, data: settings, message: "Analytics settings saved" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
