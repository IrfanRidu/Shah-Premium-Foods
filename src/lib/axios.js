import axios from "axios";

// Frontend and API now share one Next.js server/port, so the default is
// same-origin (empty string = relative paths). Only set NEXT_PUBLIC_API_URL
// if the API is genuinely hosted on a different domain.
export const baseURL = process.env.NEXT_PUBLIC_API_URL || "";

const axiosInstance = axios.create({ baseURL, withCredentials: true });

axiosInstance.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Fix: root cause of "the site is empty until I log in" reports. It was
// never actually about auth — every GET request in this app is wrapped in
// try/catch with an empty catch block (deliberately, so a transient blip
// doesn't spam error toasts on every page), so ANY failed request —
// a MongoDB Atlas free-tier cluster waking up from being paused, or (in
// dev) Next.js lazily compiling a route the very first time it's hit —
// was completely silent. Every component just fell back to its own
// hardcoded default/empty text, which looks identical to "there's no data"
// even though the real problem was "that one request needs a few more
// seconds." connectDb() (see mongodb.js) now retries the DB connection
// itself, and this covers everything else in the chain: retry safe (GET
// only — never POST/PUT/DELETE, which could double-charge a card or
// duplicate an order) requests a few times with backoff before finally
// giving up, transparently, for every page in the app at once rather than
// requiring every individual fetch call site to be patched separately.
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Demo Admin (see src/lib/apiHandler.js for the server-side half of this):
// every mutating request from a Demo Admin comes back as a normal 2xx
// success with one extra field, `isDemoAction: true`, tacked onto the
// usual `{success,error,message,data}` body. The page that made the call
// keeps doing exactly what it always does with a normal success (toast,
// redirect, optimistic update) — this interceptor's only job is to also
// broadcast a DOM CustomEvent so ONE listener component
// (components/DemoModeNotice.jsx, mounted once near the root layout) can
// show the dedicated "Demo Mode" popup, without every individual page
// needing to know Demo Admin exists at all.
if (typeof window !== "undefined") {
  axiosInstance.interceptors.response.use((res) => {
    if (res?.data?.isDemoAction) {
      window.dispatchEvent(new CustomEvent("demo-admin-action", {
        detail: { message: res.data.message, url: res.config?.url },
      }));
    }
    return res;
  });
}

axiosInstance.interceptors.response.use(
  (res) => res,
  async (err) => {
    const orig = err.config;

    if (orig?.method?.toLowerCase() === "get") {
      const isNetworkError = !err.response; // request never reached the server at all
      const isRetryableStatus = err.response && RETRYABLE_STATUS.has(err.response.status);
      if (isNetworkError || isRetryableStatus) {
        orig._retryCount = orig._retryCount || 0;
        if (orig._retryCount < MAX_RETRIES) {
          orig._retryCount += 1;
          await sleep(RETRY_DELAY_MS * orig._retryCount);
          return axiosInstance(orig);
        }
      }
    }

    if (err.response?.status === 401 && !orig._authRetry && typeof window !== "undefined") {
      orig._authRetry = true;
      const refresh = localStorage.getItem("refreshToken");
      if (refresh) {
        try {
          const { data } = await axios.post(`${baseURL}/api/user/refresh-token`, {}, {
            headers: { Authorization: `Bearer ${refresh}` },
          });
          const newAccessToken  = data?.data?.accessToken;
          const newRefreshToken = data?.data?.refreshToken;
          if (newAccessToken) {
            localStorage.setItem("accessToken", newAccessToken);
            // Security audit: refresh tokens now ROTATE on every use (see
            // refreshTokenController) — the token just sent is invalid the
            // instant this response comes back, whether or not it was
            // still within its normal expiry. The response always
            // includes the new one now; without saving it here, the VERY
            // NEXT refresh attempt would replay the already-used old
            // token from localStorage, which the backend would correctly
            // recognize as reuse of an already-rotated token and respond
            // to by revoking every session on the account — i.e. this one
            // missing line would turn "seamless silent refresh" into
            // "randomly logged out everywhere," so this isn't optional.
            if (newRefreshToken) localStorage.setItem("refreshToken", newRefreshToken);
            orig.headers.Authorization = `Bearer ${newAccessToken}`;
            return axiosInstance(orig);
          }
        } catch {}
      }
    }
    return Promise.reject(err);
  }
);

