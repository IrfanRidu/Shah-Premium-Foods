import mongoose from "mongoose";
// Side-effect import: registers every Mongoose model the moment this module
// is loaded (which happens before any request is handled — see
// apiHandler.js, which imports connectDb from this file at its own top
// level). Fixes "Schema hasn't been registered for model 'X'" on Vercel —
// see the comment block at the top of registerModels.js for the full
// root-cause explanation.
import "../server/models/registerModels.js";

// Security audit correction (originally added in "Batch 13," reverted
// here after it caused a severe production regression — see below):
// Mongoose-level hardening, set once at module load.
//
// sanitizeFilter was set to `true` here on the theory that it would add
// defense-in-depth on top of the custom `sanitizeInput()` already wired
// into every request in apiHandler.js. That theory was wrong in a way
// that broke the entire site: `sanitizeFilter: true` doesn't just strip
// dangerous operators from untrusted input — it treats ANY object-shaped
// filter VALUE as untrusted by default and wraps it in `{ $eq: ... }`
// unless the code explicitly marks that specific filter as safe via
// `mongoose.trusted({...})`. That requirement applies just as much to
// the application's OWN server-constructed queries as to anything a
// client could send — and this codebase legitimately builds filters with
// query operators constantly and correctly: analytics date-range filters
// (`{ createdAt: { $gte, $lte } }`), product lookups by an array of IDs
// during checkout (`{ _id: { $in: [...] } }`), and more. None of those
// call sites were wrapped in `mongoose.trusted()` (nor should ~50+ call
// sites across the codebase need to be, just to keep working), so every
// one of them broke: MongoDB tried to cast the whole `{ $gte, $lte }` or
// `{ $in: [...] }` object as a literal value against the field's real
// type (Date / ObjectId) and failed, taking down analytics, checkout
// product lookups, and the storefront's own product listings with it.
//
// The custom `sanitizeInput()` (security.js, wired into apiHandler.js)
// already correctly solves the actual threat model here — it strips
// `$`-prefixed keys from REQUEST data (query/body/params) before any
// controller ever sees it, which is exactly where untrusted input
// becomes a filter-injection risk in the first place. It doesn't have
// this false-positive problem because it never touches filters the
// server constructs internally — only what arrives from the client.
// That makes it the correct single layer for this concern, not one of
// two — so this is a straight revert, not a replacement with something
// else.
//
// strictQuery is unaffected by any of the above (it's about rejecting
// queries by undefined schema paths, unrelated to operator objects) and
// stays enabled.
mongoose.set("strictQuery", true);

let connectionPromise = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Root cause of "site is empty until I log in" reports: a single connection
// attempt with a 10s timeout and no retry. MongoDB Atlas's free (M0) tier
// pauses the cluster after a period of inactivity — the very first request
// after a pause can easily take longer than 10s to wake it back up, so that
// first attempt would time out and throw. Since every fetch in this app
// wraps its call in try/catch with an empty catch block (deliberately, so a
// slow network blip doesn't spam error toasts), that failure was completely
// silent on the frontend — categories/products/settings just never
// populated, with no visible error, indistinguishable from "still loading."
// It would then look "fixed" by logging in purely because enough time had
// passed for the cluster to finish waking up by then — not because
// anything about auth state was actually involved.
//
// Retrying the connection itself (rather than requiring every one of the
// ~15 callers across the app to add their own retry logic) fixes this at
// the one place it needs fixing.
const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 3_000;
const TIMEOUT_PER_ATTEMPT_MS = 10_000;

const connectDb = async () => {
  // Already connected — reuse the live connection
  if (mongoose.connection.readyState === 1) return;

  // Connection is in progress — wait for it instead of opening a second one
  if (connectionPromise) return connectionPromise;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set in environment variables.");

  connectionPromise = (async () => {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await mongoose.connect(uri, {
          serverSelectionTimeoutMS: TIMEOUT_PER_ATTEMPT_MS,
          // Connection pooling: bound how many sockets this process opens
          // to MongoDB. Without an explicit max, Mongoose's default (100)
          // is fine for most cases but wasn't a deliberate choice; without
          // an explicit min, every connection is opened lazily on first
          // use, adding latency to whichever request happens to be first.
          // minPoolSize keeps a small number warm so typical request
          // traffic doesn't pay that cost repeatedly.
          maxPoolSize: 20,
          minPoolSize: 2,
          // Retry strategy (operation-level, complementing the connection-
          // establishment retry loop this function already implements
          // around itself): let the MongoDB driver automatically retry a
          // write/read once if it fails due to a transient network error
          // or replica-set failover, rather than surfacing that as an
          // application-level error immediately. Both default to true on
          // modern MongoDB Node driver versions already; set explicitly so
          // that isn't left to an implicit default.
          retryWrites: true,
          retryReads: true,
        });
        console.log(`✓ MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}` +
          (attempt > 1 ? ` (attempt ${attempt}/${MAX_ATTEMPTS} — cluster likely woke up from a paused state)` : ""));
        return;
      } catch (err) {
        lastError = err;
        console.warn(`MongoDB connection attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err.message}`);
        if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
      }
    }
    throw lastError;
  })().finally(() => {
    connectionPromise = null;
  });

  return connectionPromise;
};

export default connectDb;
