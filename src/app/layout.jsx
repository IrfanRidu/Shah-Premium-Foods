import "./globals.css";
import Providers from "@/providers/Providers";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import connectDb from "@/lib/mongodb";
import SiteSettingsModel from "@/server/models/siteSettings.model";

const DEFAULT_TITLE = "Shah Premium Foods";
const DEFAULT_DESC = "Your trusted online super shop for fresh groceries and daily essentials.";

// Dynamic metadata — pulls the admin-configured favicon + site name so the
// browser tab icon updates site-wide the moment it's changed in Settings,
// without needing any client-side JS.
export async function generateMetadata() {
  try {
    await connectDb();
    const settings = await SiteSettingsModel.findOne({ key: "main" }).lean();
    const siteName = settings?.siteName || DEFAULT_TITLE;
    const favicon  = settings?.favicon || "";

    return {
      title: siteName,
      description: DEFAULT_DESC,
      icons: favicon
        ? { icon: favicon, shortcut: favicon, apple: favicon }
        : undefined,
    };
  } catch {
    // DB unavailable at build/edge time — fall back to static defaults
    return { title: DEFAULT_TITLE, description: DEFAULT_DESC };
  }
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
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
