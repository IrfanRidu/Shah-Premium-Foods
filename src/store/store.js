import { configureStore } from "@reduxjs/toolkit";
import userReducer from "./userSlice";
import cartReducer from "./cartSlice";
import addressReducer from "./addressSlice";
import orderReducer from "./orderSlice";
import productReducer from "./productSlice";
import siteSettingsReducer from "./siteSettingsSlice";
import campaignReducer from "./campaignSlice";
import couponReducer from "./couponSlice";
import currencyReducer from "./currencySlice";
import activityReducer from "./activitySlice";
import permissionsReducer from "./permissionsSlice";
import { persistMiddleware } from "./localStorageMiddleware";

// Fix (hydration crash, "Expected server HTML to contain a matching <img> in
// <a>"): this store used to call loadPersistedState() here, at module-eval
// time, and pass the result as `preloadedState`. That runs on the client too
// — and on the client, `window`/`localStorage` are available, so the
// client's very first render (the one React uses to reconcile against the
// server-sent HTML during hydration) started from *persisted* siteSettings
// (e.g. a saved custom logo). The server can never read localStorage, so it
// always rendered from plain defaults. Any JSX that structurally branches on
// a persisted field — like the header's `<Link>{logo ? <img/> : <span/>}`
// — mismatched between server and client on the very first paint, which is
// exactly the class of bug that produces this error.
//
// Fix: the store always starts from the reducers' own defaults on *both*
// server and client, so the first render is guaranteed identical. Real data
// (site settings from the DB, saved theme/language/currency) is restored
// afterwards via a `useEffect` in GlobalProvider — strictly post-hydration,
// so it's a normal state update, never a hydration mismatch. See
// GlobalProvider.jsx's boot effect.
export const store = configureStore({
  reducer: {
    user:         userReducer,
    cartItem:     cartReducer,
    address:      addressReducer,
    order:        orderReducer,
    product:      productReducer,
    siteSettings: siteSettingsReducer,
    campaign:     campaignReducer,
    coupon:       couponReducer,
    currency:     currencyReducer,
    activity:     activityReducer,
    permissions:  permissionsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false }).concat(persistMiddleware),
});

export default store;
