"use client";
import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { usePathname } from "next/navigation";
import { v4 as uuid } from "uuid";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { setUserDetails, logout } from "@/store/userSlice";
import { setCartItem, resetCart } from "@/store/cartSlice";
import { setAddressList } from "@/store/addressSlice";
import { setOrder } from "@/store/orderSlice";
import { setAllCategory, setAllSubCategory, setLoadingCategory } from "@/store/productSlice";
import { setSiteSettings } from "@/store/siteSettingsSlice";
import { setCampaigns } from "@/store/campaignSlice";
import { setActiveCoupons } from "@/store/couponSlice";
import { setRates, setSelectedCurrency, setBaseCurrency } from "@/store/currencySlice";
import { setSessionId } from "@/store/activitySlice";
import { setPermissions, clearPermissions } from "@/store/permissionsSlice";
import { setActiveTheme, setActiveLanguage } from "@/store/siteSettingsSlice";
import { loadPersistedState, markHydrated } from "@/store/localStorageMiddleware";

const GlobalContext = createContext({
  fetchUser: () => {},
  fetchCartItems: () => {},
  fetchAddress: () => {},
  fetchOrders: () => {},
  fetchCategories: () => {},
  fetchSiteSettings: () => {},
  fetchCampaigns: () => {},
  fetchActiveCoupons: () => {},
  fetchExchangeRates: () => {},
  refreshAll: () => {},
  logActivity: () => {},
});

export const useGlobalContext = () => useContext(GlobalContext);

