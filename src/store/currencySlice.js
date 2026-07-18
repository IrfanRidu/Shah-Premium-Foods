import { createSlice } from "@reduxjs/toolkit";
const FALLBACK = { USD:1, BDT:122, EUR:0.92, INR:85.5, PKR:278, GBP:0.79 };

// Item 7 — base currency:
//   - `baseCurrency`   the site-wide default, set by the admin in Site
//                      Settings. Always what admin analytics/reporting
//                      pages display (see analytics tabs + admin-orders/
//                      inventory/hr-payroll/etc, which read this field
//                      specifically, not `selected`), regardless of any
//                      personal override below.
//   - `isUserOverride` true once a shopper has explicitly picked a currency
//                      from the header switcher (PreferenceSelector).
//   - `selected`       what the STOREFRONT actually displays (product
//                      prices, cart, checkout, search, campaigns...): the
//                      personal override while one is set, otherwise it
//                      tracks `baseCurrency` automatically.
// The whole slice is persisted (see localStorageMiddleware.js), so a
// returning shopper's override survives a refresh; GlobalProvider only
// restores `selected` from storage when `isUserOverride` was also true —
// otherwise `selected` is left to track the freshly-fetched base currency.
const currencySlice = createSlice({
  name: "currency",
  initialState: { selected: "BDT", baseCurrency: "BDT", isUserOverride: false, rates: FALLBACK, updatedAt: 0 },
  reducers: {
    setRates: (s, a) => { s.rates = a.payload?.rates || FALLBACK; s.updatedAt = a.payload?.updatedAt || 0; },

    // Shopper explicitly picks a currency — personal, this browser only.
    setSelectedCurrency: (s, a) => {
      s.selected = a.payload;
      s.isUserOverride = true;
    },

    // Site settings loaded/changed (boot fetch, admin save, or the
    // real-time settings poll). Only moves what's displayed if the current
    // user hasn't personally overridden it — an admin changing this always
    // updates their own `baseCurrency` reference either way, which is what
    // analytics/admin reporting pages read directly.
    setBaseCurrency: (s, a) => {
      const next = a.payload || "BDT";
      s.baseCurrency = next;
      if (!s.isUserOverride) s.selected = next;
    },

    // Lets a shopper explicitly go back to following the site default.
    clearUserCurrencyOverride: (s) => {
      s.isUserOverride = false;
      s.selected = s.baseCurrency;
    },
  },
});
export const { setRates, setSelectedCurrency, setBaseCurrency, clearUserCurrencyOverride } = currencySlice.actions;
export default currencySlice.reducer;
