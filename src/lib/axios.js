import axios from "axios";

// Frontend and API now share one Next.js server/port, so the default is
// same-origin (empty string = relative paths). Only set NEXT_PUBLIC_API_URL
// if the API is genuinely hosted on a different domain.
export const baseURL = process.env.NEXT_PUBLIC_API_URL || "";

const Axios = axios.create({ baseURL, withCredentials: true });

Axios.interceptors.request.use((config) => {
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

Axios.interceptors.response.use(
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
          return Axios(orig);
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
          const newToken = data?.data?.accessToken;
          if (newToken) {
            localStorage.setItem("accessToken", newToken);
            orig.headers.Authorization = `Bearer ${newToken}`;
            return Axios(orig);
          }
        } catch {}
      }
    }
    return Promise.reject(err);
  }
);

export default Axios;
