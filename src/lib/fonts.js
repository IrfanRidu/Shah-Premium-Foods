// Section 9 (Performance) — "Font optimization".
//
// Previously: layout.jsx linked Google Fonts via manual <link rel="stylesheet">
// tags in <head>, AND globals.css had a second, duplicate `@import` of the
// exact same fonts — meaning the same two font families were fetched from
// fonts.googleapis.com/fonts.gstatic.com twice over, and the @import in
// particular is a genuinely render-blocking resource (a CSS @import must be
// fetched before the browser can finish building the stylesheet it's part
// of). Both are removed as part of this change (see globals.css and
// layout.jsx).
//
// next/font/google downloads these font files at BUILD TIME and self-hosts
// them from this app's own origin — zero requests to Google at runtime, no
// render-blocking external stylesheet, automatic `font-display: swap`
// (avoids invisible-text-during-load), and automatic preloading of the
// correct font file for the current route. This also lets the CSP in
// middleware.js drop fonts.googleapis.com/fonts.gstatic.com entirely (see
// that file) since nothing external is fetched anymore.
//
// Weights and styles below intentionally match exactly what was already
// being loaded via the old Google Fonts URL
// ("Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700")
// — same visual result, just self-hosted and non-blocking.
//
// Subsets: "latin" + "latin-ext" cover every language this app's i18n
// system currently ships (English, French — see lib/i18n.js's LANGUAGES —
// French's accented characters need latin-ext, not just latin). Bengali
// (the third supported language) isn't a Latin script and was never
// covered by these font families even under the old setup — the existing
// `system-ui`/`sans-serif` fallback in the font-family stack already
// handles that per-character, unchanged by this file.
import { Inter, Playfair_Display } from "next/font/google";

export const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const playfairDisplay = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-playfair-display",
  display: "swap",
});
