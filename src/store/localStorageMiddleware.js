/**
 * Lightweight persist middleware — persists selected slices to localStorage.
 * This avoids adding redux-persist as a dependency while solving the
 * "site settings empty on refresh" (Fix 41) and "theme resets on refresh" (Fix 28) bugs.
 */

const PERSIST_KEY = "spf_store_v1";

const KEYS_TO_PERSIST = ["siteSettings", "currency"];

// Hydration gate — see the long comment on `hydrated`/`markHydrated` below
// for why this exists. Read once, synchronously, at module-evaluation time
// (an import always runs before any component effect can fire), and never
// re-read from localStorage again after that — every later "give me the
// saved state" call (GlobalProvider's restore effect) reads this cached
// snapshot instead of hitting localStorage a second time. That means it's
// structurally impossible for anything to read back data that some other
// action already clobbered, no matter what order effects fire in.
let cachedSnapshot = null;
let hydrated = false;

function readRaw() {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.warn("[persist] Failed to read persisted state, falling back to defaults:", err);
    return {};
  }
}

if (typeof window !== "undefined" && cachedSnapshot === null) {
  cachedSnapshot = readRaw();
}

// Fix (currency/theme silently reverting on refresh — root cause,
// generalized beyond the one setSessionId instance that first surfaced
// it): persistMiddleware used to write to localStorage on every single
// dispatched action, unconditionally, from the very first action the app
// ever fires. GlobalProvider wraps `{children}` in Providers.jsx, and
// React fires child effects before parent effects on mount — so *any*
// descendant component with its own mount-time dispatch (a cart-badge
// fetch, an activity log call, anything) could run before GlobalProvider's
// own boot effect ever got a chance to restore the saved currency/theme
// from localStorage. Whichever action fired first would re-save the
// store's still-default state, clobbering the real saved data before it
// was ever read back — a bug that depended on component mount order, so
// it could reappear on any page that happened to add a new mount-time
// dispatch, not just the one instance that was first caught and fixed.
// Fixed structurally: this middleware now simply refuses to write
// anything until `markHydrated()` has been called, which GlobalProvider
// does as the very last step of its restore sequence, immediately after
// dispatching the restored currency/theme/language — so no action fired
// by any component, in any order, can ever write over data that hasn't
// been read back yet.
export function markHydrated() {
  hydrated = true;
}

export function loadPersistedState() {
  if (typeof window === "undefined") return {};
  if (cachedSnapshot !== null) return cachedSnapshot;
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    // Was a bare `catch {}` — any failure here (corrupted JSON, storage
    // blocked by browser privacy settings, etc.) was completely invisible,
    // silently falling back to defaults with no trace of why. Surfacing it
    // costs nothing (still falls back the same way) and means a real
    // failure is now visible in the console instead of just looking like
    // "the saved preference vanished" with no clue as to why.
    console.warn("[persist] Failed to read persisted state, falling back to defaults:", err);
    return {};
  }
}

export function persistMiddleware(store) {
  return (next) => (action) => {
    const result = next(action);

    // THE ACTUAL BUG (found via real console output from a live refresh,
    // then reproduced with the real source files in a standalone test):
    // Redux itself — via configureStore(), independent of anything this
    // app's own code does — dispatches an internal `@@redux/INIT...`
    // action through the FULL middleware chain the instant the store is
    // created. That happens at module-evaluation time on every fresh page
    // load, before any component has mounted — long before
    // GlobalProvider's restore-from-localStorage effect ever gets a chance
    // to run. This middleware used to save on every action with no
    // filtering at all, so that internal init action's pass-through save
    // wrote the store's bare default state (no currency override, no
    // restored theme/language) straight to localStorage — silently
    // clobbering whatever a previous session had legitimately saved,
    // before the restore effect ever had a chance to read the original
    // data. This is why a saved currency choice reliably survived right up
    // until the moment of refresh and then reverted: nothing was wrong
    // with the write, or with reading it back — the correctly-saved data
    // was being overwritten by this store's own internal startup action,
    // milliseconds before anything tried to restore it. No amount of
    // reordering React effects could have fixed this, since the damage
    // happens before React even mounts.
    //
    // Redux's `@@redux/` action-type prefix is a long-standing, stable
    // convention (used for both the INIT action and combineReducers'
    // internal PROBE_UNKNOWN_ACTION sanity check) — skipping anything with
    // that prefix reliably filters out Redux's own internal housekeeping
    // without needing to match an exact, randomized suffix.
    if (typeof action?.type === "string" && action.type.startsWith("@@redux/")) {
      return result;
    }

    // See the big comment above markHydrated(): refuse to write anything
    // until GlobalProvider has finished restoring the saved state, so no
    // early action from any component can clobber it first.
    if (!hydrated) {
      return result;
    }

    const state = store.getState();
    if (typeof window !== "undefined") {
      try {
        const toSave = {};
        KEYS_TO_PERSIST.forEach((k) => {
          if (state[k] !== undefined) toSave[k] = state[k];
        });
        localStorage.setItem(PERSIST_KEY, JSON.stringify(toSave));
      } catch (err) {
        // Same reasoning as above — a write failure (private/incognito
        // mode, a full storage quota, an extension blocking storage, or a
        // genuinely non-serializable value having snuck into siteSettings/
        // currency state) used to fail completely silently. If a saved
        // currency/theme/language choice ever appears to not persist
        // again, check the browser console first — this now says exactly
        // why, instead of leaving no trace at all.
        console.warn("[persist] Failed to save state to localStorage:", err);
      }
    }
    return result;
  };
}
