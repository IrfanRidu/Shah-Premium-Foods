/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Playfair Display", "Georgia", "serif"],
        body: ["Inter", "system-ui", "sans-serif"],
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
