import connectDb from "@/lib/mongodb";
import ProductModel from "@/server/models/product.model";
import SiteSettingsModel from "@/server/models/siteSettings.model";
import { validURLConvert } from "@/lib/slug";
import dataCache from "@/lib/cache";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

// Section 10 (SEO) — "RSS". Same folder+route.js convention as
// robots.txt/route.js (a plain Route Handler serving a "looks static"
// path) rather than hand-building this elsewhere — a "new arrivals" feed
// is the standard, useful RSS shape for an e-commerce catalog (price
// comparison tools, deal-alert aggregators, and some shoppers still
// genuinely use product RSS feeds this way), read fresh by feed readers
// on their own schedule rather than needing to be hit on every visitor's
// page load, so ISR fits the same way it does for the sitemap.
function escapeXml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  let products = [];
  let siteName = "Shah Premium Foods";
  try {
    await connectDb();
    // Reuses the exact same cache key siteSettings.controller.js and
    // layout.jsx both already use, so this stays in sync with them (an
    // admin renaming the site invalidates all three read paths together)
    // rather than this file caching its own separate, possibly-stale copy.
    const [fetchedProducts, settings] = await Promise.all([
      ProductModel.find({ publish: true })
        .select("name description price image createdAt")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      dataCache.getOrSet(
        "settings:main",
        () => SiteSettingsModel.findOne({ key: "main" }).lean(),
        dataCache.TTL.LONG
      ),
    ]);
    products = fetchedProducts;
    if (settings?.siteName) siteName = settings.siteName;
  } catch {
    // DB unavailable — serve a valid, empty feed rather than erroring
  }

  const items = products
    .map((p) => {
      const url = `${SITE_URL}/product/${validURLConvert(p.name, p._id)}`;
      const description = p.description?.trim() || `${p.name} — available now.`;
      return `  <item>
    <title>${escapeXml(p.name)}</title>
    <link>${escapeXml(url)}</link>
    <guid isPermaLink="true">${escapeXml(url)}</guid>
    <description>${escapeXml(description)}</description>
    <pubDate>${new Date(p.createdAt || Date.now()).toUTCString()}</pubDate>
    ${p.image?.[0] ? `<enclosure url="${escapeXml(p.image[0])}" type="image/jpeg" />` : ""}
  </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escapeXml(siteName)} — New Arrivals</title>
  <link>${SITE_URL}</link>
  <description>Latest products added to ${escapeXml(siteName)}.</description>
  <language>en</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}

// Section 9 (Performance) — "ISR", same reasoning as sitemap.js/robots.txt.
export const revalidate = 3600;
