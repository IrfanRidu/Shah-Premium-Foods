"use client";
import { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useForm } from "react-hook-form";
import { FaTrash, FaPlus, FaGripVertical, FaImage } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { setSiteSettings } from "@/store/siteSettingsSlice";
import { axiosToastError, uploadImage } from "@/lib/utils";
import { useGlobalContext } from "@/providers/GlobalProvider";
import toast from "react-hot-toast";

const THEMES = ["default","dark","ocean","festive"];
const LANGS  = ["en","bn","fr"];
// Item 7: same currency list PreferenceSelector.jsx offers shoppers, so the
// admin's base-currency choice always matches what a user could pick for
// themselves.
const CURRENCIES = [
  { code: "BDT", label: "৳ BDT — Bangladeshi Taka" },
  { code: "USD", label: "$ USD — US Dollar" },
  { code: "EUR", label: "€ EUR — Euro" },
  { code: "INR", label: "₹ INR — Indian Rupee" },
  { code: "PKR", label: "₨ PKR — Pakistani Rupee" },
  { code: "GBP", label: "£ GBP — British Pound" },
];

function Section({ title, children }) {
  return (
    <div className="bg-[var(--color-surface)] border border-theme rounded-2xl p-5 space-y-4">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

export default function SiteSettingsPage() {
  const settings = useSelector((s) => s.siteSettings);
  const dispatch  = useDispatch();
  const { fetchSiteSettings } = useGlobalContext();

  const { register, handleSubmit, formState:{ isSubmitting } } = useForm({
    defaultValues: {
      siteName:                         settings.siteName || "",
      baseCurrency:                     settings.baseCurrency || "BDT",
      "header.announcementText":        settings.header?.announcementText || "",
      "header.showAnnouncement":        settings.header?.showAnnouncement || false,
      "footer.aboutText":               settings.footer?.aboutText || "",
      "footer.address":                 settings.footer?.address   || "",
      "footer.phone":                   settings.footer?.phone     || "",
      "footer.email":                   settings.footer?.email     || "",
      "footer.copyrightText":           settings.footer?.copyrightText || "",
      "footer.col2Title":               settings.footer?.col2Title || "Quick Links",
      "footer.col3Title":               settings.footer?.col3Title || "Follow Us",
      "footer.showNewsletter":          settings.footer?.showNewsletter || false,
      "footer.socialLinks.facebook":    settings.footer?.socialLinks?.facebook  || "",
      "footer.socialLinks.instagram":   settings.footer?.socialLinks?.instagram || "",
      "footer.socialLinks.twitter":     settings.footer?.socialLinks?.twitter   || "",
      "footer.socialLinks.youtube":     settings.footer?.socialLinks?.youtube   || "",
      "theme.activeTheme":              settings.theme?.activeTheme || "default",
      "language.activeLanguage":        settings.language?.activeLanguage || "en",
      "shoppingListBanner.enabled":     settings.shoppingListBanner?.enabled !== false,
      "shoppingListBanner.title":       settings.shoppingListBanner?.title || "Submit Your Shopping List",
      "shoppingListBanner.subtitle":    settings.shoppingListBanner?.subtitle || "",
      "shoppingListBanner.buttonText":  settings.shoppingListBanner?.buttonText || "Submit Shopping List",
      codRequireDeliveryCharge:         settings.codRequireDeliveryCharge || false,
    },
  });

  const [logo,         setLogo]        = useState(settings.logo || "");
  const [logoFile,     setLogoFile]    = useState(null);
  const [favicon,      setFavicon]     = useState(settings.favicon || "");
  const [faviconFile,  setFaviconFile] = useState(null);
  const [banners,      setBanners]     = useState(settings.banners || []);
  const [savingBanner, setSavingBanner]= useState(false);

  // Fix 7: payment method logos
  const [paymentMethods, setPaymentMethods] = useState(settings.paymentMethods || []);
  const [savingPaymentLogo, setSavingPaymentLogo] = useState(false);
  const [newPaymentName, setNewPaymentName] = useState("");

  // Footer quick links
  const [quickLinks,   setQuickLinks]  = useState(settings.footer?.quickLinks || []);
  const [newLinkLabel, setNewLinkLabel]= useState("");
  const [newLinkUrl,   setNewLinkUrl]  = useState("");

  // FAQ
  const [faqs, setFaqs] = useState(settings.faq || []);
  const [newQ,  setNewQ] = useState("");
  const [newA,  setNewA] = useState("");
  const [savingFaq, setSavingFaq] = useState(false);

  useEffect(() => {
    if (settings.faq) setFaqs(settings.faq);
    if (settings.footer?.quickLinks) setQuickLinks(settings.footer.quickLinks);
    if (settings.logo) setLogo(settings.logo);
    if (settings.favicon) setFavicon(settings.favicon);
    if (settings.banners) setBanners(settings.banners);
    if (settings.paymentMethods) setPaymentMethods(settings.paymentMethods);
  }, [settings]);

  const handleLogoChange = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setLogoFile(f); setLogo(URL.createObjectURL(f));
  };

  const handleFaviconChange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setFaviconFile(f); setFavicon(URL.createObjectURL(f));
  };

  const handleBannerAdd = async (e) => {
    const files = Array.from(e.target.files || []);
    try {
      setSavingBanner(true);
      let updatedBanners = banners;
      for (const f of files) {
        const up = await uploadImage(f, Axios, api);
        const url = up?.data?.url;
        if (url) {
          const r = await Axios({ ...api.addBanner, data: { image: url } });
          if (r.data?.success) {
            updatedBanners = [...updatedBanners, { image: url, _id: r.data.data?._id }];
            setBanners(updatedBanners);
          }
        }
      }
      // Fix 7: push to the global siteSettings slice too — the admin page's
      // own `banners` state only controls what this form shows; without
      // this dispatch the homepage hero carousel (and anywhere else that
      // reads settings.banners from Redux) kept showing the stale list
      // until a full reload re-fetched settings from the DB.
      dispatch(setSiteSettings({ ...settings, banners: updatedBanners }));
      toast.success("Banner(s) added");
    } catch (err) { axiosToastError(err); }
    finally { setSavingBanner(false); }
  };

  const handleBannerDelete = async (banner, i) => {
    try {
      if (banner._id) await Axios({ ...api.deleteBanner, data: { _id: banner._id } });
      const updatedBanners = banners.filter((_, idx) => idx !== i);
      setBanners(updatedBanners);
      // Fix 7 (instant update): same reasoning as handleBannerAdd above —
      // keep the global store in sync so the change is visible site-wide
      // right away, not just inside this admin form.
      dispatch(setSiteSettings({ ...settings, banners: updatedBanners }));
      toast.success("Banner removed");
    } catch (err) { axiosToastError(err); }
  };

  // Fix 7: payment method logos — a plain array field (like quickLinks),
  // saved together with the rest of the form, but the upload itself still
  // happens immediately on file select so the admin sees the logo appear
  // right away rather than waiting for the full form Save.
  const handlePaymentLogoAdd = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!newPaymentName.trim()) { toast.error("Give the payment method a name first (e.g. Visa, bKash)"); return; }
    try {
      setSavingPaymentLogo(true);
      const up = await uploadImage(f, Axios, api);
      const url = up?.data?.url;
      if (url) {
        const updated = [...paymentMethods, { name: newPaymentName.trim(), image: url }];
        setPaymentMethods(updated);
        dispatch(setSiteSettings({ ...settings, paymentMethods: updated }));
        setNewPaymentName("");
        toast.success("Payment method added");
      }
    } catch (err) { axiosToastError(err); }
    finally { setSavingPaymentLogo(false); }
  };

  const handlePaymentLogoRemove = (i) => {
    const updated = paymentMethods.filter((_, idx) => idx !== i);
    setPaymentMethods(updated);
    dispatch(setSiteSettings({ ...settings, paymentMethods: updated }));
  };

  const addQuickLink = () => {
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) return;
    setQuickLinks((prev) => [...prev, { label: newLinkLabel.trim(), url: newLinkUrl.trim() }]);
    setNewLinkLabel(""); setNewLinkUrl("");
  };
  const removeQuickLink = (i) => setQuickLinks((prev) => prev.filter((_, idx) => idx !== i));

  const addFaq = () => {
    if (!newQ.trim()) return;
    setFaqs((prev) => [...prev, { question: newQ.trim(), answer: newA.trim(), order: prev.length }]);
    setNewQ(""); setNewA("");
  };
  const removeFaq = (i) => setFaqs((prev) => prev.filter((_, idx) => idx !== i));
  const updateFaq = (i, field, val) => setFaqs((prev) => prev.map((f, idx) => idx === i ? { ...f, [field]: val } : f));

  const saveFaq = async () => {
    try {
      setSavingFaq(true);
      const r = await Axios({ ...api.manageFaq, data: { faq: faqs } });
      if (r.data?.success) {
        dispatch(setSiteSettings({ ...settings, faq: r.data.data }));
        toast.success("FAQ saved");
      }
    } catch (err) { axiosToastError(err); }
    finally { setSavingFaq(false); }
  };

  const onSubmit = async (data) => {
    try {
      let logoUrl    = settings.logo    || "";
      let faviconUrl = settings.favicon || "";

      if (logoFile) {
        const up = await uploadImage(logoFile, Axios, api);
        logoUrl = up?.data?.url || logoUrl;
      }
      if (faviconFile) {
        const up = await uploadImage(faviconFile, Axios, api);
        faviconUrl = up?.data?.url || faviconUrl;
      }

      // Bug fix (site settings not reflecting on frontend): every field above
      // is registered with a dotted path, e.g. register("header.announcementText").
      // React Hook Form's `handleSubmit` parses dot/bracket paths and hands
      // `onSubmit` back a real NESTED object — data.header.announcementText —
      // not a flat object with a literal "header.announcementText" key. This
      // function was reading `data["header.announcementText"]` (flat bracket
      // access), which is always undefined on a nested object, so every
      // dotted field (announcement bar, footer, shopping list banner, theme,
      // language) silently submitted as undefined and never actually saved,
      // while plain non-dotted fields like siteName/codRequireDeliveryCharge
      // (accessed correctly as data.siteName) worked fine. Reading through
      // the real nested paths below fixes every one of these at once.
      const payload = {
        siteName: data.siteName,
        baseCurrency: data.baseCurrency,
        logo: logoUrl,
        favicon: faviconUrl,
        header: {
          announcementText: data.header?.announcementText,
          showAnnouncement: data.header?.showAnnouncement,
        },
        footer: {
          aboutText:     data.footer?.aboutText,
          address:       data.footer?.address,
          phone:         data.footer?.phone,
          email:         data.footer?.email,
          copyrightText: data.footer?.copyrightText,
          col2Title:     data.footer?.col2Title,
          col3Title:     data.footer?.col3Title,
          showNewsletter:data.footer?.showNewsletter,
          quickLinks,
          socialLinks: {
            facebook:  data.footer?.socialLinks?.facebook,
            instagram: data.footer?.socialLinks?.instagram,
            twitter:   data.footer?.socialLinks?.twitter,
            youtube:   data.footer?.socialLinks?.youtube,
          },
        },
        shoppingListBanner: {
          enabled:    data.shoppingListBanner?.enabled,
          title:      data.shoppingListBanner?.title,
          subtitle:   data.shoppingListBanner?.subtitle,
          buttonText: data.shoppingListBanner?.buttonText,
        },
        codRequireDeliveryCharge: data.codRequireDeliveryCharge,
        paymentMethods,
        theme:    { activeTheme: data.theme?.activeTheme, availableThemes: THEMES },
        language: { activeLanguage: data.language?.activeLanguage, availableLanguages: LANGS },
      };

      const r = await Axios({ ...api.updateSiteSettings, data: payload });
      if (r.data?.success) {
        dispatch(setSiteSettings(r.data.data));
        toast.success("Settings saved");
        // update favicon in DOM
        if (faviconUrl) {
          let link = document.querySelector("link[rel~='icon']");
          if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
          link.href = faviconUrl;
        }
      }
    } catch (err) { axiosToastError(err); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-3xl">
      <h1 className="section-heading text-2xl">Site Settings</h1>

      {/* General */}
      <Section title="General">
        <div>
          <label className="block text-sm font-medium mb-1.5">Site Name</label>
          <input {...register("siteName")} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Base Currency</label>
          <select {...register("baseCurrency")} className="input-field">
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
          <p className="text-xs text-theme-muted mt-1">
            The whole site's default currency — used by every shopper who hasn't personally
            picked a different one, and always used in Analytics and other admin reports.
            Updates everywhere within about 30 seconds of saving, with no refresh needed.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Logo</label>
          <div className="flex items-center gap-4">
            {logo && <img src={logo} alt="logo" className="h-12 object-contain rounded-lg border border-theme" />}
            <label className="btn-outline px-4 py-2 cursor-pointer text-sm">
              Upload Logo
              <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
            </label>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Favicon</label>
          <p className="text-xs text-theme-muted mb-2">Recommended: 32×32 or 64×64 px ICO or PNG file</p>
          <div className="flex items-center gap-4">
            {favicon && (
              <div className="flex items-center gap-2">
                <img src={favicon} alt="favicon" className="h-8 w-8 object-contain rounded border border-theme" />
                <span className="text-xs text-theme-muted">Current favicon</span>
              </div>
            )}
            <label className="btn-outline px-4 py-2 cursor-pointer text-sm flex items-center gap-2">
              <FaImage size={12} /> Upload Favicon
              <input type="file" accept="image/*,.ico" onChange={handleFaviconChange} className="hidden" />
            </label>
          </div>
        </div>
      </Section>

      {/* Banners */}
      <Section title="Hero Banners">
        <div className="flex gap-3 flex-wrap">
          {banners.map((b, i) => (
            <div key={i} className="relative h-24 w-40 rounded-xl overflow-hidden border border-theme group">
              <img src={b.image||b} alt="" className="w-full h-full object-cover" />
              <button type="button" onClick={() => handleBannerDelete(b, i)}
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                <FaTrash size={14}/>
              </button>
            </div>
          ))}
          <label className={`h-24 w-40 rounded-xl border-2 border-dashed border-theme flex flex-col items-center justify-center cursor-pointer hover:border-theme-primary transition-colors text-theme-muted text-sm ${savingBanner?"opacity-50 pointer-events-none":""}`}>
            {savingBanner ? "Uploading…" : <><FaPlus size={14}/><span className="mt-1">Add Banner</span></>}
            <input type="file" accept="image/*" multiple onChange={handleBannerAdd} className="hidden" disabled={savingBanner}/>
          </label>
        </div>
      </Section>

      {/* Fix 7: Payment method logos */}
      <Section title="Payment Method Logos">
        <p className="text-xs text-theme-muted -mt-1">Shown in the bottom-right of the footer, next to the copyright line.</p>
        <div className="flex gap-3 flex-wrap">
          {paymentMethods.map((pm, i) => (
            <div key={i} className="relative h-14 w-24 rounded-xl overflow-hidden border border-theme group bg-white flex items-center justify-center p-1.5">
              <img src={pm.image} alt={pm.name} title={pm.name} className="max-h-full max-w-full object-contain" />
              <button type="button" onClick={() => handlePaymentLogoRemove(i)}
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                <FaTrash size={13}/>
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-xs font-medium mb-1.5">Name</label>
            <input value={newPaymentName} onChange={(e) => setNewPaymentName(e.target.value)}
              placeholder="e.g. Visa, bKash" className="input-field text-sm w-40" />
          </div>
          <label className={`btn-outline px-4 py-2 cursor-pointer text-sm flex items-center gap-2 ${savingPaymentLogo ? "opacity-50 pointer-events-none" : ""}`}>
            {savingPaymentLogo ? "Uploading…" : <><FaPlus size={12}/> Upload Logo</>}
            <input type="file" accept="image/*" onChange={handlePaymentLogoAdd} className="hidden" disabled={savingPaymentLogo} />
          </label>
        </div>
      </Section>

      {/* Announcement */}
      <Section title="Announcement Bar">
        <div className="flex items-center gap-3">
          <input {...register("header.showAnnouncement")} type="checkbox" id="showAnn" className="h-4 w-4 accent-[var(--color-primary)]" />
          <label htmlFor="showAnn" className="text-sm font-medium">Show announcement bar</label>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Announcement Text</label>
          <input {...register("header.announcementText")} className="input-field" placeholder="Free delivery on orders over ৳500!" />
        </div>
      </Section>

      {/* Footer */}
      <Section title="Footer">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Column 2 Heading</label>
            <input {...register("footer.col2Title")} className="input-field" placeholder="Quick Links" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Column 3 Heading</label>
            <input {...register("footer.col3Title")} className="input-field" placeholder="Follow Us" />
          </div>
        </div>
        {[["footer.aboutText","About Text","textarea"],["footer.address","Address","text"],["footer.phone","Phone","text"],["footer.email","Email","email"],["footer.copyrightText","Copyright Text","text"]].map(([n,l,t])=>(
          <div key={n}>
            <label className="block text-sm font-medium mb-1.5">{l}</label>
            {t==="textarea"
              ? <textarea {...register(n)} rows={3} className="input-field resize-none"/>
              : <input {...register(n)} type={t} className="input-field"/>
            }
          </div>
        ))}
        <div className="flex items-center gap-3">
          <input {...register("footer.showNewsletter")} type="checkbox" id="showNews" className="h-4 w-4 accent-[var(--color-primary)]" />
          <label htmlFor="showNews" className="text-sm font-medium">Show newsletter signup in footer</label>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {[["footer.socialLinks.facebook","Facebook URL"],["footer.socialLinks.instagram","Instagram URL"],["footer.socialLinks.twitter","Twitter URL"],["footer.socialLinks.youtube","YouTube URL"]].map(([n,l])=>(
            <div key={n}>
              <label className="block text-sm font-medium mb-1.5">{l}</label>
              <input {...register(n)} type="url" placeholder="https://…" className="input-field"/>
            </div>
          ))}
        </div>

        {/* Quick Links */}
        <div>
          <h3 className="font-medium text-sm mb-2">Footer Quick Links</h3>
          <div className="space-y-2 mb-3">
            {quickLinks.map((lnk, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={lnk.label}
                  onChange={(e) => setQuickLinks((prev) => prev.map((l, idx) => idx === i ? { ...l, label: e.target.value } : l))}
                  className="input-field flex-1" placeholder="Label"
                />
                <input
                  value={lnk.url}
                  onChange={(e) => setQuickLinks((prev) => prev.map((l, idx) => idx === i ? { ...l, url: e.target.value } : l))}
                  className="input-field flex-1" placeholder="URL (/page or https://…)"
                />
                <button type="button" onClick={() => removeQuickLink(i)} className="text-red-500 hover:text-red-700 p-1 shrink-0">
                  <FaTrash size={12}/>
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)} placeholder="Label" className="input-field flex-1" />
            <input value={newLinkUrl}   onChange={(e) => setNewLinkUrl(e.target.value)}   placeholder="URL"   className="input-field flex-1" />
            <button type="button" onClick={addQuickLink} className="btn-outline px-3 py-2 text-sm flex items-center gap-1 shrink-0">
              <FaPlus size={11}/> Add
            </button>
          </div>
        </div>
      </Section>

      {/* Shopping List Banner */}
      <Section title="Shopping List Banner">
        <div className="flex items-center gap-3">
          <input {...register("shoppingListBanner.enabled")} type="checkbox" id="slbEnabled" className="h-4 w-4 accent-[var(--color-primary)]" />
          <label htmlFor="slbEnabled" className="text-sm font-medium">Show shopping list banner on homepage</label>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Banner Title</label>
          <input {...register("shoppingListBanner.title")} className="input-field" placeholder="Submit Your Shopping List" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Banner Subtitle</label>
          <input {...register("shoppingListBanner.subtitle")} className="input-field" placeholder="Can't find what you need? Send us your list!" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Button Text</label>
          <input {...register("shoppingListBanner.buttonText")} className="input-field" placeholder="Submit Shopping List" />
        </div>
      </Section>

      {/* COD Delivery Charge */}
      <Section title="Cash on Delivery Settings">
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <input {...register("codRequireDeliveryCharge")} type="checkbox" id="codCharge" className="h-4 w-4 mt-0.5 accent-[var(--color-primary)]" />
          <div>
            <label htmlFor="codCharge" className="text-sm font-medium cursor-pointer">Require delivery charge payment for Cash on Delivery</label>
            <p className="text-xs text-theme-muted mt-1">
              When enabled, customers choosing Cash on Delivery must pay the delivery charge online (via card/mobile banking)
              before the order is placed — the product total is still collected as cash on arrival. This helps cut down on
              fake or abandoned COD orders. When disabled, customers can place COD orders with nothing paid upfront.
            </p>
          </div>
        </div>
      </Section>

      {/* Theme */}
      <Section title="Theme & Language">
        <div>
          <label className="block text-sm font-medium mb-2">Color Theme</label>
          <div className="flex gap-2 flex-wrap">
            {THEMES.map((t) => (
              <label key={t} className="flex items-center gap-2 cursor-pointer">
                <input {...register("theme.activeTheme")} type="radio" value={t} className="accent-[var(--color-primary)]"/>
                <span className="capitalize text-sm font-medium border border-theme px-3 py-1.5 rounded-full cursor-pointer">{t}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Language</label>
          <select {...register("language.activeLanguage")} className="input-field w-40">
            <option value="en">English</option>
            <option value="bn">বাংলা</option>
            <option value="fr">Français</option>
          </select>
        </div>
      </Section>

      <button type="submit" disabled={isSubmitting} className="btn-primary px-8 py-2.5">
        {isSubmitting ? "Saving…" : "Save Settings"}
      </button>

      {/* FAQ Management */}
      <Section title="FAQ Section (Homepage)">
        <p className="text-xs text-theme-muted">Questions appear in a compact 3-column grid on the homepage. Hover = tooltip answer, click = pinned open.</p>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {faqs.map((faq, i) => (
            <div key={i} className="grid sm:grid-cols-2 gap-2 p-3 bg-[var(--color-bg)] border border-theme rounded-xl">
              <input
                value={faq.question}
                onChange={(e) => updateFaq(i, "question", e.target.value)}
                className="input-field text-sm" placeholder="Question"
              />
              <div className="flex gap-2">
                <input
                  value={faq.answer}
                  onChange={(e) => updateFaq(i, "answer", e.target.value)}
                  className="input-field text-sm flex-1" placeholder="Answer"
                />
                <button type="button" onClick={() => removeFaq(i)} className="text-red-500 hover:text-red-700 p-1 shrink-0">
                  <FaTrash size={12}/>
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <input value={newQ} onChange={(e) => setNewQ(e.target.value)} className="input-field text-sm" placeholder="New question…" />
          <div className="flex gap-2">
            <input value={newA} onChange={(e) => setNewA(e.target.value)} className="input-field text-sm flex-1" placeholder="Answer…" />
            <button type="button" onClick={addFaq} className="btn-outline px-3 py-2 text-sm flex items-center gap-1 shrink-0">
              <FaPlus size={11}/> Add
            </button>
          </div>
        </div>
        <button type="button" onClick={saveFaq} disabled={savingFaq} className="btn-primary px-6 py-2 text-sm">
          {savingFaq ? "Saving FAQ…" : "Save FAQ"}
        </button>
      </Section>
    </form>
  );
}
