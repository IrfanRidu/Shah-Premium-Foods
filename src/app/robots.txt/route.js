import connectDb from "@/lib/mongodb";
import SiteSettingsModel from "@/server/models/siteSettings.model";

const DEFAULT_ROBOTS = "User-agent: *\nAllow: /";

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

// Always reflect the current admin setting rather than caching a stale
// build-time snapshot — same reasoning as sitemap.js's own dynamic export.
export const dynamic = "force-dynamic";
