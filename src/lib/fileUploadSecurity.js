// Security audit (Section 6 — File Upload Security). Every upload in this
// app is an image (confirmed: every file input across the codebase is
// `accept="image/*"`, no document/PDF/other upload feature exists
// anywhere) — so this deliberately implements a strict ALLOWLIST of image
// formats rather than a blocklist of dangerous ones. An allowlist is
// structurally stronger: "prevent executable upload" isn't a separate
// rule to remember to keep updated, it's just a natural consequence of
// only ever accepting a handful of specifically-recognized image formats.

export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB

// MIME type is just a header the client sends — trivially spoofable (an
// attacker can rename a malicious file and/or set any Content-Type they
// want). This is the actual defense: verify the file's own leading bytes
// ("magic numbers") match a known image format, independent of whatever
// Content-Type the upload claims. If neither the claimed MIME type nor
// the real magic bytes are on this list, the file is rejected — this is
// what actually prevents an executable (or any other disguised file type)
// from getting through, not just checking a spoofable header.
const MAGIC_BYTES = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png",  bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/gif",  bytes: [0x47, 0x49, 0x46, 0x38] }, // covers both GIF87a and GIF89a
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, extra: { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 } }, // "RIFF"...."WEBP"
  { mime: "image/x-icon", bytes: [0x00, 0x00, 0x01, 0x00] }, // .ico (favicon upload)
];

function matchesMagicBytes(buffer, def) {
  if (buffer.length < def.bytes.length) return false;
  for (let i = 0; i < def.bytes.length; i++) {
    if (buffer[(def.offset || 0) + i] !== def.bytes[i]) return false;
  }
  if (def.extra) {
    if (buffer.length < def.extra.offset + def.extra.bytes.length) return false;
    for (let i = 0; i < def.extra.bytes.length; i++) {
      if (buffer[def.extra.offset + i] !== def.extra.bytes[i]) return false;
    }
  }
  return true;
}

/**
 * @returns {{ valid: true, detectedMime: string } | { valid: false, reason: string }}
 */
export function validateUploadedFile(file) {
  if (!file || !file.buffer) {
    return { valid: false, reason: "No file received." };
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return { valid: false, reason: `File is too large. Maximum size is ${MAX_UPLOAD_SIZE / (1024 * 1024)}MB.` };
  }
  if (file.size === 0) {
    return { valid: false, reason: "File is empty." };
  }

  const match = MAGIC_BYTES.find((def) => matchesMagicBytes(file.buffer, def));
  if (!match) {
    return { valid: false, reason: "This doesn't look like a valid image file. Only JPEG, PNG, GIF, WebP, and ICO are allowed." };
  }

  // Belt-and-suspenders: the claimed MIME type should be an image type at
  // all (catches obviously-wrong claims early with a clearer message),
  // but the magic-byte match above is what actually gates admission —
  // a mismatched-but-still-a-real-image claimed MIME isn't itself a
  // security problem, so this doesn't hard-reject on mismatch, only on
  // the claimed type not even being an image type.
  if (file.mimetype && !file.mimetype.startsWith("image/")) {
    return { valid: false, reason: "Only image files are allowed." };
  }

  return { valid: true, detectedMime: match.mime };
}

// Virus scan placeholder — Section 6 explicitly asked for this even though
// a real scanner can't run inside this sandbox/most Next.js hosting
// environments without a separate service. This is a genuine integration
// point, not decoration: it's called from apiHandler.js for every
// uploaded file after the magic-byte check passes and before the file
// reaches any controller/Cloudinary. Wire in a real provider by replacing
// the body of this function — e.g. ClamAV via a sidecar/REST API, or a
// cloud scanning API (VirusTotal, Cloudinary's own "Rekognition AI
// Moderation" / "Google AI Video Moderation" add-ons if using Cloudinary's
// paid moderation features, etc.). Until wired to a real provider, this
// always reports clean — it deliberately does NOT block uploads on its
// own, since a placeholder that silently blocks everything (or randomly)
// would be worse than no placeholder at all.
export async function scanFileForViruses(file) {
  // TODO: integrate a real scanner here. Example shape for a REST-based
  // scanner:
  //   const res = await fetch(process.env.VIRUS_SCAN_API_URL, {
  //     method: "POST",
  //     headers: { "Content-Type": "application/octet-stream" },
  //     body: file.buffer,
  //   });
  //   const result = await res.json();
  //   return { clean: result.clean, threat: result.threatName || null };
  return { clean: true, threat: null, scanned: false };
}
