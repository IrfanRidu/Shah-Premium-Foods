/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      // Section 9 (Performance): these used to reference the Google Fonts
      // family names directly; now point at the CSS variables next/font
      // generates (see src/lib/fonts.js + layout.jsx), matching the same
      // change in globals.css's .font-display / .section-heading / body
      // rules — same visual fonts, now self-hosted and non-blocking.
      fontFamily: {
        display: ["var(--font-playfair-display)", "Georgia", "serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        sage: {
          50:  "#f2f7f4",
          100: "#e0ede6",
          200: "#c1dbcc",
          300: "#94c1a9",
          400: "#62a07f",
          500: "#4A7860",
          600: "#3a6350",
          700: "#2e5041",
          800: "#264135",
          900: "#1f352b",
        },
      },
      animation: {
        marquee: "marquee 30s linear infinite",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
