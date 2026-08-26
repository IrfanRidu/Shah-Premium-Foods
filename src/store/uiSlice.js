import { createSlice } from "@reduxjs/toolkit";

// Session 5 — Cart/Wishlist slide-out drawers. Purely ephemeral UI state
// (which drawer, if any, is open right now) that many unrelated
// components need to trigger: the header's cart icon, a new header
// wishlist icon, the account dropdown's Wishlist entry, the mobile nav
// drawer's own entries. Redux (not the localStorage+CustomEvent pattern
// useCompare.js uses) is the right tool here — that pattern exists
// specifically for state that should survive/sync across browser tabs
// (a compare list), which a drawer explicitly should NOT do. Deliberately
// NOT added to localStorageMiddleware's KEYS_TO_PERSIST, so a drawer can
// never be "stuck open" after a refresh.
const uiSlice = createSlice({
  name: "ui",
  initialState: { activeDrawer: null }, // null | "cart" | "wishlist"
  reducers: {
    openCartDrawer: (s) => { s.activeDrawer = "cart"; },
    openWishlistDrawer: (s) => { s.activeDrawer = "wishlist"; },
    closeDrawer: (s) => { s.activeDrawer = null; },
  },
});

export const { openCartDrawer, openWishlistDrawer, closeDrawer } = uiSlice.actions;
export default uiSlice.reducer;
