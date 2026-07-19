import "./globals.css";
import { cache } from "react";
import Providers from "@/providers/Providers";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import connectDb from "@/lib/mongodb";
import SiteSettingsModel from "@/server/models/siteSettings.model";

const DEFAULT_TITLE = "Shah Premium Foods";
const DEFAULT_DESC = "Your trusted online super shop for fresh groceries and daily essentials.";

// #23: shared by generateMetadata() and RootLayout below so the settings
// document is only fetched once per request (React's cache() dedupes
// identical calls within a single render pass) even though both need it —
// generateMetadata for <head> tags, RootLayout for the GA/JSON-LD <script>
// tags that the Metadata API itself has no slot for.
const getSiteSettingsForHead = cache(async () => {
  try {
    await connectDb();
    return await SiteSettingsModel.findOne({ key: "main" }).lean();
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
    title,
    description,
    ...(seo.metaKeywords ? { keywords: seo.metaKeywords } : {}),
    ...(seo.canonicalUrl ? { alternates: { canonical: seo.canonicalUrl } } : {}),
    ...(seo.googleSearchConsoleId ? { verification: { google: seo.googleSearchConsoleId } } : {}),
    openGraph: {
      title,
      description,
      siteName,
      ...(seo.ogImage ? { images: [{ url: seo.ogImage }] } : {}),
    },
    icons: favicon
      ? { icon: favicon, shortcut: favicon, apple: favicon }
      : undefined,
  };
}

export default async function RootLayout({ children }) {
  const settings = await getSiteSettingsForHead();
  const seo = settings?.seo || {};

  // Structured data is free-form admin-entered JSON — validated here so a
  // typo can't break the whole page; an invalid value is just skipped
  // (the Site Settings form itself already warns the admin at save time).
  let structuredDataJson = null;
  if (seo.structuredData?.trim()) {
    try { structuredDataJson = JSON.parse(seo.structuredData); } catch { /* skip silently, already warned at save time */ }
  }

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {seo.googleAnalyticsId && (
          <>
            {/* eslint-disable-next-line @next/next/next-script-for-ga */}
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${seo.googleAnalyticsId}`} />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${seo.googleAnalyticsId}');`,
              }}
            />
          </>
        )}
        {structuredDataJson && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredDataJson) }}
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
