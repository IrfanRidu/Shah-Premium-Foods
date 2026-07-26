import "./globals.css";
import { cache } from "react";
import { headers } from "next/headers";
import Script from "next/script";
import Providers from "@/providers/Providers";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import connectDb from "@/lib/mongodb";
import SiteSettingsModel from "@/server/models/siteSettings.model";
import { inter, playfairDisplay } from "@/lib/fonts";
import dataCache from "@/lib/cache";

const DEFAULT_TITLE = "Shah Premium Foods";
const DEFAULT_DESC = "Your trusted online super shop for fresh groceries and daily essentials.";
// Section 10 (SEO): single source of truth for the site's absolute origin,
// used for metadataBase, Open Graph/Twitter absolute URLs, and the
// Organization/WebSite JSON-LD below. Same env var sitemap.js and
// security.js's CSRF check already rely on (see .env.example).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

// #23: shared by generateMetadata() and RootLayout below so the settings
// document is only fetched once per request (React's cache() dedupes
// identical calls within a single render pass) even though both need it —
// generateMetadata for <head> tags, RootLayout for the GA/JSON-LD <script>
// tags that the Metadata API itself has no slot for.
//
// Section 9 (Performance): React's cache() above only dedupes WITHIN one
// request — every different visitor's request still re-queried Mongo for
// the exact same settings document. lib/cache.js adds the layer React's
// cache() can't: a real cross-request TTL cache, "settings:main" — the
// same key siteSettings.controller.js's getSiteSettingsController uses, so
// an admin save (which calls cache.invalidate("settings:") there) also
// invalidates what every page's <head> reads here, not just the API path.
const getSiteSettingsForHead = cache(async () => {
  try {
    return await dataCache.getOrSet(
      "settings:main",
      async () => {
        await connectDb();
        return SiteSettingsModel.findOne({ key: "main" }).lean();
      },
      dataCache.TTL.LONG
    );
  } catch {
    return null; // DB unavailable at build/edge time — every caller below has its own fallback
  }
});

// Dynamic metadata — pulls the admin-configured favicon + site name so the
// browser tab icon updates site-wide the moment it's changed in Settings,
// without needing any client-side JS.
// #23: also now pulls the rest of the seo{} block (meta title/description/
// keywords, Open Graph image, canonical URL, Search Console verification)
// that previously existed on the model and in the sitemap generator's own
// fallbacks, but was never actually read anywhere else — this was the
// "actual use in page <head> metadata" gap flagged as still open.
export async function generateMetadata() {
  const settings = await getSiteSettingsForHead();
  const siteName = settings?.siteName || DEFAULT_TITLE;
  const favicon  = settings?.favicon || "";
  const seo      = settings?.seo || {};

  const title       = seo.metaTitle || siteName;
  const description = seo.metaDescription || DEFAULT_DESC;

  return {
    // Section 10 (SEO): required for next/image-independent things like
    // resolving relative Open Graph/Twitter image URLs and
    // `alternates.canonical` values into absolute ones. Without this, Next
    // logs a warning and social-preview scrapers can receive a relative
    // (invalid) image URL. Every child route's own generateMetadata (see
    // product/category/subcategory pages) inherits this automatically.
    metadataBase: new URL(SITE_URL),
    // Section 10 (SEO): template form — any child route below that sets its
    // OWN `title` (a plain string) automatically gets composed into
    // "PageTitle | SiteName" by Next itself; a child with no title of its
    // own still gets exactly `default` (today's homepage behavior,
    // unchanged). This is what product/category/subcategory pages' own
    // generateMetadata rely on below, rather than each of them re-fetching
    // settings and string-concatenating the site name three separate times.
    title: { template: `%s | ${siteName}`, default: title },
    description,
    ...(seo.metaKeywords ? { keywords: seo.metaKeywords } : {}),
    ...(seo.canonicalUrl ? { alternates: { canonical: seo.canonicalUrl } } : {}),
    ...(seo.googleSearchConsoleId ? { verification: { google: seo.googleSearchConsoleId } } : {}),
    openGraph: {
      title,
      description,
      siteName,
      type: "website",
      url: SITE_URL,
      ...(seo.ogImage ? { images: [{ url: seo.ogImage }] } : {}),
    },
    // Section 10 (SEO): "Twitter Cards" — previously missing entirely, so
    // links shared on Twitter/X fell back to a generic, image-less card.
    // summary_large_image matches the single-image OG setup above.
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(seo.ogImage ? { images: [seo.ogImage] } : {}),
    },
    icons: favicon
      ? { icon: favicon, shortcut: favicon, apple: favicon }
      : undefined,
  };
}

