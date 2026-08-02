// Section 15 (Next.js Best Practices) — "Server-only modules": this
// module has no Node-only APIs of its own (it's just a Map + timers), so
// it wouldn't technically fail to bundle client-side — but a client-side
// "cache" reusing this exact name/shape while actually holding SERVER
// data in a Node process's memory would be meaningless if it ever
// happened. Belt-and-suspenders: an explicit guarantee, not just relying
// on nobody ever importing it by mistake.
import "server-only";

// ── Section 9 (Performance) — "Route cache / API cache / Redis-ready
// architecture" ──────────────────────────────────────────────────────────
//
// What this is, and what it deliberately is NOT:
//
// apiHandler.js's shared response builder already defaults every API
// response to `Cache-Control: private, no-store` (see that file's own
// comment) — a deliberate choice, because most responses here are
// authenticated/personal, and a previous pass explicitly decided NOT to add
// selective public HTTP caching without being able to verify it live in
// this sandbox. That reasoning still holds, so this file does not touch
// HTTP Cache-Control semantics at all (and structurally can't today anyway
// — the mock response object in apiHandler.js has no res.set()/header()
// method for a controller to use).
//
// Instead, this implements caching one layer down, at the DATA layer: a
// small in-process TTL cache that a controller can wrap around an
// expensive/hot read. This is safe to verify statically (it's plain
// synchronous JS, no network/HTTP semantics involved), bounded (a TTL means
// staleness is capped, never unbounded), and — the "Redis-ready" part —
// deliberately shaped like a Redis client's API (get/set/del, async
// signatures even though the in-memory implementation doesn't need to
// await anything) so that swapping the Map-based store below for a real
// `ioredis`/`redis` client later is a change to THIS FILE ONLY. No call
// site anywhere else in the app would need to change.
//
// Why in-memory rather than actually wiring up Redis right now: this sandbox
// has no network access to install a Redis client package or reach a Redis
// server, and this app's current deployment target (per VERCEL_DEPLOYMENT.md)
// is Vercel serverless functions, where an in-memory cache is already
// per-instance-useful (warm invocations reuse it, exactly like
// mongodb.js's connection reuse) even before Redis ever enters the picture.
// Shipping a fake "Redis-ready" label with no real interface would be
// dishonest; shipping an actually Redis-shaped interface backed by an
// in-memory store today is the honest version of "ready."
//
// What gets cached (deliberately narrow, matching the previous author's own
// caution): only hot, PUBLIC, low-personalization reads that change rarely
// — categories, sub-categories, site settings, active campaigns. Never
// anything user-specific (cart, orders, profile) or anything that already
// has its own freshness-sensitive logic (product stock/price, search).
// Every cached controller also gets an explicit `invalidate()` call on its
// own mutation endpoints, so admin edits are reflected immediately rather
// than waiting out the TTL — the TTL is a safety net for anything missed,
// not the primary invalidation mechanism.

const store = new Map(); // key -> { value, expiresAt }

// Section 9 (Performance): about to be used for per-product caching
// (product.controller.js / the new product page — much higher-cardinality
// keys than the category/settings/campaign caches above, which each have
// only ONE key total). TTL alone bounds how STALE an entry can be, but
// does nothing to bound how MANY entries pile up — a long-running process
// that serves a very large catalog over time could otherwise grow this
// Map without limit, since nothing proactively sweeps entries that are
// simply never read again (they'd only ever get cleaned up lazily, on a
// future read that happens to hit that exact key). MAX_ENTRIES + a FIFO
// evict-oldest below is a deliberately simple safety net — not a real LRU,
// just enough to put a hard ceiling on memory regardless of catalog size
// or deployment length. A real Redis deployment would have its own
// maxmemory + eviction policy doing this same job; this keeps the
// in-memory stand-in honest about that, not just TTL-only.
const MAX_ENTRIES = 500;

/**
 * Get a cached value, or null if missing/expired.
 * @param {string} key
 */
export async function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt !== 0 && Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * Store a value with a TTL (milliseconds). ttlMs = 0 means "no expiry"
 * (rarely appropriate — prefer an explicit TTL plus invalidate() on write).
 * @param {string} key
 * @param {*} value
 * @param {number} ttlMs
 */
export async function cacheSet(key, value, ttlMs = 60_000) {
  if (!store.has(key) && store.size >= MAX_ENTRIES) {
    // Map iteration order is guaranteed insertion order in JS — this evicts
    // whichever entry was WRITTEN first, a cheap FIFO approximation of LRU.
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) store.delete(oldestKey);
  }
  store.set(key, {
    value,
    expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0,
  });
}

/** Delete one key. */
export async function cacheDel(key) {
  store.delete(key);
}

/**
 * Delete every key starting with `prefix`. Used after a mutation to bust a
 * whole family of cached reads at once (e.g. "category:" after any
 * category add/update/delete) without needing to know every exact key.
 */
export async function cacheInvalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/**
 * The main entry point controllers actually use: return the cached value
 * for `key` if present and fresh, otherwise call `fn()`, cache its result,
 * and return it. `fn` should be an async function with no side effects
 * beyond reading data (never wrap a write in this).
 *
 * @param {string} key
 * @param {() => Promise<*>} fn
 * @param {number} ttlMs
 */
export async function cacheGetOrSet(key, fn, ttlMs = 60_000) {
  const cached = await cacheGet(key);
  if (cached !== null) return cached;
  const fresh = await fn();
  // Don't cache null/undefined results — avoids caching a transient
  // failure-shaped value (e.g. a query that returned nothing because the DB
  // was mid-reconnect) as if it were a confirmed empty state.
  if (fresh !== null && fresh !== undefined) {
    await cacheSet(key, fresh, ttlMs);
  }
  return fresh;
}

// Common TTLs, named so call sites read as intent rather than magic numbers.
export const CACHE_TTL = {
  SHORT: 30_000, // 30s — things that can change often (active campaigns)
  MEDIUM: 60_000, // 60s — the general default (categories, sub-categories)
  LONG: 5 * 60_000, // 5min — settings, rarely-changing reference data
};

// Grouped export for call sites that prefer `import cache from "@/lib/cache"`.
const cache = {
  get: cacheGet,
  set: cacheSet,
  del: cacheDel,
  invalidate: cacheInvalidate,
  getOrSet: cacheGetOrSet,
  TTL: CACHE_TTL,
};

export default cache;
