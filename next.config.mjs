/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tell Next.js NOT to bundle these server-only packages — let Node.js
  // load them directly from node_modules at runtime. This avoids bundling
  // issues with packages that use native bindings or dynamic requires.
  // Note: this is `experimental.serverComponentsExternalPackages` on
  // Next.js 14.x (this project's version) — it only became the stable,
  // top-level `serverExternalPackages` in Next.js 15+. The old top-level
  // key was silently ignored and printed an "Invalid next.config.mjs
  // options" warning on every boot/build.
  experimental: {
    serverComponentsExternalPackages: [
      "mongoose",
      "bcryptjs",
      "jsonwebtoken",
      "cloudinary",
      "stripe",
      "resend",
      "multer",
    ],
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.cloudinary.com" },
      { protocol: "https", hostname: "placehold.co" },
    ],
  },

  env: {
    // Empty = same-origin (frontend + API share the same Next.js server).
    // Only set NEXT_PUBLIC_API_URL if the API is hosted on a different domain.
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "",
    NEXT_PUBLIC_CURRENCY_LOCALE:
      process.env.NEXT_PUBLIC_CURRENCY_LOCALE || "en-BD",
  },

  // Basic security headers (replaces helmet from the old Express setup)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options",    value: "nosniff" },
          { key: "X-Frame-Options",           value: "SAMEORIGIN" },
          { key: "X-XSS-Protection",          value: "1; mode=block" },
          { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
