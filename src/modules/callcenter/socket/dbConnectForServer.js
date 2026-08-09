import mongoose from "mongoose";
import "../../../server/models/registerModels.js";

// WHY THIS FILE EXISTS, SEPARATELY FROM src/lib/mongodb.js:
//
// That file starts with `import "server-only"` — a real, valuable,
// pre-existing protection ensuring DB code can never end up in a
// browser bundle, and it should stay exactly as it is for every file
// that goes through Next.js's own webpack/SWC pipeline (API routes,
// Server Components — anything `next build`/`next dev` compiles).
//
// server.js does NOT go through that pipeline. It's executed directly
// via plain `node server.js`, so anything it imports — including,
// transitively, socketServer.js and ariClient.js — gets resolved by
// Node's own native module loader, not webpack. The `server-only`
// package's protection works by shipping different files for
// webpack-bundled-for-the-browser vs. everything else, using package.json
// export conditions webpack defines and plain Node does not — so under
// plain Node it resolves to the THROWING build-guard file instead of the
// intended no-op, and the app crashes at startup with "This module
// cannot be imported from a Client Component module" even though
// nothing here is anywhere near a Client Component. (This is exactly
// the crash a real run of this app hit — see PROGRESS_TRACKER.md's
// post-delivery bug report for the full trace.)
//
// The fix is this file: the exact same connection logic (retry loop,
// pooling, mongoose settings) as lib/mongodb.js, kept in sync
// deliberately rather than importing that guarded file — because
// duplicating ~50 lines of connection logic is a far smaller, more
// honest tradeoff than either (a) weakening the guard on the file every
// other part of this app correctly relies on, or (b) silently hoping
// nothing in the custom server's import chain ever needs a DB
// connection (it does — every socket event and background sweep does).
//
// If you ever change lib/mongodb.js's retry/pooling behavior, mirror
// the change here too.

mongoose.set("strictQuery", true);

let connectionPromise = null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 3_000;
const TIMEOUT_PER_ATTEMPT_MS = 10_000;

const connectDbForCustomServer = async () => {
  if (mongoose.connection.readyState === 1) return;
  if (connectionPromise) return connectionPromise;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set in environment variables.");

  connectionPromise = (async () => {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await mongoose.connect(uri, {
          serverSelectionTimeoutMS: TIMEOUT_PER_ATTEMPT_MS,
          maxPoolSize: 20,
          minPoolSize: 2,
          retryWrites: true,
          retryReads: true,
        });
        console.log(`✓ [custom server] MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}` +
          (attempt > 1 ? ` (attempt ${attempt}/${MAX_ATTEMPTS})` : ""));
        return;
      } catch (err) {
        lastError = err;
        console.warn(`[custom server] MongoDB connection attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err.message}`);
        if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
      }
    }
    throw lastError;
  })().finally(() => {
    connectionPromise = null;
  });

  return connectionPromise;
};

export default connectDbForCustomServer;