// ── Section 9 (Performance) — request de-duplication ───────────────────────
//
// This app's read endpoints aren't uniformly HTTP GET — several
// conceptually read-only lookups (product listings, product details,
// category-filtered listings, search) are sent as POST-with-body (see
// lib/api.js's `method` field for each), so a naive "dedupe every GET" rule
// would miss most of the actual duplicate-request risk, and a naive
// "dedupe every POST" rule would be actively dangerous — this codebase also
// sends real mutations over POST (addToCart, checkoutOrder, createCampaign…)
// and, unconventionally, sends `logout` over GET. HTTP verb alone doesn't
// tell you what's safe to dedupe here.
//
// So this is an explicit allowlist of endpoint paths that are genuinely
// side-effect-free reads — not a blanket rule. When two identical requests
// to one of these paths (same method + URL + params/body) are in flight at
// the same moment — e.g. GlobalProvider fetching categories on boot at the
// same instant a page component also asks for them — the second call
// reuses the first call's still-pending promise instead of firing a
// duplicate network request. The instant the request settles (success or
// failure) the entry is removed, so the very next call always goes to the
// network fresh. This is concurrent in-flight de-duplication, a different
// (and safe to combine with) concern from lib/cache.js's server-side,
// time-based caching.
const DEDUPABLE_PATHS = new Set([
  "/api/product/get",
  "/api/product/get-product-by-category",
  "/api/product/get-product-by-category-and-subcategory",
  "/api/product/get-product-details",
  "/api/product/search",
  "/api/category/get",
  "/api/subcategory/get",
  "/api/settings/get",
  "/api/settings/faq",
  "/api/campaigns/active",
  "/api/coupons/active",
  "/api/currency/rates",
  "/api/activity/suggestions",
]);

const inFlightRequests = new Map();

// Builds a stable key from method + url + params/body. Returns null for
// anything that can't be safely stringified (e.g. FormData) — those simply
// never dedupe, which is always the safe fallback. In practice this never
// hits a FormData body since uploads aren't in DEDUPABLE_PATHS at all.
function buildDedupKey(config) {
  const method = (config.method || "get").toLowerCase();
  const url = config.url || "";
  try {
    const paramsPart = config.params !== undefined ? `|p:${JSON.stringify(config.params)}` : "";
    const dataPart = config.data !== undefined ? `|d:${JSON.stringify(config.data)}` : "";
    return `${method}:${url}${paramsPart}${dataPart}`;
  } catch {
    return null;
  }
}

// The exported wrapper. Every PRE-EXISTING call site does
// `Axios({ ...api.x })` — a plain function call with a config object —
// and nothing outside this file called convenience methods like
// `Axios.get(...)` (confirmed by grep before this change existed).
//
// Call Center CRM module (Session 2) addition: `.get/.post/.put/.delete/
// .patch` convenience methods, in the standard axios shape
// (`Axios.get(url, config)`, `Axios.post(url, data, config)`), added as
// plain properties on this same function — a JS function is also an
// object, so this doesn't require wrapping or replacing anything. Every
// one of these routes through the exact same `Axios(config)` call below,
// so the interceptors above (auth refresh, retry-on-502/503/504, Demo
// Admin detection) and the request-dedup logic apply identically
// whether a call site uses the config-object form or these methods —
// genuinely additive, zero change to any pre-existing call site's
// behavior.
function Axios(config = {}) {
  const url = config.url || "";
  if (!DEDUPABLE_PATHS.has(url)) {
    return axiosInstance(config);
  }
  const key = buildDedupKey(config);
  if (key === null) return axiosInstance(config);

  const existing = inFlightRequests.get(key);
  if (existing) return existing;

  const promise = axiosInstance(config).finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, promise);
  return promise;
}

Axios.get    = (url, config = {}) => Axios({ ...config, url, method: "GET" });
Axios.delete = (url, config = {}) => Axios({ ...config, url, method: "DELETE" });
Axios.post   = (url, data, config = {}) => Axios({ ...config, url, data, method: "POST" });
Axios.put    = (url, data, config = {}) => Axios({ ...config, url, data, method: "PUT" });
Axios.patch  = (url, data, config = {}) => Axios({ ...config, url, data, method: "PATCH" });

export default Axios;