export default function GlobalProvider({ children }) {
  const dispatch  = useDispatch();
  const userId    = useSelector((s) => s.user._id);
  const theme     = useSelector((s) => s.siteSettings.theme);
  const lang      = useSelector((s) => s.siteSettings.language);
  const sessionId = useSelector((s) => s.activity.sessionId);
  const selectedCurrency = useSelector((s) => s.currency.selected);
  const ratesUpdatedAt   = useSelector((s) => s.currency.updatedAt);
  const initDone = useRef(false);

  // ─── Data fetchers ───────────────────────────────────────────────
  const fetchUser = useCallback(async () => {
    try {
      const r = await Axios({ ...api.userDetails });
      if (r.data?.success) {
        dispatch(setUserDetails(r.data.data));
        // Fetch role permissions
        const perm = await Axios({ ...api.getMyPermissions });
        if (perm.data?.success) dispatch(setPermissions(perm.data.data));
      }
    } catch {
      dispatch(logout());
      dispatch(clearPermissions());
    }
  }, [dispatch]);

  const fetchCartItems = useCallback(async () => {
    try {
      const r = await Axios({ ...api.getCartItems });
      if (r.data?.success) dispatch(setCartItem(r.data.data));
    } catch {}
  }, [dispatch]);

  const fetchAddress = useCallback(async () => {
    try {
      const r = await Axios({ ...api.getAddress });
      if (r.data?.success) dispatch(setAddressList(r.data.data));
    } catch {}
  }, [dispatch]);

  const fetchOrders = useCallback(async () => {
    try {
      const r = await Axios({ ...api.getOrderList });
      if (r.data?.success) dispatch(setOrder(r.data.data));
    } catch {}
  }, [dispatch]);

  // Fix: retry helper for the fetches that make the storefront look
  // "empty" if they fail — complements connectDb()'s own retry logic
  // (see mongodb.js) as a second safety net. Most cold-start delays are
  // now absorbed server-side, but this covers the rest (a slow client
  // network, a request that timed out client-side, etc.) without
  // requiring the user to manually refresh or log in for things to
  // "start working."
  const withRetry = useCallback(async (fn, attempts = 3, delayMs = 4000) => {
    for (let i = 0; i < attempts; i++) {
      const ok = await fn();
      if (ok) return;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    dispatch(setLoadingCategory(true));
    await withRetry(async () => {
      try {
        const [catR, subR] = await Promise.all([
          Axios({ ...api.getCategory }),
          Axios({ ...api.getSubCategory }),
        ]);
        if (catR.data?.success) dispatch(setAllCategory(catR.data.data));
        if (subR.data?.success) dispatch(setAllSubCategory(subR.data.data));
        return !!(catR.data?.success && subR.data?.success);
      } catch {
        return false;
      }
    });
    dispatch(setLoadingCategory(false));
  }, [dispatch, withRetry]);

  const fetchSiteSettings = useCallback(async () => {
    await withRetry(async () => {
      try {
        const r = await Axios({ ...api.getSiteSettings });
        if (r.data?.success) {
          dispatch(setSiteSettings(r.data.data));
          // Item 7: keep the storefront default (and, for anyone who hasn't
          // personally overridden it, what they actually see) in sync with
          // whatever the admin currently has set as the site's base currency.
          dispatch(setBaseCurrency(r.data.data.baseCurrency || "BDT"));
        }
        return !!r.data?.success;
      } catch {
        return false;
      }
    });
  }, [dispatch, withRetry]);

  const fetchCampaigns = useCallback(async () => {
    await withRetry(async () => {
      try {
        const r = await Axios({ ...api.getActiveCampaigns });
        if (r.data?.success) dispatch(setCampaigns(r.data.data));
        return !!r.data?.success;
      } catch {
        return false;
      }
    });
  }, [dispatch, withRetry]);

  // Active (public) coupons — was previously fetched only from the checkout
  // page itself, which meant the CouponInput widget only worked there. Now
  // fetched once at boot like categories/campaigns/settings, so CouponInput
  // has data wherever it's rendered (currently the cart page — see item 2:
  // the coupon box was moved off checkout).
  const fetchActiveCoupons = useCallback(async () => {
    await withRetry(async () => {
      try {
        const r = await Axios({ ...api.getActiveCoupons });
        if (r.data?.success) dispatch(setActiveCoupons(r.data.data));
        return !!r.data?.success;
      } catch {
        return false;
      }
    });
  }, [dispatch, withRetry]);

  const fetchExchangeRates = useCallback(async () => {
    // Only refresh if stale (> 55 min)
    const STALE_MS = 55 * 60 * 1000;
    if (ratesUpdatedAt && Date.now() - ratesUpdatedAt < STALE_MS) return;
    try {
      const r = await Axios({ ...api.getExchangeRates });
      if (r.data?.success) dispatch(setRates(r.data.data));
    } catch {}
  }, [dispatch, ratesUpdatedAt]);

  const refreshAll = useCallback(() =>
    Promise.all([fetchUser(), fetchCartItems(), fetchAddress(), fetchOrders()]),
    [fetchUser, fetchCartItems, fetchAddress, fetchOrders]
  );

  // Fire-and-forget activity log
  const logActivity = useCallback(async (actionType, payload = {}) => {
    try {
      await Axios({
        ...api.logActivity,
        data: { actionType, sessionId, userId: userId || null, ...payload },
      });
    } catch {}
  }, [sessionId, userId]);

  // ─── Boot: session ID + restore personal preferences + initial fetches ──
  // Fix (hydration crash, historical): this restoration used to partly
  // happen via `preloadedState` at store-creation time (unsafe — see
  // store.js) and partly via a redundant separate
  // `localStorage.getItem("currency")` read. Both were consolidated into a
  // useEffect instead — safe, because a useEffect by definition fires
  // strictly after React has already reconciled hydration against the
  // server-rendered HTML, so updating Redux here is a normal state update,
  // never a hydration mismatch, regardless of what any component
  // conditionally renders based on it.
  //
  // Fix (currency silently reverting to the site's base currency on a page
  // refresh): restoring the saved currency override and calling
  // fetchSiteSettings() (which dispatches setBaseCurrency — see
  // currencySlice.js's `if (!s.isUserOverride)` guard, which is what's
  // supposed to make setBaseCurrency leave a personal override alone) used
  // to live in two SEPARATE useEffects, in the right declaration order.
  // React does guarantee same-commit effects run in declaration order, and
  // the restore effect had no `await` in it, so on paper it should always
  // finish before the fetch's async dispatch resolves — but a page refresh
  // goes through a full server round-trip and hydration first, which is a
  // lot more moving parts than that guarantee alone accounts for, and this
  // project has already hit one hydration-timing bug in this exact area
  // (see the fix note just above). Rather than keep relying on cross-effect
  // timing for this, restoration now happens as the very first lines of
  // THIS SAME effect, before fetchSiteSettings() is even called. There's no
  // longer any ordering question to reason about — it's one linear sequence
  // of synchronous statements in a single function, not two independently
  // scheduled effects, so the override is guaranteed to already be in the
  // Redux store before anything that could possibly overwrite it runs.
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    if (typeof window !== "undefined") {
      // ROOT CAUSE of "currency reverts to site base currency on refresh":
      // this used to call dispatch(setSessionId(sid)) *before* reading
      // localStorage via loadPersistedState(). setSessionId is an ordinary
      // action — not filtered by persistMiddleware's `@@redux/` prefix
      // check — so it passed straight through the middleware, which
      // immediately re-saved state.currency/state.siteSettings to
      // localStorage using the store's still-fresh default values (BDT,
      // isUserOverride:false), since store.js intentionally no longer
      // preloads from localStorage (see store.js's own fix note). That
      // silently clobbered a previously-saved currency override with the
      // defaults a few lines *before* loadPersistedState() ever read it
      // back — so the restore below was always reading data that had
      // already been wiped moments earlier in the very same effect, and
      // fetchSiteSettings()'s setBaseCurrency() dispatch (whose own guard
      // is otherwise correct) then "won" by default. Fixed by reading and
      // restoring persisted state FIRST, before any other dispatch of any
      // kind gets a chance to trigger a write-back through
      // persistMiddleware.
      const persisted = loadPersistedState();
      const savedTheme      = persisted?.siteSettings?.theme?.activeTheme;
      const savedLanguage   = persisted?.siteSettings?.language?.activeLanguage;
      const savedCurrency   = persisted?.currency?.selected;
      const savedIsOverride = persisted?.currency?.isUserOverride;
      if (savedTheme)    dispatch(setActiveTheme(savedTheme));
      if (savedLanguage) dispatch(setActiveLanguage(savedLanguage));
      // Item 7: only restore this as a personal override if it really was
      // one — otherwise leave `selected` alone and let fetchSiteSettings()
      // just below set it to whatever the admin's current base currency is.
      if (savedIsOverride && savedCurrency) dispatch(setSelectedCurrency(savedCurrency));

      // Open the persistMiddleware write-gate — restoration is complete,
      // so it's now safe for any action from any component (in any order)
      // to trigger a save without risk of clobbering data that hasn't been
      // read back yet. See the comment above markHydrated() for the full
      // story.
      markHydrated();

      let sid = sessionStorage.getItem("spf_session");
      if (!sid) {
        sid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        sessionStorage.setItem("spf_session", sid);
      }
      dispatch(setSessionId(sid));
    }

    fetchSiteSettings();
    fetchCategories();
    fetchCampaigns();
    fetchActiveCoupons();
    fetchExchangeRates();

    if (typeof window !== "undefined" && localStorage.getItem("accessToken")) {
      fetchUser().then(() => {
        fetchCartItems();
        fetchAddress();
        fetchOrders();
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Real-time settings sync ────────────────────────────────────
  // Item 7: "the currency will change dynamically in real time for both
  // admin and users". This app has no websocket/push infrastructure, so —
  // mirroring the same lightweight-poll approach NotificationBell.jsx
  // already uses for live notification counts — site settings (which
  // carries baseCurrency) are re-fetched periodically. Any already-open
  // tab, whether a shopper mid-browse or an admin sitting on the Analytics
  // page, picks up a saved base-currency change within one interval with
  // no manual refresh needed.
  useEffect(() => {
    const id = setInterval(() => { fetchSiteSettings(); }, 30_000);
    return () => clearInterval(id);
  }, [fetchSiteSettings]);

  // ─── Theme / language sync ──────────────────────────────────────
  useEffect(() => {
    if (theme?.activeTheme) document.documentElement.setAttribute("data-theme", theme.activeTheme);
  }, [theme?.activeTheme]);

  useEffect(() => {
    if (lang?.activeLanguage) document.documentElement.setAttribute("lang", lang.activeLanguage);
  }, [lang?.activeLanguage]);

  // ─── Reset cart when user logs out ─────────────────────────────
  useEffect(() => {
    if (!userId) dispatch(resetCart());
  }, [userId, dispatch]);

  // Fix 17 / 38: log a lightweight page_visit for every route change, so the
  // Marketing & Website Performance analytics tab has real homepage/category/
  // search-page view counts to report instead of only product-view and
  // add-to-cart events. Fires after mount only (post-hydration), same
  // safety reasoning as the theme/language restore above.
  const pathname = usePathname();
  useEffect(() => {
    if (!sessionId || !pathname) return;
    Axios({
      ...api.logActivity,
      data: { actionType: "page_visit", sessionId, userId: userId || null, metadata: { path: pathname } },
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, sessionId]);

  return (
    <GlobalContext.Provider value={{
      fetchUser, fetchCartItems, fetchAddress, fetchOrders,
      fetchCategories, fetchSiteSettings, fetchCampaigns, fetchActiveCoupons,
      fetchExchangeRates, refreshAll, logActivity,
    }}>
      {children}
    </GlobalContext.Provider>
  );
}
