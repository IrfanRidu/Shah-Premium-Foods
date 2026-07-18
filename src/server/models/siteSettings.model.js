import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema(
  {
    image: { type: String, default: "" },
    video: { type: String, default: "" },          // Fix 18: video/animation URL
    mobileImage: { type: String, default: "" },
    link: { type: String, default: "" },
    title: { type: String, default: "" },
    subtitle: { type: String, default: "" },
    buttonText: { type: String, default: "" },      // Fix 19: custom button text
    productIds: { type: [String], default: [] },    // Fix 19: products to feature
    campaignId: { type: String, default: "" },      // Fix 19: campaign to feature
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const faqSchema = new mongoose.Schema(
  {
    question: { type: String, default: "" },
    answer: { type: String, default: "" },
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const footerLinkSchema = new mongoose.Schema(
  {
    label: { type: String, default: "" },
    url: { type: String, default: "" },
  },
  { _id: true }
);

const siteSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "main", unique: true },
    seo: {
      metaTitle: { type: String, default: "" },
      metaDescription: { type: String, default: "" },
      metaKeywords: { type: String, default: "" },
      ogImage: { type: String, default: "" },
      canonicalUrl: { type: String, default: "" },
      structuredData: { type: String, default: "" },
      googleAnalyticsId: { type: String, default: "" },
      googleSearchConsoleId: { type: String, default: "" },
      robotsTxt: { type: String, default: "User-agent: *\nAllow: /" },
    },
    siteName: { type: String, default: "Shah Premium Foods" },
    // Item 7: site-wide default currency, set by the admin. Drives the
    // storefront default for anyone who hasn't personally picked a
    // different currency (see currencySlice.js), and is always what the
    // admin analytics/reporting pages show regardless of any personal
    // override, so business figures stay in one consistent currency.
    baseCurrency: { type: String, enum: ["BDT", "USD", "EUR", "INR", "PKR", "GBP"], default: "BDT" },
    logo: { type: String, default: "" },
    favicon: { type: String, default: "" },
    banners: [bannerSchema],
    header: {
      announcementText: { type: String, default: "" },
      showAnnouncement: { type: Boolean, default: false },
    },
    footer: {
      aboutText: { type: String, default: "" },
      address: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      copyrightText: { type: String, default: "" },
      quickLinks: { type: [footerLinkSchema], default: [] },
      col2Title: { type: String, default: "Quick Links" },
      col3Title: { type: String, default: "Follow Us" },
      showNewsletter: { type: Boolean, default: false },
      socialLinks: {
        facebook: { type: String, default: "" },
        instagram: { type: String, default: "" },
        twitter: { type: String, default: "" },
        youtube: { type: String, default: "" },
      },
    },
    theme: {
      activeTheme: { type: String, default: "default" },
      availableThemes: { type: [String], default: ["default", "dark", "ocean", "festive"] },
      primaryColor: { type: String, default: "#16a34a" },
      secondaryColor: { type: String, default: "#f97316" },
    },
    language: {
      activeLanguage: { type: String, default: "en" },
      availableLanguages: { type: [String], default: ["en", "bn", "fr"] },
    },
    headings: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    faq: { type: [faqSchema], default: [] },
    // Fix 7: admin-uploaded payment method logos (Visa, Mastercard, bKash…), shown bottom-right of the footer
    paymentMethods: {
      type: [{ name: { type: String, default: "" }, image: { type: String, default: "" } }],
      default: [],
    },
    shoppingListBanner: {
      enabled: { type: Boolean, default: true },
      title: { type: String, default: "Submit Your Shopping List" },
      subtitle: { type: String, default: "Can't find what you need? Send us your shopping list and we'll get it for you!" },
      buttonText: { type: String, default: "Submit Shopping List" },
    },
    codRequireDeliveryCharge: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const SiteSettingsModel = mongoose.models.siteSettings || mongoose.model("siteSettings", siteSettingsSchema);
export default SiteSettingsModel;
