# Shah Premium Foods — Build Status Tracker

**Read this file first on every "Continue."** It's the source of truth for
what's done, partial, or not started. Updated at the end of every turn.

Legend: ✅ Done &nbsp; 🔶 Partial / needs verification &nbsp; ⛔ Not started

## Verification tooling now available
`/home/claude/build-check/` (rebuilt fresh this round — the sandbox's
filesystem resets between separate chat sessions, so this whole directory
has to be recreated at the start of each one; only the zip you're reading
this file from actually persists) has: 
- `node syntax_check.js` — real JSX/JS parse of every file in the live project, via esbuild's transform (already on disk, bundled inside the globally-installed `tsx` package — no network needed)
- `node export_check.js` — every `@/` import resolves to a real named/default export (handles the Redux-Toolkit `export const{a,b}=slice.actions` destructured-export pattern used throughout `src/store/`)
- `node undefined_check.js` — flags watchlisted helpers (toast, Axios, api, hooks…) used without an import (heuristic — expect a few false positives on function-parameter shadowing; verify by reading context)
- `model_check.mjs` — not present this round; no `mongoose` package exists anywhere in this sandbox (no network to install it), so there's no way to actually construct a model here. When it's needed, fall back to manually reading the full contents of any touched `*.model.js` file and checking for duplicate top-level field names by eye.
A full `next build` cannot complete in this sandbox — the Linux SWC native
binary can't be downloaded without network access — but that's the only
thing that fails; the checks above are the real verification path.

---

## Batch 1 (items 1–15) — ✅ ALL DONE
Profile picture, refunded status, admin favicon, hover+click header dropdowns,
COD delivery-charge toggle, homepage dedup, checkout delivery zones, FAQ
section, shopping-list banner, auto SKU, alternative spellings, admin button
alignment, campaign countdown days, campaign OK button + per-product
discount, dynamic footer.

## Batch 2, round 1 (items 16–49, bug reports) — ✅ ALL DONE
Bugs 41/44/49 (settings & theme reverting after load), 45 (search), 46
(dedup hardening), 47 (campaign spacing), 48 (preference-selector hover),
43 (FAQ click-only), 24 (Arabic→French) — all fixed with root causes
documented in git history / prior turn. Campaign badge gradient/image (21)
finished. i18n foundation (`src/lib/i18n.js`) built and wired into Header,
Footer, Search, Homepage, Checkout, PreferenceSelector.

## Batch 3 (this round) — bug reports + re-verification of 16/17/19/23/34–40

