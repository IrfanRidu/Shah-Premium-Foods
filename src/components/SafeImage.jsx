import Image from "next/image";

const FALLBACK_SRC = "/placeholder-image.svg";

// Section 9 (Performance) — "Image Optimization". Thin wrapper around
// next/image used everywhere an <img> got converted in this pass, so a
// few recurring edge cases are handled once, consistently, instead of
// slightly differently in ~30 different files.
//
// Three problems this solves that a bare next/image usage doesn't:
//   1. Every image in this app (product/category/banner/avatar) is
//      admin/user-uploaded and optional in the data model — `src` can
//      legitimately be undefined/empty. A plain <img src={undefined}> just
//      silently renders nothing; next/image is stricter and can throw
//      ("Image is missing required src property"). This falls back to a
//      real, always-present local placeholder instead.
//   2. That placeholder is an SVG (public/placeholder-image.svg). Next's
//      built-in image optimizer disallows SVG sources by default
//      (`images.dangerouslyAllowSVG`, deliberately left off in
//      next.config.mjs — a real XSS-hardening default this app isn't
//      weakening sitewide just for one static asset). `unoptimized` is
//      the documented way to render a local SVG through next/image
//      without touching that flag: it skips the optimization pipeline
//      entirely for that one image, serving it as-is.
//   3. Every admin upload form in the dashboard (category/subcategory/
//      product/site-settings/campaigns/profile-avatar/etc.) shows a
//      live preview of the file the admin just picked, BEFORE it's
//      actually uploaded to Cloudinary — via
//      `setPreview(URL.createObjectURL(file))`. That's a `blob:` URL,
//      valid only within the current browser tab; next/image's optimizer
//      can't fetch/process it (it isn't a real network or filesystem
//      resource, and isn't in — nor could sensibly be in —
//      `images.remotePatterns`). `unoptimized` is the correct handling
//      here too: the browser already has the full-resolution blob
//      in memory, there's nothing to optimize, and forcing it through
//      the pipeline would just fail.
//
// None of this affects real, already-uploaded photos (Cloudinary HTTPS
// URLs) — those still go through full optimization exactly like every
// other converted <img> in this app.
//
// No "use client" — this has no hooks/state/browser APIs, so it works
// from both Server and Client Components (needed once product/category
// pages become Server Components later in this pass).
export default function SafeImage({ src, alt, ...props }) {
  const hasSrc = typeof src === "string" && src.trim().length > 0;
  const isLocalPreview = hasSrc && (src.startsWith("blob:") || src.startsWith("data:"));
  return (
    <Image
      src={hasSrc ? src : FALLBACK_SRC}
      alt={alt || ""}
      unoptimized={!hasSrc || isLocalPreview}
      {...props}
    />
  );
}
