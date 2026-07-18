import mongoose from "mongoose";
// Side-effect import: registers every Mongoose model the moment this module
// is loaded (which happens before any request is handled — see
// apiHandler.js, which imports connectDb from this file at its own top
// level). Fixes "Schema hasn't been registered for model 'X'" on Vercel —
// see the comment block at the top of registerModels.js for the full
// root-cause explanation.
import "../server/models/registerModels.js";

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
        await mongoose.connect(uri, { serverSelectionTimeoutMS: TIMEOUT_PER_ATTEMPT_MS });
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
