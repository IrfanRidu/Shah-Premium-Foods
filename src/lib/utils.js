import toast from "react-hot-toast";

// ── Price display ────────────────────────────────────────────────
// Shared across displayPrice() below and anywhere else (e.g. editable
// currency-aware inputs) that needs a symbol without pulling in the
// formatted-string logic. Single source of truth so this map doesn't end
// up duplicated a third time somewhere else in the app.
export const CURRENCY_SYMBOLS = { USD: "$", EUR: "€", INR: "₹", PKR: "₨", GBP: "£", BDT: "৳" };

export const displayPrice = (price = 0, currency = "BDT", rates = null, locale = "en-BD") => {
  const num = Number(price) || 0;
  if (rates && rates[currency] && rates["BDT"] && currency !== "BDT") {
    // Convert from BDT to the selected currency via USD as pivot
    const inUSD = num / (rates["BDT"] || 122);
    const converted = inUSD * (rates[currency] || 1);
    const sym = CURRENCY_SYMBOLS[currency] || currency + " ";
    return `${sym}${converted.toFixed(2)}`;
  }
  // Default: BDT
  return `৳${num.toFixed(2)}`;
};

// Numeric (unformatted) BDT <-> other-currency conversion — same pivot-
// through-USD math as displayPrice() above, but returns a plain number
// instead of a formatted string. displayPrice() is for read-only display;
// these are for EDITABLE inputs that need to show and accept a value in
// whatever currency is currently selected while the underlying data stays
// stored in BDT (the app's canonical currency, same as product prices).
export const convertFromBDT = (bdtValue, currency, rates) => {
  const num = Number(bdtValue);
  if (!Number.isFinite(num)) return bdtValue;
  if (!rates || !currency || currency === "BDT" || !rates[currency] || !rates["BDT"]) return num;
  const inUSD = num / (rates["BDT"] || 122);
  return inUSD * (rates[currency] || 1);
};

export const convertToBDT = (value, currency, rates) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  if (!rates || !currency || currency === "BDT" || !rates[currency] || !rates["BDT"]) return num;
  const inUSD = num / (rates[currency] || 1);
  return inUSD * (rates["BDT"] || 122);
};

// Shorthand used throughout components — pulls from Redux in the component itself
export const displayPriceSimple = (price = 0) => `৳${(Number(price) || 0).toFixed(2)}`;

export const priceWithDiscount = (price = 0, discount = 0) => {
  if (!discount) return Number(price);
  return Number(price) - (Number(price) * Number(discount)) / 100;
};

// ── URL helpers ──────────────────────────────────────────────────
// Security audit (XSS): admin-configurable link fields (footer social
// links, quick links) get rendered straight into an <a href={...}> for
// every site visitor with no scheme validation. An admin-role account
// (which, per the RBAC audit, now includes MANAGER/STAFF — not just
// SUPERADMIN) could store `javascript:...` as a "Facebook URL" and it
// would execute in any visitor's browser who clicks it — a stored-XSS
// vector via a settings field, not user-submitted content, but a real one.
// Only allow the schemes an <a href> is actually supposed to have.
const SAFE_URL_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);
export const safeExternalUrl = (url = "", fallback = "#") => {
  if (!url) return fallback;
  // Relative/site-internal paths ("/about", "#section") are always fine —
  // they can't carry a scheme at all.
  if (url.startsWith("/") || url.startsWith("#")) return url;
  try {
    const parsed = new URL(url, "https://placeholder.invalid");
    return SAFE_URL_SCHEMES.has(parsed.protocol) ? url : fallback;
  } catch {
    return fallback;
  }
};

