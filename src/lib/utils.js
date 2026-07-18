import toast from "react-hot-toast";

// ── Price display ────────────────────────────────────────────────
export const displayPrice = (price = 0, currency = "BDT", rates = null, locale = "en-BD") => {
  const num = Number(price) || 0;
  if (rates && rates[currency] && rates["BDT"] && currency !== "BDT") {
    // Convert from BDT to the selected currency via USD as pivot
    const inUSD = num / (rates["BDT"] || 122);
    const converted = inUSD * (rates[currency] || 1);
    const symbols = { USD: "$", EUR: "€", INR: "₹", PKR: "₨", GBP: "£", BDT: "৳" };
    const sym = symbols[currency] || currency + " ";
    return `${sym}${converted.toFixed(2)}`;
  }
  // Default: BDT
  return `৳${num.toFixed(2)}`;
};

// Shorthand used throughout components — pulls from Redux in the component itself
export const displayPriceSimple = (price = 0) => `৳${(Number(price) || 0).toFixed(2)}`;

export const priceWithDiscount = (price = 0, discount = 0) => {
  if (!discount) return Number(price);
  return Number(price) - (Number(price) * Number(discount)) / 100;
};

// ── URL helpers ──────────────────────────────────────────────────
export const validURLConvert = (name = "", id = "") => {
  const slug = name
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  return `${slug}-${id}`;
};

export const extractIdFromSlug = (slug = "") => {
  const m = slug.match(/([a-f0-9]{24})$/i);
  return m ? m[1] : null;
};

// ── Role helpers ─────────────────────────────────────────────────
export const isAdmin = (role) => ["ADMIN", "SUPERADMIN"].includes(role);
export const isSuperAdmin = (role) => role === "SUPERADMIN";

// ── Error toast ──────────────────────────────────────────────────
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