export default async function RootLayout({ children }) {
  const settings = await getSiteSettingsForHead();
  const seo = settings?.seo || {};
  // Set by src/middleware.js — see that file's comment for the full CSP
  // story. Every inline <script> below must carry this exact nonce or the
  // browser will refuse to run it under the Content-Security-Policy header.
  const nonce = headers().get("x-csp-nonce") || undefined;

  // Structured data is free-form admin-entered JSON — validated here so a
  // typo can't break the whole page; an invalid value is just skipped
  // (the Site Settings form itself already warns the admin at save time).
  let structuredDataJson = null;
  if (seo.structuredData?.trim()) {
    try { structuredDataJson = JSON.parse(seo.structuredData); } catch { /* skip silently, already warned at save time */ }
  }
  // Defense in depth even with the nonce above: escaping "<" means a
  // string value inside the admin's JSON can never contain a literal
  // "</script>" sequence, which would otherwise let injected content break
  // out of this script tag and be parsed as raw HTML by the browser.
  const structuredDataHtml = structuredDataJson
    ? JSON.stringify(structuredDataJson).replace(/</g, "\\u003c")
    : null;

  // Section 10 (SEO) — "JSON-LD" / "Structured Data": a baseline
  // Organization + WebSite block, always present on every page (unlike the
  // block above, which only renders if an admin has opted into typing
  // free-form JSON into Site Settings → SEO). The two are independent and
  // additive — an admin's custom JSON-LD (e.g. for a more detailed
  // Organization profile) still renders alongside this, not instead of it;
  // duplicate `@type`s across separate <script type="application/ld+json">
  // blocks are explicitly valid per schema.org/JSON-LD (each script tag is
  // its own top-level node). The `SearchAction` gives eligible sites a
  // sitelinks search box in Google results, pointed at the real /search
  // route and its real `q` query param (src/app/search/page.jsx).
  const siteName = settings?.siteName || DEFAULT_TITLE;
  const orgJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: siteName,
        url: SITE_URL,
        ...(settings?.logo ? { logo: settings.logo } : {}),
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: siteName,
        url: SITE_URL,
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE_URL}/search?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
  const orgJsonLdHtml = JSON.stringify(orgJsonLd).replace(/</g, "\\u003c");

  return (
    <html lang="en" className={`${inter.variable} ${playfairDisplay.variable}`}>
      <head>
        {/* Section 9 (Performance) — "Preconnect / DNS-prefetch". Fonts no
            longer need this at all (next/font self-hosts them — see
            lib/fonts.js), but Cloudinary genuinely is fetched from on
            almost every page (every product/category/banner image), so a
            real connection warm-up here shaves the TLS+DNS handshake off
            the very first image request. This is an explicit, deliberate
            hint for one specific, always-used origin — unrelated to (and
            not a reversal of) the sitewide `X-DNS-Prefetch-Control: off`
            response header in next.config.mjs, which only governs the
            browser's IMPLICIT, hover-triggered speculative prefetching of
            arbitrary third-party links found in page content (a privacy
            concern for links we don't control); an explicit <link> for an
            origin the page is guaranteed to need regardless isn't that. */}
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://res.cloudinary.com" />
        {seo.googleAnalyticsId && (
          <>
            {/* Section 9 (Performance) — "Remove render blocking": next/script
                with strategy="afterInteractive" loads and executes after the
                page has become interactive, same non-blocking spirit as the
                previous hand-written async tag but using Next's own script
                scheduler (also handles de-duplication/ordering if more
                next/script tags are ever added elsewhere). */}
            <Script
              nonce={nonce}
              src={`https://www.googletagmanager.com/gtag/js?id=${seo.googleAnalyticsId}`}
              strategy="afterInteractive"
            />
            <Script
              id="ga-init"
              nonce={nonce}
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${seo.googleAnalyticsId}');`,
              }}
            />
          </>
        )}
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: orgJsonLdHtml }}
        />
        {structuredDataHtml && (
          <script
            nonce={nonce}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: structuredDataHtml }}
          />
        )}
      </head>
      <body className="flex flex-col min-h-dvh">
        <Providers>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
