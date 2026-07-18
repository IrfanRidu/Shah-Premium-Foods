/**
 * Lightweight persist middleware — persists selected slices to localStorage.
 * This avoids adding redux-persist as a dependency while solving the
 * "site settings empty on refresh" (Fix 41) and "theme resets on refresh" (Fix 28) bugs.
 */

const PERSIST_KEY = "spf_store_v1";

const KEYS_TO_PERSIST = ["siteSettings", "currency"];

export function loadPersistedState() {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function persistMiddleware(store) {
  return (next) => (action) => {
    const result = next(action);
    const state = store.getState();
    if (typeof window !== "undefined") {
      try {
        const toSave = {};
        KEYS_TO_PERSIST.forEach((k) => {
          if (state[k] !== undefined) toSave[k] = state[k];
        });
        localStorage.setItem(PERSIST_KEY, JSON.stringify(toSave));
      } catch {}
    }
    return result;
  };
}
