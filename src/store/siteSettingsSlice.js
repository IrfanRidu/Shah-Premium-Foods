import { createSlice } from "@reduxjs/toolkit";

const initial = {
  siteName: "Shah Premium Foods",
  logo: "",
  favicon: "",
  banners: [],
  header: { announcementText: "", showAnnouncement: false },
  footer: {
    aboutText: "",
    address: "",
    phone: "",
    email: "",
    copyrightText: "",
    quickLinks: [],
    col2Title: "Quick Links",
    col3Title: "Follow Us",
    showNewsletter: false,
    socialLinks: { facebook: "", instagram: "", twitter: "", youtube: "" },
  },
  theme: {
    activeTheme: "default",
    availableThemes: ["default", "dark", "ocean", "festive"],
    primaryColor: "#4A7860",
    secondaryColor: "#C08040",
  },
  language: { activeLanguage: "en", availableLanguages: ["en", "bn", "fr"] },
  headings: {},
  faq: [],
  paymentMethods: [],
  shoppingListBanner: {
    enabled: true,
    title: "Submit Your Shopping List",
    subtitle: "Can't find what you need? Send us your shopping list and we'll get it for you!",
    buttonText: "Submit Shopping List",
  },
  codRequireDeliveryCharge: false,
  loaded: false,
};

const siteSettingsSlice = createSlice({
  name: "siteSettings",
  initialState: initial,
  reducers: {
    // Fix 41 / 44 / 49 root cause: this used to be a flat `{...s, ...payload}`
    // shallow merge. Since `payload.theme` and `payload.language` are whole
    // objects, that spread REPLACED s.theme / s.language entirely — including
    // the user's personally-chosen activeTheme/activeLanguage — with whatever
    // the admin's DB document has. fetchSiteSettings() runs on every single
    // page mount, so a user's theme/language visibly reverted to the site
    // default a few hundred ms after every refresh (as soon as the fetch
    // resolved), even though localStorage had just correctly hydrated the
    // right value pre-render. This is why it looked like settings/theme
    // "reset" or went "empty" on refresh — the DB fetch was quietly winning
    // a race against the user's own saved preference.
    //
    // Fix: server data always wins for site-wide content (banners, footer,
    // faq, logo, colors, availableThemes/Languages, etc.) since that must
    // always reflect admin truth. But the *personal* leaf choices
    // (activeTheme / activeLanguage) are preserved across every refetch
    // once the user has made a choice — only a genuinely first-ever visit
    // (s.loaded === false, nothing chosen yet) takes the server default.
    setSiteSettings: (s, a) => {
      const payload = a.payload || {};
      const merged = { ...s, ...payload, loaded: true };
      if (s.loaded) {
        merged.theme = { ...payload.theme, activeTheme: s.theme.activeTheme };
        merged.language = { ...payload.language, activeLanguage: s.language.activeLanguage };
      }
      return merged;
    },
    setActiveTheme: (s, a) => { s.theme.activeTheme = a.payload; },
    setActiveLanguage: (s, a) => { s.language.activeLanguage = a.payload; },
  },
});

export const { setSiteSettings, setActiveTheme, setActiveLanguage } = siteSettingsSlice.actions;
export default siteSettingsSlice.reducer;
