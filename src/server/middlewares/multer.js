// Security audit finding: this file is NOT imported anywhere in the app
// (verified: `grep -rl "middlewares/multer" src` matches only this file
// itself). It's dead code left over from an earlier Express-based
// architecture — this project's actual multipart file parsing happens
// directly in src/lib/apiHandler.js's buildMockRequest() via the
// standard Web `Request.formData()` API (see that file's own comment:
// "Native FormData parsing — replaces multer in the Next.js context").
// That means the 5MB `fileSize` limit below was NEVER ACTUALLY ENFORCED —
// it looked like a real limit but nothing ever ran it. The real limit,
// plus magic-byte validation, a virus-scan hook, and rejection of
// anything that isn't a genuine image, now lives in
// src/lib/fileUploadSecurity.js and is wired into apiHandler.js directly.
// Kept here (unused) rather than deleted, in case some external tooling
// still references this path, but this file should NOT be treated as an
// active part of the upload security story — see fileUploadSecurity.js
// for that.
import multer from "multer";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

export default upload;
