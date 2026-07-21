"use client";
import { useSelector } from "react-redux";
import { useTranslation } from "@/lib/i18n";
import Link from "next/link";
import { FaFacebook, FaInstagram, FaTwitter, FaYoutube, FaMapMarkerAlt, FaPhone, FaEnvelope } from "react-icons/fa";
import { safeExternalUrl } from "@/lib/utils";

export default function Footer() {
  const { t }    = useTranslation();
  const settings = useSelector((s) => s.siteSettings);
  const footer   = settings.footer || {};
  const social   = footer.socialLinks || {};
  const links    = footer.quickLinks || [];
  const paymentMethods = settings.paymentMethods || [];

  const col2Title = footer.col2Title || t("footer.quickLinks");
  const col3Title = footer.col3Title || t("footer.followUs");

  return (
    <footer style={{ backgroundColor: "var(--color-footer-bg)", color: "var(--color-footer-text)" }} className="mt-auto">
      <div className="container mx-auto px-4 py-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 text-sm">
        {/* Col 1: Brand / About */}
        <div className="sm:col-span-2 md:col-span-1">
          {settings.logo
            ? <img src={settings.logo} alt={settings.siteName} className="h-10 w-auto mb-3 opacity-90" />
            : <h3 className="font-display text-lg font-semibold mb-3">{settings.siteName || "Shah Premium Foods"}</h3>
          }
          <p className="opacity-75 leading-relaxed text-sm">
            {footer.aboutText || "Your trusted online super shop for fresh groceries and daily essentials."}
          </p>
        </div>

        {/* Col 2: Contact */}
        <div>
          <h4 className="font-semibold mb-4 uppercase tracking-widest text-xs opacity-60">{t("footer.contact")}</h4>
          <div className="space-y-2.5">
            {footer.address && (
              <div className="flex items-start gap-2 opacity-75">
                <FaMapMarkerAlt className="shrink-0 mt-0.5" />
                <span>{footer.address}</span>
              </div>
            )}
            {footer.phone && (
              <div className="flex items-center gap-2 opacity-75">
                <FaPhone className="shrink-0" />
                <a href={`tel:${footer.phone}`} className="hover:opacity-100">{footer.phone}</a>
              </div>
            )}
            {footer.email && (
              <div className="flex items-center gap-2 opacity-75">
                <FaEnvelope className="shrink-0" />
                <a href={`mailto:${footer.email}`} className="hover:opacity-100">{footer.email}</a>
              </div>
            )}
            {!footer.address && !footer.phone && !footer.email && (
              <p className="opacity-50">No contact info added yet.</p>
            )}
          </div>
        </div>

        {/* Col 3: Quick Links (admin-defined) */}
        <div>
          <h4 className="font-semibold mb-4 uppercase tracking-widest text-xs opacity-60">{col2Title}</h4>
          <ul className="space-y-2">
            {links.length > 0
              ? links.map((lnk, i) => (
                  <li key={i}>
                    <Link href={safeExternalUrl(lnk.url, "/")} className="opacity-75 hover:opacity-100 transition-opacity">
                      {lnk.label}
                    </Link>
                  </li>
                ))
              : (
                <>
                  <li><Link href="/" className="opacity-75 hover:opacity-100">{t("nav.home")}</Link></li>
                  <li><Link href="/category" className="opacity-75 hover:opacity-100">{t("banner.shopAllProducts")}</Link></li>
                  <li><Link href="/search" className="opacity-75 hover:opacity-100">{t("nav.search")}</Link></li>
                  <li><Link href="/dashboard/myorders" className="opacity-75 hover:opacity-100">{t("orders.myOrders")}</Link></li>
                  <li><Link href="/dashboard/profile" className="opacity-75 hover:opacity-100">{t("nav.myAccount")}</Link></li>
                </>
              )
            }
          </ul>
        </div>

        {/* Col 4: Social */}
        <div>
          <h4 className="font-semibold mb-4 uppercase tracking-widest text-xs opacity-60">{col3Title}</h4>
          <div className="flex gap-4 text-xl mb-5">
            {social.facebook  && <a href={safeExternalUrl(social.facebook)}  target="_blank" rel="noreferrer" className="opacity-70 hover:opacity-100 transition-opacity" aria-label="Facebook"><FaFacebook /></a>}
            {social.instagram && <a href={safeExternalUrl(social.instagram)} target="_blank" rel="noreferrer" className="opacity-70 hover:opacity-100 transition-opacity" aria-label="Instagram"><FaInstagram /></a>}
            {social.twitter   && <a href={safeExternalUrl(social.twitter)}   target="_blank" rel="noreferrer" className="opacity-70 hover:opacity-100 transition-opacity" aria-label="Twitter"><FaTwitter /></a>}
            {social.youtube   && <a href={safeExternalUrl(social.youtube)}   target="_blank" rel="noreferrer" className="opacity-70 hover:opacity-100 transition-opacity" aria-label="YouTube"><FaYoutube /></a>}
            {!social.facebook && !social.instagram && !social.twitter && !social.youtube && (
              <p className="opacity-50 text-sm">No social links yet.</p>
            )}
          </div>

          {footer.showNewsletter && (
            <div>
              <p className="text-xs opacity-60 mb-2">Subscribe to our newsletter</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="your@email.com"
                  className="flex-1 px-3 py-1.5 rounded-lg text-sm bg-white/10 border border-white/20 text-inherit placeholder:opacity-50 outline-none focus:border-white/40"
                />
                <button className="px-3 py-1.5 rounded-lg bg-theme-primary text-white text-xs font-semibold hover:opacity-90 transition-opacity">
                  Go
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-4">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 opacity-50 text-center sm:text-left">
            <span>{footer.copyrightText || `© ${new Date().getFullYear()} ${settings.siteName || "Shah Premium Foods"}. ${t("footer.allRightsReserved")}`}</span>
            <Link href="/sitemap" className="hover:opacity-100 underline decoration-dotted">Sitemap</Link>
          </div>

          {/* Admin-uploaded payment method logos — rendered with a transparent
              background and no border/box (previously had a bg-white/90 +
              rounded + padding "chip" treatment, which showed as a fat white
              border around every logo regardless of the footer's own
              background color). */}
          {paymentMethods.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap justify-center">
              {paymentMethods.map((pm, i) => (
                <img key={pm._id || i} src={pm.image} alt={pm.name || "Payment method"}
                  title={pm.name} className="h-6 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity bg-transparent" />
              ))}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
