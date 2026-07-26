import connectDb from "@/lib/mongodb";
import SiteSettingsModel from "@/server/models/siteSettings.model";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://example.com";

// Section 10 (SEO): richer default than a bare "Allow: /" — Disallow rules
// for the two path families that provide zero indexable content AND are
// auth-walled anyway (saves crawl budget rather than letting bots
// repeatedly hit hundreds of admin/API URLs that all require login or
// aren't pages at all), plus a Sitemap: line so crawlers that check
// robots.txt first can discover it immediately.
//
// Deliberately NOT listed here: /cart, /checkout, /login, /register, and
// similar — those get an `X-Robots-Tag: noindex` response header instead
// (see middleware.js), which is the correct tool for "let it be crawled,
// but don't index it" (Disallow would hide that very signal from the
// crawler and can paradoxically leave a bare, snippet-less URL indexed
// instead of none at all — see middleware.js's own comment for the full
// reasoning).
const DEFAULT_ROBOTS = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /dashboard/

Sitemap: ${SITE_URL}/sitemap.xml
`;

// #23: serves whatever the admin typed into Site Settings → SEO →
// "robots.txt content" live at /robots.txt. Deliberately a plain Route
// Handler rather than Next's app/robots.js metadata-file convention —
// that convention expects a structured { rules, sitemap } object and
// generates its own text, which doesn't fit an admin-editable free-form
// robots.txt string the way the settings model already stores it. This
// approach serves that raw text directly, same idea as sitemap.js serving
// live DB data instead of a static file, just via a route instead of a
// metadata-file export.
export async function GET() {
  let body = DEFAULT_ROBOTS;
  try {
    await connectDb();
    const settings = await SiteSettingsModel.findOne({ key: "main" }).select("seo.robotsTxt").lean();
    if (settings?.seo?.robotsTxt) body = settings.seo.robotsTxt;
  } catch {
    // DB unavailable — fall back to the sane default rather than erroring
  }
  return new Response(body, {
    headers: { "Content-Type": "text/plain" },
  });
}

// Section 9 (Performance) — "ISR". Same reasoning as sitemap.js: this
// doesn't need to be recomputed from the database on literally every
// request (previously `force-dynamic`) to still reflect an admin's saved
// change reasonably quickly — Route Handlers support the same
// `revalidate` segment config as pages, so this stays DB-backed (never a
// stale build-time snapshot) while capping worst-case staleness at 1 hour
// instead of hitting Mongo on every single crawler request.
export const revalidate = 3600;
