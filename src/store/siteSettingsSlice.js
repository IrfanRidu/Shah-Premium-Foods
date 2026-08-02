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
    isOverride: false,
    availableThemes: ["default", "dark", "ocean", "festive"],
    primaryColor: "#4A7860",
    secondaryColor: "#C08040",
  },
  language: { activeLanguage: "en", isOverride: false, availableLanguages: ["en", "bn", "fr"] },
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
    // Fix 41 / 44 / 49 (original root cause, partially correct): this used
    // to be a flat `{...s, ...payload}` shallow merge, which let a DB
    // refetch blindly replace s.theme/s.language — including the user's
    // personally-chosen activeTheme/activeLanguage — with the admin's
    // stored document. That part of the diagnosis was right.
    //
    // Fix 50 (this pass — the part that was still missing): the guard that
    // was added, `if (s.loaded)`, does NOT do what its comment says. `loaded`
    // is only ever set to `true` by setSiteSettings itself (see `merged`
    // below) — it is never touched by setActiveTheme/setActiveLanguage.
    // Redux state always starts fresh on a page load (see store.js), so on
    // EVERY fresh page load, `fetchSiteSettings()` fires from GlobalProvider
    // and its resolution calls setSiteSettings() for the FIRST time this
    // session — at which point s.loaded is unconditionally false, no matter
    // whether setActiveTheme/setActiveLanguage had already restored a saved
    // choice from localStorage moments earlier in the same effect. So the
    // preserve-branch below was silently skipped on literally every refresh,
    // and the just-restored value was overwritten by the server default —
    // which is exactly the "theme/language resets after refresh" bug. It
    // only ever looked fixed for cases that never exercised the FIRST fetch
    // after a restore (e.g. the 30s poll firing again later in the same
    // session, once s.loaded already happened to be true from that first,
    // buggy call).
    //
    // Real fix: track the "has the user personally chosen this" signal on
    // theme/language themselves (`isOverride`), set atomically by the SAME
    // action that performs the choice/restore (setActiveTheme /
    // setActiveLanguage, below) — with no dependency on any other action
    // having already run. This is exactly currencySlice's isUserOverride /
    // setSelectedCurrency pattern (see that file), which does not have this
    // bug for the same reason.
    setSiteSettings: (s, a) => {
      const payload = a.payload || {};
      const merged = { ...s, ...payload, loaded: true };
      merged.theme = s.theme.isOverride
        ? { ...payload.theme, activeTheme: s.theme.activeTheme, isOverride: true }
        : { ...payload.theme, isOverride: false };
      merged.language = s.language.isOverride
        ? { ...payload.language, activeLanguage: s.language.activeLanguage, isOverride: true }
        : { ...payload.language, isOverride: false };
      return merged;
    },
    setActiveTheme: (s, a) => { s.theme.activeTheme = a.payload; s.theme.isOverride = true; },
    setActiveLanguage: (s, a) => { s.language.activeLanguage = a.payload; s.language.isOverride = true; },
  },
});

export const { setSiteSettings, setActiveTheme, setActiveLanguage } = siteSettingsSlice.actions;
export default siteSettingsSlice.reducer;