// Security/optimization audit (Section 6): delivery-time WebP conversion
// for Cloudinary URLs, for use at specific <img>/CSS background call
// sites that are known to only ever render the image visually (never fed
// to jsPDF, never fetched raw for re-processing, etc.) — see
// uploadImageCloudinary.js's own comment for why this isn't forced at
// upload time instead. Cloudinary's `f_webp,q_auto` URL transformation
// segment converts format and applies automatic quality/compression on
// the fly, and — being a fresh transform, not the stored original — also
// doesn't carry over the original's EXIF/GPS metadata.
export const cloudinaryWebpUrl = (url = "") => {
  if (!url || !url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
  if (url.includes("/upload/f_webp")) return url; // already transformed, don't double up
  return url.replace("/upload/", "/upload/f_webp,q_auto/");
};

// Section 9/10 perf+SEO pass: moved to lib/slug.js (pure, dependency-free —
// see that file's comment for why) and re-exported here so every existing
// `import { validURLConvert, extractIdFromSlug } from "@/lib/utils"` call
// site keeps working exactly as before. New server-only code should import
// from "@/lib/slug" directly instead of pulling this whole file (and its
// react-hot-toast dependency) into a server bundle.
export { validURLConvert, extractIdFromSlug } from "./slug.js";

// ── Role helpers ─────────────────────────────────────────────────
export const isAdmin = (role) => ["ADMIN", "SUPERADMIN"].includes(role);
export const isSuperAdmin = (role) => role === "SUPERADMIN";

// Demo Admin: a role that can view/click through literally everything a
// Super Admin can (see role.controller.js's ensureSystemRoles), but every
// mutating request it makes is intercepted and simulated centrally in
// src/lib/apiHandler.js before it ever reaches the database. Deliberately
// NOT folded into isSuperAdmin() above — a few genuinely sensitive spots
// (Audit Log) stay gated to the literal, strict check so they remain
// truly hidden/blocked rather than simulated. Use hasFullDashboardAccess()
// below for the (much more common) case of "show this the same as Super
// Admin sees it."
export const isDemoAdmin = (role) => role === "DEMO_ADMIN";

// Same *visible* breadth as Super Admin — use this for UI-visibility
// gates (sidebar sections, page render-guards, role-picker availability).
// Do NOT use this for anything that should stay strictly Super-Admin-only
// (Audit Log) — keep those on isSuperAdmin() directly.
export const hasFullDashboardAccess = (role) => isSuperAdmin(role) || isDemoAdmin(role);

// The "...and other" Employee sub-types named in the role spec: HR, Call
// Center Agent, plus the pre-existing Manager/Staff/Analyst operational
// roles. Each has its own narrow, purpose-scoped dashboard rather than the
// full admin view.
export const EMPLOYEE_ROLES = ["HR", "CALL_CENTER_AGENT", "MANAGER", "STAFF", "ANALYST"];
export const isEmployeeRole = (role) => EMPLOYEE_ROLES.includes(role);

// Any role that lands somewhere inside /dashboard at all (as opposed to a
// plain USER, whose dropdown/sidebar only ever shows their own personal
// account section).
export const hasDashboardAccess = (role) => isAdmin(role) || isDemoAdmin(role) || isEmployeeRole(role);

// ── Error toast ──────────────────────────────────────────────────
// Session 4 (Reviews & Q&A) — relative-time display ("2 days ago") for
// review/question timestamps. Added here rather than inline in any one
// component since it's a genuinely generic utility, same category as
// displayPrice/validURLConvert above — nothing about it is
// review-specific despite this being the first caller.
export const timeAgo = (date) => {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [label, secs] of units) {
    const count = Math.floor(seconds / secs);
    if (count >= 1) return `${count} ${label}${count > 1 ? "s" : ""} ago`;
  }
  return "just now";
};

export const axiosToastError = (error) => {
  const msg =
    error?.response?.data?.message ||
    error?.message ||
    "Something went wrong.";
  toast.error(msg);
  return msg;
};

// ── Image compression (client-side) ────────────────────────────────
// Large camera-original photos (phones routinely shoot 5–15MB JPEGs/HEICs)
// can exceed server/platform request-size limits and fail silently.
// We downscale + re-encode to JPEG in the browser before upload so every
// image flow (avatar, product, category, banner) is safe by default.
export const compressImage = (file, maxDimension = 1280, quality = 0.85) => {
  return new Promise((resolve) => {
    if (!file || !file.type?.startsWith("image/") || file.type === "image/svg+xml" || file.type === "image/gif") {
      resolve(file); // skip non-raster / animated formats — compress would break them
      return;
    }
    if (typeof window === "undefined" || typeof document === "undefined") {
      resolve(file);
      return;
    }
    try {
      const img = new window.Image();
      const objectUrl = URL.createObjectURL(file);
      const cleanup = () => URL.revokeObjectURL(objectUrl);

      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { cleanup(); resolve(file); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            cleanup();
            if (!blob) { resolve(file); return; }
            const compressed = new File(
              [blob],
              (file.name || "image").replace(/\.\w+$/, "") + ".jpg",
              { type: "image/jpeg" }
            );
            // Only swap in the compressed version if it's actually smaller
            resolve(compressed.size > 0 && compressed.size < file.size ? compressed : file);
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => { cleanup(); resolve(file); };
      img.src = objectUrl;
    } catch {
      resolve(file);
    }
  });
};

// ── Image upload ─────────────────────────────────────────────────
export const uploadImage = async (image, Axios, api) => {
  // Hard cap before we even try to touch it in the browser (extremely large
  // files — e.g. uncompressed RAW/TIFF — can hang canvas decoding on mobile).
  const HARD_CAP_BYTES = 25 * 1024 * 1024; // 25MB
  if (image?.size > HARD_CAP_BYTES) {
    throw new Error("That image is too large (max 25MB). Please choose a smaller photo.");
  }

  let fileToUpload = image;
  try {
    fileToUpload = await compressImage(image);
  } catch {
    fileToUpload = image; // compression is a best-effort optimization, never block the upload
  }

  const fd = new FormData();
  fd.append("image", fileToUpload);
  const res = await Axios({ ...api.uploadImage, data: fd });
  return res.data;
};