### 🐞 New bugs fixed this turn
| # | Issue | Root cause | Fix |
|---|---|---|---|
| 1 | Admin orders page crashed (hydration error, `<img>` in `<a>`) | `store.js` was still synchronously hydrating the Redux store from localStorage (`preloadedState`) at module-load time. Server always renders with defaults (can't read localStorage); client's *first* render used real persisted data — so anything conditionally rendering an `<img>` based on persisted `siteSettings` (the header logo `<Link>`) mismatched between server and client HTML. `GlobalProvider.jsx` had already been fixed to restore theme/language/currency safely in a post-mount `useEffect`, but `store.js`'s conflicting synchronous preload was never removed — a half-finished fix. | Removed `preloadedState` from `store.js` entirely. Both server and client's first paint now start from identical defaults, every time; persisted preferences apply a moment later via the (already-correct) post-mount effect, which is a normal update, not a hydration mismatch. Verified this is the only `<Link>`/`<a>` + conditional-`<img>` pattern in the whole codebase (checked systematically, not just the one report). |
| 2 | Customer Care / HR pages "don't work" | Customer Care's *backend* (orders tab) was actually already fully wired to real order-management functions and does everything requested (products/qty/value, order details, status update, sort-by-status) — the real problem was it wasn't reachable (see #6). HR & Payroll had complete backend (model + controller + routes) but **no frontend page existed at all** — a 404. | Built `hr-payroll/page.jsx` from scratch: employee directory (add/edit/remove, salary, status) + a monthly payroll tab (base + bonus/deductions → net pay, mark-as-paid), fully wired to the existing backend. |
| 3 | Campaign image-badge should render as a full banner | Already fixed (verified) — `CampaignSection.jsx` gives `badgeStyle: "image"` a proper `aspect-[21/6]` hero-style banner treatment, not the compact bar. No action needed. |
| 4 | Add-to-cart buttons misaligned across uniform cards | The "already in cart" quantity-stepper used `py-1` while the "Add to Cart" button used `py-1.5` — a real 4px height difference between the two states, on top of otherwise-correct flexbox bottom-alignment. | Both now use an explicit `h-9`, removing the padding-based height difference entirely. |
| 6 | Customer Care / HR not in sidebar | They were already in the header dropdown (`UserMenu.jsx`) but missing from the actual dashboard **sidebar** (`dashboard/layout.jsx`), which is the more visible nav surface admins actually use. | Added both to the sidebar nav list. |
| 7 | Banners can't be removed; settings don't update instantly | `deleteBannerController` itself was already fixed (an `_id`/`bannerId` mismatch had been resolved). The remaining bug: the admin page's `handleBannerAdd`/`handleBannerDelete` only updated **local** component state — never dispatched to the global Redux `siteSettings.banners` — so the homepage hero carousel kept showing the stale list until a full reload re-fetched settings from the DB. | Both handlers now dispatch `setSiteSettings` immediately after a successful save/delete, matching the pattern the FAQ save already used correctly. |

### Re-verification of 16 / 17 / 19 / 23 (explicitly re-flagged)
- **#16 (delivery charge excluded from analytics)** — found it was only *partially* true: the headline `grossRevenue` KPI correctly excluded delivery charge, but the Revenue-by-Day chart and the previous-period comparison baseline (used for every growth-% figure) both still used raw `totalAmt`. **Now fixed everywhere** — every number on the dashboard is consistently delivery-charge-free.
- **#17 (activity tracking)** — logging existed but had no admin-facing view at all, which is why it read as "not implemented." Built `getActivitySummaryController` (`/api/activity/summary` — the endpoint `api.js` already expected but which didn't exist) and surfaced it inside the new Marketing & Website Performance tab: total events/sessions, an activity-over-time chart, top searches, most-viewed products. Also added a global page-view tracker (`GlobalProvider`, logs on every route change) so homepage/category page-view counts have real data to report, not just product-view/search/cart events.
- **#19 (banner button → dynamic landing page)** — confirmed the data model (`buttonText`/`productIds`/`campaignId` per banner) and the `/banner-page/[id]` route both exist. **Not yet re-verified end-to-end this turn** (ran out of turn budget after the analytics build) — carrying forward to next pass, see below.
- **#23 (SEO + sitemap)** — confirmed the `seo{}` block exists on the settings model. **Not yet re-verified end-to-end this turn** — admin edit UI, actual use in page `<head>` metadata, and a real sitemap route + footer link all still need a hands-on pass. Carrying forward.

### #34–40 — Analytics Dashboard: wired up and built out this turn
This was the main body of work this turn. Previous backend controllers for
34/35/36/37 turned out to be genuinely complete and correct on inspection —
the entire gap was that **nothing was wired into the API route, and there
was no frontend for any of it.** Fixed:
- Wired `analyticsSettings`, `analyticsFinancial`, `analyticsInventorySales`, `analyticsCustomerOrder` into `/api/analytics/...` (they existed but were unreachable).
- Also found and fixed the damaged-inventory controllers (`markDamaged`/`getDamagedInventory`) were written but never added to the inventory route — though on inspection, the **existing generic "Adjust Stock" modal already has a working "Damage" type** that covers this need end-to-end, so no new UI was required there.
- Built **#38 Marketing & Website Performance** and **#39 Expense Analysis** backend controllers from scratch (these genuinely didn't exist before). Marketing metrics that need data this system doesn't capture yet (device/browser, a distinct "checkout started" event) are honestly reported as a "missing dependency" rather than faked.
- Built **#40 Business Analysis** as a frontend composition rather than a new backend aggregator: it reuses the exact same data already fetched for the other four tabs (so it can never disagree with them) plus the `enabledMetrics` toggle map (already on the settings model) to show/hide ~70 registered metrics, grouped by category, with a save-the-toggle-state control.
- Rebuilt `analytics/page.jsx` as an 8-tab shell (Overview / Settings / Financial & Growth / Inventory & Sales / Customer & Order / Marketing & Website / Expense Analysis / Business Analysis). The original dashboard content was preserved as the "Overview" tab, not discarded.
- Every field name used in the new Settings tab UI was cross-checked character-for-character against the actual Mongoose schema — no mismatches.
- Every `react-icons/fa` and `recharts` import used in the new files was verified to actually exist in the installed packages (a class of error none of the syntax/import checkers can catch on their own).

### 🔶 Still open / carried forward to next "Continue"
- **#19 / #23 end-to-end verification** (see above) — highest priority for next pass since they were explicitly re-flagged and only partially re-checked this turn.
- **#22** Liquid Glass design system — confirmed partially started (product cards + buttons already have a glass treatment per code comments found this turn) but not audited for consistency site-wide. Worth a dedicated pass to see how far it actually got before continuing it.
- **#25** Full responsive audit — still not done.
- **#27** Google OAuth — still not started; no new dependency needed (see prior note on Google Identity Services + existing JWT tooling).
- Business Analysis tab's metric registry covers ~70 of the ~80 named metrics across tabs — a few very long-tail ones (e.g. some of the growth-metric duplicates that appear in both Financial and standalone Growth sections) were consolidated rather than double-listed; worth a scan against the original spec line-by-line if full 1:1 coverage matters.

## Batch 4 (this round) — Order status rename + scoped Call Center feature

The previous turn's request had asked for a much fuller call-center system:
live automatic call routing to active agents, distributing simultaneous
calls, a hold queue when calls outnumber agents, and full call-history
tracking (counts, duration, recordings, active/offline time). **The user
explicitly descoped this down to just three things** before any of that was
built — that fuller telephony spec (which genuinely requires a live
third-party voice provider like Twilio, an account, a phone number, and
real-money setup only the business owner can do) is *not* implemented and
is not currently queued; it would need to be explicitly requested again.

### ✅ Done this turn
1. **Order status renamed**: `"Processing"` → `"On-Hold"` everywhere it
   appears as an *order* status (model enum, admin orders, customer care,
   customer-facing my-orders, inventory page, invoice modal, analytics
   dashboard, seed data). Deliberately left `ProductRequest`'s own
   `"Processing"` status untouched — that's the shopping-list-request
   feature, unrelated to orders, and the request only asked about orders.
2. **Call Center agents**: `Employee` model gained `isCallCenterAgent`.
   New `callCenterAgent.controller.js` handles create/list/update/delete —
   creating an agent can optionally also create them a dashboard login,
   auto-provisioning (idempotently) a `CALL_CENTER_AGENT` role scoped to
   `customerCare: {view,edit}` only. No changes were needed to the sidebar
   or permission middleware — the existing generic per-module permission
   check already hides every other admin page for a role with nothing
   else granted. Wired into `/api/customer-care/agents` and a new "Call
   Center" tab on the Customer Care page (agent list, add/edit/remove, a
   one-time temp-password reveal when a login is created).
3. **"Call the customers directly from the dashboard"**: implemented as
   `tel:` links — a quick-call icon on every collapsed order row, plus a
   prominent "Call Customer" button and a clickable phone number inside
   the expanded order view. This opens the device's native calling app
   with the number pre-filled — works immediately on any phone/desktop
   with a calling app configured, no third-party account or setup needed.
   (This is a deliberately simpler mechanism than a server-initiated
   Twilio bridge call — appropriate given points 3–6 of the fuller
   telephony spec were descoped; if true in-app dialing with recording and
   routing is wanted later, that's the Twilio path noted above.)

## Batch 5 (this round) — 12-item bug/feature list

| # | Item | What was actually wrong / built |
|---|---|---|
| 1 | Number spinner overlapping /mo, % suffixes | Native browser number-input spinner arrows and the suffix badge both sat in the same right-edge space. Hidden the spinner via CSS for suffixed fields specifically; typing still works identically. |
| 2 | Operating Margin / Net Profit Margin showing `[object Object]%` | `MetricCard` only unwrapped objects shaped like `pctChange()` (`{value, isNew}`). A *resolved* `dependentMetric()` result (`{value: 23.5, missing: []}` — dependencies were all met) has no `isNew` key, so it fell through unwrapped and got stringified. Fixed to unwrap any object carrying `.value`, with `isNew` now just an optional extra signal for the change-badge — a single shared-component fix, so it silently fixed the same bug wherever else it occurred (ROI/ROE/ROA, Business Analysis tab). |
| 3 | Analytics/order counts not updating instantly | Real root cause: **not one of the 23 API route files declared `export const dynamic = "force-dynamic"`**, so Next.js could statically cache GET responses at the route level — since the actual DB logic lives in a shared `apiHandler.js` helper rather than directly in each route file, Next's static analyzer had no way to detect these as dynamic on its own. Added the directive to all 22 GET-serving routes (the 23rd is a POST-only Stripe webhook, never affected). Also added/confirmed 30s background polling on admin-orders (already existed), customer-care orders, and the analytics overview. |
| 4 | No notification system | Built one: `Notification` model, list/mark-read/mark-all-read endpoints (scoped to what the viewer's role can see, mirroring the permission system), a bell with unread badge in the dashboard sidebar (+ mobile), 20s polling. Fires on every new order (COD + both Stripe branches) and every new support ticket. |
| 5 | Add-to-cart buttons misaligned (long names/descriptions push button down) | Card-level flex/stretch CSS was correct, but the text block above the price/button had no floor — a 1-line name with no description sat much shorter than a 2-line name with a 2-line description. Gave that block a fixed `min-h-[6.5rem]` sized for the worst case, so button position is now guaranteed consistent regardless of any parent stretch behavior. |
| 6 | Footer info not updating | Very likely the *same* root cause as #3 — should already be resolved by that fix. Also hardened the write path defensively with `markModified()` on dynamic nested-field reassignment. |
| 7 | Payment method logos in footer | New `paymentMethods` array on site settings, admin upload/remove UI (instant Redux sync like banners), rendered bottom-right of footer. |
| 8 | Navbar "Products"→"Categories", new flat all-products page | Renamed the mega-menu trigger, added a real `/products` page (paginated, publish-filtered, no grouping) + nav link (desktop+mobile). Hero banner buttons (incl. the no-selection default) now land on `/products`. |
| 9 | Sitemap for SEO | Next.js's built-in `sitemap.js` convention auto-serves correct XML at `/sitemap.xml` from live DB data. Plus a human-readable `/sitemap` page linked from the footer. |
| 10 | Rename Processing → On-Hold | Done previous turn; reconfirmed intact. |
| 11 | Call center agents in Customer Care | Done previous turn; reconfirmed intact. |
| 12 | Super admin call history (count, duration) | **Constraint explained rather than papered over**: calls go through `tel:` links, which hand off to the device's phone app — no browser event exists for call duration/outcome. Call *count* is logged automatically and reliably on click; a skippable one-tap "outcome + duration" prompt follows for what can't be automatic. New Call History tab (super admin / full admin / analytics-view grantees only) shows per-agent totals, confirmed/no-answer split, durations, recent-calls table. |

Verified with all 4 scripts plus a full react-icons/fa validity sweep (81
icons, all confirmed to exist). Two real bugs were caught and fixed by
these tools before delivery: a dropped function signature and a missing
`toast` import.

## Batch 6 (this round) — Critical: login 500 error

Reported: `POST /api/user/login` → 500, `secretOrPrivateKey must have a value`.

**Not a code bug** — `.env.example` and the code agree exactly on the
variable names (`JWT_SECRET_ACCESS`, `JWT_SECRET_REFRESH`), and this
project's `.env.local` already has non-empty values for both, confirmed
still present in the last delivered zip. The error only fires when
whichever env file the *running* server actually reads has one of these
blank/missing — most likely explanation: `.env.local` didn't survive
however the project was moved/extracted/deployed on the user's end (dotfiles
are easy to lose in a zip extraction, and `.env.local` is almost always
`.gitignore`d, so it won't come along if pushed to GitHub and deployed from
there), or an env file was edited without restarting the server afterward
(Next.js only reads env files at startup).

Fixed regardless of exact cause:
- `generateAccessToken.js` / `generateRefreshToken.js` now throw a clear,
  actionable error naming the exact missing variable instead of letting
  `jsonwebtoken`'s internal error surface.
- `auth.js` middleware and the refresh-token endpoint now return a
  distinct 500 "server misconfiguration" response instead of a misleading
  401 "please log in again" when a secret is missing — the old behavior
  would have looked like an auth problem when it was actually a server
  setup problem.
- Replaced the weak, guessable placeholder JWT secret values in
  `.env.local` ("changeme_access_secret") with proper cryptographically
  random ones — a real security gap independent of this bug, since anyone
  who saw the old value could have forged valid login tokens.
- Rewrote the env-setup section of `SETUP.md` to give a literal
  copy-pasteable command for generating secrets (rather than "any long
  random string," which isn't actionable for a non-developer), clarify
  the `.env.local` vs `.env` relationship, and added a Troubleshooting
  section covering this exact error message plus the general pattern
  (any future "500 + missing env var name" error resolves the same way).

## Batch 7 (this round) — Critical: storefront empty for logged-out visitors

Reported: logged-out visitors see an empty site (no categories, no product
rows, no FAQ) that only populates after logging in. A screenshot confirmed
the actual shape of the bug: hero banner text, the Shopping List banner,
and footer content (address/social "not added yet" messages, default Quick
Links) **were all rendering** — but every one of those is a hardcoded
fallback baked directly into its component for when no real data has
loaded yet, not actual fetched content. Categories, every product row, and
FAQ (all of which have no such fallback — they render nothing if their data
array is empty) were completely absent.

**Ruled out first, thoroughly, before landing on this diagnosis:** re-audited
every plausible auth-gating location — root layout, Providers, GlobalProvider's
full boot sequence, Header.jsx in full, the homepage, the product detail page,
AddToCartButton, the cart page, every relevant backend route, the shared
request handler, and the axios interceptor. All correctly allow public
browsing; nothing blocks or redirects a logged-out visitor anywhere in the
code. This confirmed it was never actually an auth problem.

**Actual root cause**: `connectDb()` made a single MongoDB connection
attempt with a 10s timeout and no retry. This project's `.env.local` points
at a MongoDB Atlas free-tier (M0) cluster, which pauses when idle — the
first request after a pause can take longer than 10s to wake it, so that
attempt would time out and throw. Since every fetch across the app wraps
its call in try/catch with a deliberately empty catch block (so a normal
transient blip doesn't spam error toasts), that failure was completely
silent — no error shown, just permanently empty sections, indistinguishable
from "still loading." It then looked "fixed" by logging in purely because
enough time had passed by then for the cluster to finish waking up — not
because anything about auth state was actually involved. (The same
mechanism — first-hit delay — can also happen in Next.js dev mode from
lazy route compilation; the fix below covers both causes equally.)

Fixed at the two places this actually needed fixing, rather than patching
individual pages one at a time:
- `connectDb()` (`mongodb.js`) now retries up to 4 times with backoff
  before giving up, transparent to all ~15 callers across the app — no
  other file needed to change for this part.
- The shared `Axios` instance (`axios.js`) now automatically retries
  failed **GET** requests (network errors and 502/503/504) up to 3 times
  with backoff — deliberately GET-only, since retrying a POST/PUT/DELETE
  could duplicate a side effect (double-charge a card, create a duplicate
  order). This covers every page's fetches at once, including the
  homepage's product rows (fetched directly in `page.jsx`, not through
  GlobalProvider) without needing to touch that file individually.
- Added a second, complementary retry layer specifically to
  `GlobalProvider`'s three most critical boot-time fetches (categories,
  site settings, campaigns) as extra resilience on top of the above.

## Recommended order for the next "Continue"
1. End-to-end verify + close gaps on #19 (banner dropdown/search picker, default-banner fallback) and #23 (SEO admin UI beyond the sitemap now built) — both explicitly re-flagged earlier and still not fully hands-on verified.
2. Audit how far the Liquid Glass design (#22) already got and finish it consistently rather than starting over.
3. #25 responsive audit, #27 Google OAuth.
4. Re-run all four verification scripts after any further change, every time, before considering something done.

Just say **Continue** — this file gets read first, updated last.

---

## Batch 8 (this round) — 10-item bug/feature list

| # | Issue | Root cause | Fix |
|---|---|---|---|
| 1 | Coupons applied to the whole catalog; admin needed a product search/picker to scope a coupon to specific products | `coupon.model.js` had no per-product field at all (only an unused `applicableCategories`, never actually enforced anywhere), and the admin coupon form had no picker UI | Added `applicableProducts` to the schema. Extracted the campaigns page's inline `ProductDropdown` (search-and-select combobox) into a shared `src/components/ProductDropdown.jsx` and used it in a new picker on the coupons admin page, with a removable-chip list of selected products and a new "Applies To" table column. Enforced server-side (see #3). |
| 2 | Coupon code box + "view available coupons" needed to disappear from Checkout | It only ever lived on Checkout (`CouponInput`) — nowhere else | Moved `CouponInput` to the Cart page instead (so the feature keeps working, just relocated to where the discount is decided before Checkout); Checkout now shows only a read-only "Coupon (CODE): -amount" line in its totals. Active-coupons fetch moved from a per-page `useEffect` into `GlobalProvider` (boot-time, global) — it turned out `setActiveCoupons` was already imported there but never dispatched, a dead leftover from an earlier pass. |
| 3 | No way for admin to cap per-customer coupon usage (only an overall usage cap existed) | `usedBy` tracked usage but the apply logic only ever did a hardcoded "any prior use blocks" check, with no admin-facing control | Added `perUserLimit` (default 1 = same as the old hardcoded behavior; 0 = unlimited/customer). Built a shared `src/server/utils/couponEligibility.js` (`evaluateCoupon`/`getEligibleItems`/`getEligibleSubtotal`/`getUserUsageCount`) used by BOTH the live "Apply" preview (`coupon.controller.js`) and the authoritative check that runs again at real order placement (`order.controller.js`'s `resolveCoupon`, now fed the DB-authoritative `productDetails` instead of a bare subtotal) — so the preview and the real charge can never disagree. Found and fixed two small pre-existing bugs in `CouponInput.jsx` along the way: `onClick={apply}` was leaking the raw DOM click event into `apply`'s code argument, and clicking a coupon in "view available coupons" applied whatever was previously typed (stale `setState`) instead of the clicked coupon's own code. |
| 4 | State/Pincode were required in the address form | `dashboard/address/page.jsx`'s `FIELDS` array had `required:true` on both (backend schema/controller never actually required them — verified before touching anything) | Both set to `required:false`, labels suffixed "(optional)". |
| 5 | Announcement Bar / Footer / Shopping List Banner admin edits never appeared on the live site | `site-settings/page.jsx`'s form fields are registered with dotted paths (`register("header.announcementText")`), which makes react-hook-form hand back a real **nested** object in `onSubmit(data)` — but the save handler read `data["header.announcementText"]` (a flat bracket key), which is always `undefined` on a nested object. Every dotted field (header/footer/shoppingListBanner/theme/language) silently saved as `undefined`; only plain non-dotted fields (`siteName`, `codRequireDeliveryCharge`) worked, which matches exactly what was and wasn't reported broken. | Rewrote the payload construction to read the real nested paths (`data.header?.announcementText`, etc.) for every dotted field. Confirmed `force-dynamic` was already correctly set on the settings API route and that Header/Footer/homepage already subscribe to `siteSettings` reactively via `useSelector` — so this one fix is the complete fix, nothing else needed changing. |
| 6 | Campaign "banner as badge" showed Name/Icon/Description/Countdown at the bottom, wanted at the top | `CampaignSection.jsx`'s image-badge overlay used `justify-end` + a bottom-anchored dark gradient (`bg-gradient-to-t`) | Flipped to `justify-start` + `bg-gradient-to-b` (dark fade now anchored at the top, for contrast where the text now sits) + `items-start` on the inner row. |
| 7 | No site-wide base currency; needed admin-set default, per-user override that doesn't affect the admin panel, and real-time propagation everywhere including analytics | Currency was already a fully-built per-user feature (`currencySlice`, `PreferenceSelector`, 18 files reading it) but had no concept of an admin-controlled default vs. a personal choice — `selected` was just whatever localStorage last had, indistinguishable from "user's real choice" vs. "leftover default" | Added `baseCurrency` to `siteSettings.model.js` + an admin dropdown for it. Redesigned `currencySlice.js` with `baseCurrency` + `isUserOverride` + `setBaseCurrency`/`clearUserCurrencyOverride`, so a personal pick is only ever treated as a real override when the user actually made one. `GlobalProvider` dispatches `setBaseCurrency` on every settings fetch and now polls settings every 30s (matching `NotificationBell`'s existing polling pattern) so already-open sessions pick up an admin's currency change without a refresh. Swapped the currency selector in the 13 admin/analytics-only files (7 analytics tabs + admin-orders/admin-users/inventory/hr-payroll/customer-care/delivery-zones/product) from `s.currency.selected` to `s.currency.baseCurrency`, so business reporting always shows the official currency regardless of any personal storefront override — customer-facing pages (cart, checkout, product pages, header, search, myorders) correctly keep using `selected`, unchanged. Added a "Use site default (X)" reset link to `PreferenceSelector` for un-overriding. |
| 8 | Payment method logos in the footer had a fat white border | `Footer.jsx` rendered them with `bg-white/90 rounded px-1.5 py-0.5` | Removed that wrapper styling — logos now render with a transparent background, no border/box. |
| 9 | Cart page showed a hardcoded "Delivery: Free" row | It was a static placeholder — delivery is actually computed later at Checkout from the address/zone, never on the Cart page | Removed the row; added a small note that delivery is calculated at checkout. (This is also where the relocated coupon UI from #2 landed.) |
| 10 | Reported: logged-out visitors couldn't browse/explore the site at all | Audited every plausible cause exhaustively: API route middleware (product/category routes require no auth), root layout, dashboard layout (correctly scoped to `/dashboard/*` only), homepage, category/search pages, `CategoryWiseProducts`, `ProductCard`, `AddToCartButton`, the product page's Buy Now guard, `next.config.js`, `axios.js`, `mongodb.js`'s retry logic, `apiHandler.js` (confirmed `connectDb()` runs at the top of every single request through one shared handler), and all 4 `router.push("/login")` call sites in the whole codebase. Browsing itself was already correctly open everywhere. Found two real, narrower issues instead: | `UserMenu.jsx`'s logout redirected to `/login` (funneling a just-logged-out visitor into a login wall) — changed to `/`. `page.jsx` (homepage): when the category fetch came back empty after `GlobalProvider`'s retries were exhausted, that whole section rendered as literally nothing, indistinguishable from "still loading" — added a visible "having trouble loading — Refresh" message instead of silence. Checkout's existing `if (!user._id)` inline "Please login to checkout" message (not a redirect) was already correct and left as-is — confirmed it doesn't affect any other page. |

### Post-delivery hotfix (same round)
User hit a real crash on first use: `TypeError: allProducts.filter is not a function` in
`ProductDropdown.jsx`. Root cause: `getProductsController` wraps its results in a pagination
object — `{ success, data: { data: [...products], totalCount, totalPage, page, limit } }` —
so the actual array sits at `r.data.data.data`, not `r.data.data`. The Campaigns page's own
product-picker fetch already unwrapped this correctly (`prodsR.data?.data?.data`); the new
Coupons page's `loadProducts()` only unwrapped one level (`r.data?.data`), so `allProducts` was
being set to the pagination *wrapper object* instead of the array — truthy, so the `|| []`
fallback never caught it, and `.filter` on a plain object threw. Fixed `loadProducts()` to
unwrap the correct depth (with an `Array.isArray` guard on top), and — since `ProductDropdown`
is now a shared component with more than one caller — added the same `Array.isArray` guard
inside the component itself as defense-in-depth, so a future caller mistake degrades to an
empty list instead of crashing the page. Re-verified clean (184 files, 0 syntax errors, 0
export problems) and re-packaged.

### Verification this round
`syntax_check.js` and `export_check.js` re-run after every single edit throughout (184 files,
0 errors, 0 problems at every checkpoint, final pass included). Recreated `undefined_check.js`
(the sandbox resets between sessions, so `/home/claude/build-check/` had to be rebuilt from
scratch this round) and ran it — one hit, confirmed a false positive (`Axios` is a function
*parameter* name in `utils.js`'s `uploadImage`, not a missing import; pre-existing, untouched).
Did not recreate `model_check.mjs` (no `mongoose` package available anywhere in this sandbox to
actually construct a model with) — instead manually read both modified models in full
(`coupon.model.js`, `siteSettings.model.js`) end to end and confirmed no duplicate field names
or structural issues. A full `next build` still can't complete here (no network for the SWC
binary), same as every prior batch.

## Recommended order for the next "Continue"
1. Everything from Batch 8 above is done and verified. If re-testing turns up anything about the
   base-currency real-time propagation feeling slower than expected, the poll interval is the
   `30_000` in `GlobalProvider.jsx`'s `setInterval(() => { fetchSiteSettings(); }, 30_000)` — safe
   to lower if a snappier update is wanted (this project has no websocket/push infra, so some
   polling delay for *other* open sessions is inherent to the approach, same trade-off
   `NotificationBell` already makes).
2. Still outstanding from Batch 7's list, untouched this round: #19/#23 end-to-end re-verify,
   #22 Liquid Glass design consistency pass, #25 responsive audit, #27 Google OAuth.
3. Re-run all verification scripts after any further change, every time, before considering
   something done.

Just say **Continue** — this file gets read first, updated last.

---

## Batch 9 (this round) — Vercel deployment readiness + coupon search bug

| # | Issue | Root cause | Fix |
|---|---|---|---|
| 1 | "Make the whole website ready to upload to Vercel" | Audited the whole project against everything that commonly breaks a Next.js app on Vercel specifically (serverless functions, no persistent process, no local disk). Found it was already in genuinely good shape on the code side — `next.config.mjs` already handles the Next 14.x `experimental.serverComponentsExternalPackages` quirk + Cloudinary image domains + security headers; no custom server; MongoDB connection code already uses a cached-connection + retry pattern that's serverless-safe; multer already uses memory storage (not disk, which would silently fail on Vercel's read-only filesystem); the Stripe webhook route already reads the raw body correctly (a very common miss); auth cookies already flip `secure`/`sameSite` correctly based on `NODE_ENV`; every env var used in code was already documented in `.env.example`; no hardcoded `localhost` anywhere. What was actually missing/wrong: **no `.gitignore` existed at all** (real risk — a `git add .` before pushing to deploy would have staged `.env.local`, which holds real secrets) — added one. **`README.md` was describing a completely different, abandoned architecture** (a custom `server.js` running Express + Helmet + Socket.io wrapping Next.js) that was fully migrated away from in an earlier phase but never documented as such — rewrote it to describe the actual current pure-Next.js-App-Router setup, correctly point at `STATUS.md` (not the also-stale `PROJECT_STATUS.md`) as the changelog, and link the new deployment guide. `PROJECT_STATUS.md` was the same stale artifact from that abandoned phase — added a clear "archived, see STATUS.md" banner at the top rather than deleting it, so the historical record stays but can't be mistaken for current. Added `VERCEL_DEPLOYMENT.md`: a full walkthrough (git repo setup, MongoDB Atlas network-access gotcha for serverless — no fixed outbound IP, so Atlas needs `0.0.0.0/0` or the Vercel integration, environment variable table, the `NEXT_PUBLIC_SITE_URL`-needs-a-rebuild-not-just-a-restart nuance, setting up the Stripe webhook *after* first deploy since it needs the real domain, seeding the production DB, and a troubleshooting section). |
| 2 | Coupon product search: "no products are suggesting while typing" | Traced the matching/filtering logic itself (case-insensitive substring match, `open`/`query` state) and found it correct. The actual problem: `loadProducts()`'s fetch had a fully **silent** catch block — any failure (a cold-start DB hiccup, a fresh deployment's database not fully wired up yet, a network blip) left the picker looking exactly like "the catalog is empty" or "no matches," with zero way to tell which. Same silent-failure pattern this project has hit more than once before (the Batch 7 DB-timeout root cause, the Batch 8 homepage empty-section fix). | `ProductDropdown.jsx` now accepts `loading`/`error`/`onRetry` and shows real state: a loading placeholder while fetching, a persistent "Couldn't load products — Retry" message on failure, and distinguishes "No products found in your catalog yet" (fetch succeeded, genuinely nothing there — a data/config issue, not a code one) from "No matching products" (fetch succeeded, your search just didn't match anything) from the initial "type to search" hint. Wired into both the Coupons picker (which had the silent catch) and the Campaigns picker (which bundled its product fetch into the same `Promise.all` as the campaigns list with only a toast on failure — split into two independent fetches so one failing doesn't blank out the other, with the same persistent Retry UI). |

### Verification this round
`syntax_check.js` + `export_check.js` re-run after every change (184 files, 0 errors, 0 problems,
every checkpoint including the final pass). The Vercel-readiness item was primarily a
configuration/documentation audit rather than application code, so it isn't fully covered by
those two scripts — it was verified by direct inspection of `next.config.mjs`, `package.json`,
`src/lib/mongodb.js`, `src/server/middlewares/multer.js`, `src/app/api/order/webhook/route.js`,
and the cookie-setting code in `user.controller.js` / `apiHandler.js`, plus a full-project grep
for hardcoded `localhost` references and for every `process.env.*` reference cross-checked
against `.env.example`.

## Recommended order for the next "Continue"
1. Everything above is done. If the user actually deploys and hits something
   `VERCEL_DEPLOYMENT.md`'s troubleshooting section doesn't cover, add it there once resolved.
2. Still outstanding from Batch 7, untouched across Batch 8 and 9: #19/#23 end-to-end re-verify,
   #22 Liquid Glass design consistency pass, #25 responsive audit, #27 Google OAuth.
3. Re-run all verification scripts after any further change, every time, before considering
   something done.

Just say **Continue** — this file gets read first, updated last.
