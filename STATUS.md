# Shah Premium Foods — Build Status Tracker

## Batch 23 — Demo Admin role, dropdown/sidebar overhaul, Wishlist, Employee sub-types, profile consolidation

Full session working from a detailed 3-part spec (roles incl. a simulated
Demo Admin; dropdown+sidebar restructuring into 6 categories with a new
overview homepage; Wishlist + profile consolidation). Investigation and
planning tracked live in `PROGRESS_TRACKER.md` at the repo root — kept
open and updated after every step specifically so this could survive
being picked up across multiple separate sessions; leaving it in place
rather than deleting it, since its "finalized design decisions" section
is a useful map of *why* things ended up shaped the way they did, beyond
what fits comfortably in this changelog entry.

**Demo Admin — the core mechanic.** New `DEMO_ADMIN` role whose RoleModel
permissions are a full copy of SUPERADMIN's (so it passes every
permission check exactly like a real admin would — the goal is that it
can attempt literally anything). The actual "don't really do it" logic
lives in exactly one place: `src/lib/apiHandler.js`, the single function
every API route in this app already funnels through. Right before the
real controller would run, if the resolved caller role is DEMO_ADMIN and
the HTTP method isn't GET/HEAD/OPTIONS, the request is short-circuited
into a simulated `{success:true, isDemoAction:true, message, data:
{...echoedBody, fakeId, timestamps}}` response — the real controller,
and therefore the database, is never touched. Role resolution doesn't
trust whichever permission middleware happened to run (many routes,
e.g. cart/address/wishlist, only use bare `auth`) — it does its own
one-off indexed lookup keyed off `userId` when needed, so the guarantee
holds on every route uniformly, not just the ones with a
`checkPermission` call in their chain. `axios.js` has a matching response
interceptor that notices `isDemoAction` on any response and fires a DOM
event; `components/DemoModeNotice.jsx` (mounted once in Providers.jsx)
is the only thing that listens for it and shows the popup the spec asked
for, built on the Toaster this app already had rather than a new overlay
system. This means zero of the hundreds of individual "create/edit/
delete" call sites across the app needed to change at all.

Sensitive-data handling: Audit Log stays on the pre-existing, stricter
`superAdminOnly` middleware (a new `superAdminOrDemo` variant was added
for the rest of Roles & Staff, which Demo Admin can browse/attempt) —
deliberately genuinely inaccessible rather than shown-and-simulated,
since a real trail of other people's activity isn't "functionality" a
demo tour should surface. New `server/utils/demoMask.js` redacts
salary/bank-account/customer-email/customer-phone fields server-side
(never sent over the wire, not just hidden in the UI) across HR &
Payroll, the Customers list/detail/CSV-export, and Customer Care
tickets — the CSV export mattered most here, since it's a GET/download
untouched by the write-blocking layer and would otherwise have been a
complete, real PII leak into a downloaded file. Deliberately deferred:
Site Settings' IP whitelist (that endpoint is genuinely public/
unauthenticated by design, sitewide-cached; no cheap way to know the
caller's role there without new infrastructure, judged lower severity
than the above) and second-level nested `populate()`d fields (e.g. a
ticket's populated `userId.email` vs. its own top-level `customerEmail`).

Found and fixed a real, pre-existing, unrelated-until-now bug while
building this: `role.controller.js`'s `FULL_PERMS()` helper — used for
both SUPERADMIN and ADMIN's default permission sets — never included the
`customerCare`/`hrPayroll` modules (added to the Role schema in a later
batch than this helper, apparently never backfilled here). Mongoose's
schema default silently filled both in as `false`, meaning ADMIN could
see the Customer Care and HR & Payroll links in the old flat sidebar but
would've been denied inside them the whole time. Fixed, plus a migration
`updateOne` so it's corrected even on an already-seeded database, not
just fresh installs.

**Dropdown + sidebar + overview homepage.** `UserMenu.jsx`'s ~15-link
`ADMIN_MENU` dump replaced with exactly one role-appropriate entry
("Go to Super Admin Dashboard" / "Go to Admin Dashboard" / "Go to
Dashboard"); base menu is now My Profile / My Orders / Submit Shopping
List / Wishlist. `dashboard/layout.jsx`'s flat 17-link `ADMIN_LINKS`
regrouped into exactly the six named categories (Products, Analytics,
Customer care and call center, Website Maintenance, HR and Payroll,
Security and permissions), each a collapsible section open by default.
Every role sees only the categories/links its own permissions actually
cover — same `canSee()` mechanism as before, just reorganized, plus a new
`hasFullDashboardAccess()` helper (Super Admin OR Demo Admin) used for
the "sees everything" gate everywhere except the one deliberately-strict
Audit Log check. New `dashboard/page.jsx` (this route 404'd before — it
didn't exist) is the requested overview homepage: one card per visible
category with a couple of cheap live counts each, backed by a new
`getOverviewStatsController` that resolves the SAME per-role visibility
rules server-side so nobody ever sees a card for a section they can't
actually open. This page also functions as the mobile navigation hub,
since the categorized sidebar remains desktop-only (`hidden md:flex`,
unchanged) and the dropdown is now down to one link — an accepted,
explicit trade-off of the "one link" requirement, not a regression (a
full mobile drawer nav was out of scope).

**Wishlist**, built from nothing (confirmed via grep — no model, no API,
no UI existed anywhere): `wishlist.model.js` (userId+productId, unique
compound index), `wishlist.controller.js` (get/add/remove/toggle),
`store/wishlistSlice.js`, wired into `GlobalProvider.jsx`'s boot fetch
alongside cart/address/orders. New shared `components/WishlistButton.jsx`
(floating variant on ProductCard, inline variant on the PDP purchase
panel) intentionally tracks its own optimistic state from what it just
clicked rather than trusting the API response's `wishlisted` field to
always be present — a Demo Admin's toggle is intercepted centrally and
comes back as a generic echoed response with no such field, so relying
on the response shape would've silently broken the heart icon
specifically in demo mode. New `dashboard/wishlist/page.jsx` reuses
ProductCard directly for its grid, so the already-filled heart button
doubles as the removal control for free.

**Employee sub-types** ("HR, Call center agent, and others which Super
Admin, HR, Admin can add"): Call Center Agent already had its own
dedicated provisioning flow (`callCenterAgent.controller.js`) — left
untouched except for one bug fix (see below). Added the equivalent for
the rest: new `HR` system role, and `hrPayroll.controller.js` gained
`createEmployeeWithLoginController`, whitelisted to exactly
`{HR, MANAGER, STAFF, ANALYST}` (never ADMIN/SUPERADMIN/DEMO_ADMIN — this
endpoint can only ever attach an *existing* permission-scoped role, never
grant elevated access or invent a new one). Surfaced in the HR & Payroll
page's existing Add Employee modal as a "also create a dashboard login"
checkbox; shows a one-time credentials panel afterward (the temp
password genuinely can't be retrieved again) — explicitly skipped when
the response is a Demo Admin simulation, which has no real password to
show.

While reading `callCenterAgent.controller.js` closely enough to mirror
its pattern safely, found it calls `crypto.randomBytes()` for temp-
password generation with `crypto` never imported anywhere in the file —
Node's bare global `crypto` is the Web Crypto API, which has no
`.randomBytes` (that's the separate `node:crypto` module, imported
correctly elsewhere in this same codebase). Would have thrown the moment
anyone created a call center agent with a login and no custom password
typed in. Fixed.

**Profile consolidation**: extracted the old standalone address page's
body verbatim into `components/AddressBook.jsx` (new optional
`showHeading` prop); the old `/dashboard/address` route still works
(kept for bookmarks) as a 9-line wrapper around the shared component.
`dashboard/profile/page.jsx` rewritten as three tabs — Profile Info
(unchanged), Addresses (the shared component), Security (the existing
2FA + Sessions sections, unchanged, just grouped under a tab instead of
stacked on the page).

**One more gap found during a final security re-read of the interception
logic**: `POST /api/customer-care/create` (submit a support ticket)
intentionally has no auth middleware at all, so a Demo Admin's identity
never reached apiHandler.js on that specific route — a ticket submitted
through it would have actually been written for real. Fixed with a new
`optionalAuth` middleware (identifies the caller when a token's present,
never rejects when one isn't) applied to just that route — anonymous
ticket submission still works exactly as before for everyone else; a
logged-in Demo Admin is now correctly intercepted like on every other
route. Small bonus: this also means a logged-in (non-demo) customer's
ticket now gets correctly attributed to their account instead of always
being anonymous, which it never did before.

Two more pre-existing documentation-staleness bugs fixed while updating
credentials docs for the new seeded roles: README's roles list still said
"MODERATOR, EMPLOYEE" (renamed to MANAGER/STAFF in an earlier batch, this
line never updated); SETUP.md's seed instructions listed
`admin@shahpremiumfoods.com`/`Admin@123` as the created superadmin
account — that email doesn't match anything in the actual `demoUsers`
array (the real one is `superadmin@shahpremiumfoods.com`/`Super@123`).

Verification: no npm/build tooling available in this sandbox (no network
access, no project node_modules) — used the globally-available
TypeScript compiler as a syntax-error checker instead (`allowJs`,
`checkJs:false`, `jsx:"preserve"`, `noEmit`), verified against both clean
and deliberately-broken files first. Every touched/created file (39
total) syntax-checked individually as it was written, then all together
in one final combined pass — clean. Every new cross-file import checked
against its actual export line by hand, not just assumed.



**Hero banner revert (user-reported regression from Batch 21)**: user said
the aspect-[4/3] redesign wasn't as good as the original aspect-[3/1].
Reverted to the exact original classes/sizing — but computed via
Tailwind's actual default line-heights that the original had a genuine
clipping risk at common phone widths (content needs ~144px, aspect-[3/1]
alone only reaches that above ~430px width). Fixed with min-h-[180px]
added ALONGSIDE aspect-[3/1] (not replacing it) — a pure floor that only
activates below ~540px width; above that, and at every width where the
original already worked fine, the banner is now pixel-for-pixel what it
was before. Also added defensive line-clamp-2 on slide title (previously
unclamped — a genuinely long admin-entered title could break the layout)
and bumped the slide button to min-h-11 (was 40px, 4px under the 44px
touch standard) — both invisible for normal short content.

**Item 19 (from the prior message) — FAQ**: 2 questions visible by
default on mobile, "Show N more" toggle reveals the rest via conditional
visibility (not array slicing, so full content stays in the DOM for SEO).
Desktop unaffected.

**Discovered more prior work than tracked**: grepped for "Mobile UI pass"
comments across the codebase and directly verified file contents rather
than trusting the internal task-tracking notes alone — found
forgot-password/reset-password/verify-otp pages, the Toaster config, and
global scroll-behavior:smooth were all already done in earlier
(untracked) work this session. Lesson recorded for future sessions:
verify current file state directly before assuming something needs doing.

**Item 11 (Category Pages)**: no price/category filter feature exists
anywhere in this codebase (only sort) — building one from scratch would
be a new feature, not a UI redesign, so focused on making sort excellent
instead of fabricating a filter UI with no backend behind it. Made the
products-page sort toolbar sticky. category/[slug]/page.jsx is a Server
Component (an earlier RSC conversion) with no client state to hang a sort
dropdown off — implemented sort via URL search params instead of
regressing that conversion: new CategorySortControl.jsx client island,
SORT_OPTIONS/buildSortOption exported from product.controller.js for
reuse (not duplicated), and — critically — the category data cache key
updated to include sortBy, since without that, different sort choices
would have silently shared one cached result. subCategory and search
pages don't have sort yet — disclosed as a deferred follow-up, not
silently skipped. Smooth scrolling: already global (scroll-behavior:
smooth in globals.css from earlier work) — verified, not re-added.

**Item 12 (Animations)**: audited every transition/animation sitewide.
Found the architecture already only animates transform/opacity/color
properties — never width/height/top/left/margin — so the 60fps
requirement was already substantially met structurally. Most durations
already sit in a reasonable 150-250ms band (150ms specifically for
instant tap/press feedback, which is standard practice — deliberately
faster than the 200-300ms guidance for that specific interaction
category, not an oversight). Two 500ms hover-zoom transitions
(ProductCard/CampaignSection) are hover-gated and therefore dead code on
touch devices (no hover state) — correctly out of scope for a mobile
pass. The one real adjustment: the carousel's full-slide transition
(500ms, and this one DOES run on mobile) nudged to 400ms — a deliberate
middle ground rather than forcing the stricter 300ms, since a full-
viewport slide transition is an established exception category in
real-world carousel/slider design, not the kind of micro-interaction the
200-300ms guidance is really aimed at.

**Item 14 (Accessibility) — the most substantial work this batch**:
- Color contrast: computed exact WCAG 2.1 contrast ratios (not eyeballed)
  for every text/background color pair across all 4 themes via a Python
  script. Found 2 real, measured failures: --color-muted at 4.14:1
  (default) / 4.09:1 (ocean) against actual backgrounds — under the 4.5:1
  AA threshold for normal text, which matters since this token is used at
  caption sizes (11-12px) well below WCAG's large-text exception.
  Darkened ~10% in exactly those two themes (dark/festive already passed
  at 6.62:1 / 5.30:1, left untouched). White text on the raw
  --color-secondary measured 2.15-3.28:1 across all 4 themes — but is
  only ever used as background for two small badges (cart count,
  discount %), not decoratively elsewhere in any theme, so added a new
  --color-secondary-badge variant per theme (darkened until each clears
  4.5:1) used only in those two spots — the main --color-secondary is
  completely unchanged everywhere else it appears. All fixes
  re-verified computationally after implementing (4.58-4.99:1 across the
  board). This is the exact case requirement #15 itself carves out:
  "keep the palette unchanged unless required for better usability."
- Skip-to-content link added to the root layout (sr-only until keyboard
  focus) — was entirely missing before this.
- Sitewide :focus-visible style added (2px solid primary-color outline) —
  before this, only .input-field had any custom focus treatment; every
  button, link, and icon control relied on inconsistent browser defaults.
  Uses :focus-visible specifically (not :focus) so it only appears for
  keyboard navigation, never for mouse or touch taps.
- Escape-key handling added to the header's mobile drawer (+ desktop
  mega-menu/account dropdown) and to ConfirmBox — neither had any
  keyboard-only way to dismiss before this.
- Mobile drawer: plain div → semantic <nav aria-label="Mobile">, wrapping
  container got role="dialog" aria-modal="true". Same role="dialog"
  aria-modal="true" added to ConfirmBox. Header/nav/main/footer landmarks
  were verified already correct from earlier work — not touched.

Files touched: `src/components/Carousel.jsx` (hero banner revert + timing),
`src/app/page.jsx` (FAQ), `src/app/products/page.jsx`,
`src/app/category/[slug]/page.jsx`, `src/server/data/category.js`,
`src/server/controllers/product.controller.js` (export only),
`src/app/globals.css` (contrast fixes, focus-visible),
`src/app/layout.jsx` (skip link), `src/components/Header.jsx`
(Escape handling, semantic nav), `src/components/ConfirmBox.jsx`
(Escape handling, dialog role), `src/app/forgot-password/page.jsx`
(tiny inputMode gap). New file: `src/components/CategorySortControl.jsx`.

**Scope note, explicitly flagged to the user rather than assumed**: the
user's request list still includes "Dashboard" among components to
optimize, but dropped the earlier "admin operatable" phrase from the
final goal — read as a signal to keep focus on the storefront + customer
account pages (Orders/User Account, listed separately from "Dashboard"),
not the full admin panel (dozens of pages — site-settings, inventory,
coupons, HR, analytics, etc. — plausibly as large as everything done
across every batch so far, combined). Not silently assumed either way;
stated as an explicit, correctable interpretation in the response to the
user.

Not yet done, disclosed rather than silently skipped: subCategory/search
page sort, customer account pages (myorders/profile/address) mobile
polish, InvoiceModal, a dedicated visual-consistency spot-check pass, and
a broader responsiveness sweep beyond what earlier batches already
covered. Wishlist: confirmed via search that no such feature exists
anywhere in this codebase (no model, no component, no page) — not
fabricated.

Regression checked throughout: 225 files under src/ (231 including root
config), 0 syntax errors, 0 import/export problems.

---

## Batch 21 — Mobile UI redesign (320px-768px), storefront only

Scope: customer-facing storefront only, not /dashboard admin routes -
nothing in the 10-part request referenced admin, and it's a separate,
role-gated, desktop-oriented tool. Note: /dashboard/profile,
/dashboard/address, /dashboard/myorders are actually CUSTOMER account
pages living under that URL prefix (admin is a role-gated subset of
/dashboard/*), but are one step removed from the core browse -> cart ->
checkout flow the request explicitly named - deliberately deferred, not
silently skipped (see below).

Existing design system worked *with*, not replaced: the "liquid glass"
aesthetic (backdrop-blur frosted surfaces), 4 CSS-variable themes, sage
palette, and the site's own .btn-primary/.btn-outline/.input-field/
.product-card component classes all stayed - fixed at the source where a
sitewide standard was needed (button/input touch targets) rather than
overridden per-usage, so the fix cascades correctly everywhere those
classes are used.

**Touch targets (44x44px minimum, requirement #6)**: found .btn-primary/
.btn-outline/.input-field were relying on padding + inherited 1.6
line-height, computing to ~38-42px - just under standard. Fixed with
explicit min-height at the source in globals.css, cascades everywhere.
Header hamburger/cart/account icons had *no* touch-target sizing at all
(bare 24px icons, no padding) - fixed. Same for Footer social icons and
newsletter form, PreferenceSelector's trigger (~31px, missed in the first
Header pass since it's a separate component). AddToCartButton main
button 36->44px; its quantity stepper (shared between product cards AND
the cart page - confirmed via grep) 24->36px, documented as the one
deliberate exception (a dense inline control that would look oversized at
full size inside a ~136px-wide mobile card).

**Layout/spacing (8px system, requirement #2)**: found py-8/py-10
(32-40px) container padding on nearly every storefront page, exceeding
the requested 16-24px vertical-section range. Fixed systematically across
14 instances in 11 page files with a py-4 lg:py-8 pattern - transition
at lg (1024px) rather than md (768px) so the *entire* requested
320-768px range gets the tightened spacing. Product grid gaps 16->12px
mobile (verified via actual math that a 2-column mobile grid produces
~136px-wide cards at 320px viewport, so every pixel matters). Footer
gap-8 (32px between STACKED single-column mobile sections) tightened.

**Typography (requirement #3)**: found the real homepage hero lives in
Carousel.jsx (not inline in page.jsx) at text-3xl md:text-5xl
(30->48px), above the requested 24-28px hero range - tightened to
text-2xl sm:text-3xl md:text-5xl. Also found and fixed a layout issue
paired with it: the hero's aspect-[3/1] made it only ~107px tall at a
320px viewport width, cramped for title+subtitle+button - now
aspect-[4/3] sm:aspect-[21/9] (taller on mobile, original wide-banner
proportions from sm: up). Section titles (section-heading text-xl =
20px) were already correctly within the 18-22px range - verified, not
changed.

**Navigation (requirement #4)**: mobile drawer touch targets fixed
(links/close button/category-expand all ->44px row height), width changed
from a fixed 288px to 82vw/max-w-80 (adapts across the 320-768 range
instead of one fixed size). hover: states changed to active: on
touch-only surfaces - no real hover on a touchscreen. Search bar kept as
a persistent, always-visible row (not hidden behind a toggle) - for
e-commerce specifically, zero-tap search access was judged more valuable
than the height savings a collapse would give, a deliberate trade-off
against "reduce navbar height if possible" being phrased as conditional.

**Product cards (requirement #5)**: padding/type sizes tightened to
spec. Found and fixed a **real overflow bug**: the low-stock badge had no
max-width/truncate safeguard (unlike the campaign badge right next to it
in the same file) and its text could genuinely push past the card edge at
~136px card width - fixed with a max-width + truncate + shorter
mobile-specific copy. **Rating**: this codebase has no rating/review
system anywhere - no model, no data, confirmed via grep in both
directions before concluding this, not assumed. Did NOT fabricate stars;
added a conditional display that renders only if product.rating is ever
real data, so the card is ready for a future backend feature without
further layout change. Same finding applies to PDP "make reviews easier
to read" (requirement #10) - nothing exists to act on; disclosing rather
than silently skipping.

**Forms (requirement #7)**: .input-field min-height fixed at the
source (same pattern as buttons). Login/register: added
inputMode/autoComplete for correct mobile keyboards on
email/tel/name fields. Found and fixed a real overflow risk: the OTP
input's text-2xl + tracking-[0.5em] on 6 characters inside a p-8
modal was razor-thin-to-overflowing at a 320px viewport by direct
character-width math - reduced tracking/size on mobile, full size from
sm: up.

**Cart & Checkout (requirement #9)**: cart item card **restructured**,
not just restyled - the original single 3-column row (image + text +
button-column) left the text column only ~36px wide at 320px by the same
kind of width math used above (flex's min-w-0 prevented actual page
overflow, but the text would have been nearly unreadable). Now the
quantity stepper sits in its own full-width row below the text on
mobile, reverting to the original single-row layout from sm: up where
there's room for it. Both cart and checkout: the order summary's
sticky top-24 didn't serve its purpose once mobile stacks to a single
column - scoped to lg:sticky lg:top-24, paired with a genuine mobile
fixed-bottom sticky checkout/submit bar (env(safe-area-inset-bottom)
handled, matching bottom page padding so content doesn't hide behind it)
- this is what requirement #9's "sticky checkout button" and
requirement #7's "sticky submit button where appropriate" actually asked
for, not a whole sticky card that doesn't stick to anything on a
single-column layout.

**Product Detail Page (requirement #10)**: found and fixed a **real,
significant bug** in ProductGallery.jsx - the prev/next navigation
buttons were opacity-0 group-hover:opacity-100, meaning completely
invisible except on :hover. Touch devices have no hover state, so these
buttons were invisible AND unusable on every phone/tablet; the thumbnail
strip was the only way to change images. Fixed: visible by default on
mobile, hover-reveal preserved for desktop only. Added swipe-to-browse
(plain touch event handlers, no new dependency, 40px threshold) and
mobile position dots. Added the requested sticky mobile Add-to-Cart +
Buy-Now bar (same fixed-bottom pattern as cart/checkout); the inline pair
hidden on mobile to avoid a redundant duplicate. Specs <dl> was
unconditionally grid-cols-2 (cramped for potentially long values at
320px) - now grid-cols-1 sm:grid-cols-2.

**Images (requirement #8)**: verified, not changed - SafeImage.jsx is
already a well-built next/image wrapper, lazy-loading by default,
priority correctly reserved for genuine above-the-fold LCP candidates
(PDP main image, hero banner's first slide, header logo), sizes
attributes present at every usage checked. Grepped the whole storefront
for any raw <img> tag that might have bypassed this - none found (the
one match was a comment, not real code).

**Verification method** (same honesty standard as every batch before
this): no live browser or network in this sandbox, so nothing here was
visually screenshotted or measured on a real device. Verified instead via
(a) the existing static syntax/import-export checkers, re-run clean after
every file changed - final count 224 files, 0/0; (b) direct pixel/rem
math for every touch-target and overflow-risk claim above, not just
"this looks about right"; (c) systematic grep sweeps for overflow-risk
patterns (fixed px widths >=300px, min-w-[Npx], whitespace-nowrap
contexts) across the whole storefront, each hit individually traced to
confirm real risk vs. false alarm. One item flagged for real-device
follow-up rather than claimed as certain: the header's right-side icon
cluster (currency/cart/login) at exactly 320px width with the text-logo
fallback - the flexible elements (logo via min-w-0+truncate,
PreferenceSelector, login button) will compress rather than force page
overflow, by flexbox's own default behavior, but exactly how the logo
truncates at the tightest real-world width combination is worth an actual
320px-device check.

Files touched: src/app/globals.css, src/components/Header.jsx,
src/components/Footer.jsx, src/components/ProductCard.jsx,
src/components/AddToCartButton.jsx, src/components/ProductGallery.jsx,
src/components/ProductPurchasePanel.jsx, src/components/Carousel.jsx,
src/components/PreferenceSelector.jsx, src/app/cart/page.jsx,
src/app/checkout/page.jsx, src/app/login/page.jsx,
src/app/register/page.jsx, src/app/product/[product]/page.jsx, and
container-padding-only edits to src/app/page.jsx,
src/app/category/page.jsx, src/app/category/[slug]/page.jsx,
src/app/[category]/[subCategory]/page.jsx, src/app/products/page.jsx,
src/app/search/page.jsx, src/app/sitemap/page.jsx,
src/app/banner-page/[id]/page.jsx.

Not done, disclosed rather than silently skipped: /dashboard/profile,
/dashboard/address, /dashboard/myorders (customer account pages, one
step removed from the core flow this request named); rating/review UI
data (no backend model exists - see Product Cards / PDP above); the
header-width real-device check noted above.

---

## Batch 20 (in progress) — Theme/language persistence bug (real fix) + fresh full audit + Sections 16/18/19/20

User reported (again): theme/language reverts to default after a refresh.
Re-verified from scratch rather than trusting Batch 15's currency fix to
have covered it — it hadn't, fully. Root cause traced end-to-end through
every file in the chain (slice → middleware → store → GlobalProvider → UI)
before writing any fix, and cross-checked against currencySlice.js (which
does NOT have this bug) to confirm the diagnosis by direct comparison, not
guesswork.

**Root cause**: `siteSettingsSlice.js`'s `setSiteSettings()` only preserved
a user's personal theme/language choice when `state.loaded === true`. But
`loaded` is only ever set `true` by `setSiteSettings` itself — never by the
restore actions (`setActiveTheme`/`setActiveLanguage`). Redux state always
starts fresh on a page load (see store.js), so the FIRST `setSiteSettings`
call on every single page load/refresh always saw `loaded === false`,
regardless of whether a restore had already run moments earlier in the same
effect — silently overwriting the just-restored choice with the server
default, every time. Fix 44's own comment described the intended behavior
correctly but the implementation never actually achieved it outside of
later calls in the same session (e.g. the 30s poll), which is why it kept
looking fixed in each individual review pass without actually being fixed
for the case that matters (a fresh refresh).

**Fix**: added `theme.isOverride` / `language.isOverride`, set atomically
by `setActiveTheme`/`setActiveLanguage` themselves — mirroring
`currencySlice.js`'s already-proven `isUserOverride`/`setSelectedCurrency`
pattern exactly, which doesn't have this bug for the same structural
reason. `setSiteSettings()` now checks these instead of `loaded`.
Also updated `GlobalProvider.jsx`'s restore step to only treat a persisted
value as a genuine override when `isOverride` was also true when saved
(mirroring currency's `savedIsOverride` check) — without this, a value
that was merely cached from an earlier visit's site default (never
personally chosen) would get incorrectly "stuck" and stop tracking a later
admin-side default change. This second part isn't the reported bug, but is
the same bug class and was verified as a real gap via a regression-style
simulation before shipping the fix (see below) — better to close it now
than have it surface as its own confusing report later.

**Verified, not just reasoned about**: wrote a standalone simulation
(`build-check/verify_theme_fix.js`) that copies the exact reducer logic and
walks through both (1) the exact reported bug — pick a theme, refresh,
confirm it survives the post-refresh fetchSiteSettings() call — and (2) a
regression check that a visitor who never personally chose anything still
correctly tracks a live site-default change rather than getting stuck on a
stale cached value. All 6 assertions pass. Also re-ran the full static
syntax + import/export checkers after the change (still 225 files, 0/0) and
grepped every consumer of `siteSettings.theme`/`.language` in the codebase
to confirm nothing else assumed the old exact object shape (admin form
explicitly cherry-picks named fields on both read and write, so the new
`isOverride` key is harmless there).

Files touched: `src/store/siteSettingsSlice.js`, `src/providers/GlobalProvider.jsx`,
`src/components/PreferenceSelector.jsx` (comment correction only).

**Fresh full QA pass (this batch, continued):**

- Fixed a real info-disclosure/logging-hygiene gap in `sendEmail.js`: the
  no-API-key dev fallback had no production guard, so a misconfigured
  deployment would silently log sensitive email content (e.g. password
  reset links) while reporting fake success. Now fails loudly through the
  structured logger in production; local dev convenience unchanged.
- Found and removed a duplicated `import "server-only"` (each with its own
  near-identical explanatory comment, from two different batches not
  checking for the existing guard) in **4 files**: `lib/logger.js`,
  `lib/cache.js`, `lib/apiHandler.js`, `lib/apiObservability.js`.
  Confirmed via `grep -c` across every server-only file that no others had
  this issue after the fix.
- Verified the apparent `server/config/connectDb.js` vs `lib/mongodb.js`
  "duplication" is intentional, not a bug: `lib/mongodb.js` has connection
  caching/retry-with-backoff (needed for Next.js's request-scoped module
  execution to avoid exhausting MongoDB connections) and imports
  `server-only`; `connectDb.js` is a deliberately simpler one-shot
  connector used ONLY by the standalone CLI seed script, which needs to
  avoid the `server-only` build-tool dependency since it runs via plain
  `node`, outside Next's bundler. Left as-is.
- **Finished the "~18 lower-traffic controllers never audited for the
  stale-whitelist pattern" gap** noted in the older batch history (role,
  barcode, subcategory, inventory, callLog, notification,
  analyticsSettings, siteSettings, activity, coupon, callCenterAgent,
  hrPayroll, productRequest, customerCare, category, cart, deliveryZone,
  address). Built a heuristic scanner to find candidates, but — learning
  from this same tool producing false positives earlier in this batch —
  treated every flag as unverified until manually checked against the
  actual controller code and, where relevant, the admin frontend form.
  Result: **one confirmed real bug, seventeen false positives** (which is
  itself worth recording so a future pass doesn't re-flag the same
  non-issues):
  - **REAL BUG, FIXED**: `deliveryZone.controller.js`'s
    `createZoneController` silently dropped `isActive` — the admin form
    (`dashboard/delivery-zones/page.jsx`) has a real, wired-up "Active"
    checkbox the admin can uncheck when *creating* a zone, and the
    submitted payload genuinely includes it either way, but the create
    controller never read it from `req.body`, so a new zone was always
    forced active regardless of the admin's choice. `updateZoneController`
    already handled this correctly (spreads the full body through), so
    only zone *creation* was affected, not editing. Fixed by adding
    `isActive` to the destructure and constructor, matching the existing
    `isDefault` pattern.
  - False positives, confirmed correct-by-design after manual review:
    `siteSettings`/`analyticsSettings` (tool artifacts — a 4-sub-schema
    file where the tool read the wrong sub-schema, and a singleton
    updated via field-by-field assignment rather than the constructor
    literal the tool searched for); `callCenterAgent`'s 5 "missing" HR
    fields (the quick-add form deliberately doesn't collect them — full
    HR onboarding is a separate `hrPayroll` screen, which itself uses a
    named, deliberately-scoped whitelist constant
    `EMPLOYEE_EDITABLE_FIELDS` that already covers all of them, and
    deliberately excludes `userId`/`isCallCenterAgent` for a documented
    OWASP A08 mass-assignment reason); `callLog` (correct two-phase
    initiated/outcome workflow — outcome fields don't exist yet at call
    start); `notification`'s `relatedId` and `category`'s `translations`
    (both tool false negatives — a shorthand-property parsing bug in the
    heuristic script itself; both fields were already correctly present);
    `coupon`'s `usedCount`/`usedBy` (system counters, updated via a
    separate `markCouponUsedController`); `productRequest`'s
    `status`/`adminNote` and `customerCare`'s
    `status`/`priority`/`assignedTo` (correctly admin-only, would be a
    privilege issue if a customer-facing submission could set them);
    `address`'s `status` (schema default `true` is exactly right for a
    newly added address); `inventory`/`barcode`'s `reference` (correctly
    populated by `order.controller.js`'s order-triggered inventory
    adjustments, where a reference is semantically meaningful — manual
    admin stock adjustments have no order to reference, and the admin
    form doesn't offer that input either); `hrPayroll` (initially
    misflagged as "no create call found" — it uses a named helper
    function, `pickEmployeeFields()`, not an inline object literal, which
    the tool's regex didn't match).

Files touched (this QA pass): `src/server/config/sendEmail.js`,
`src/lib/logger.js`, `src/lib/cache.js`, `src/lib/apiHandler.js`,
`src/lib/apiObservability.js`, `src/server/controllers/deliveryZone.controller.js`.

**Next.js best practices (Section 16) — verified, not redone.** Batch 19
already did real work here (Section 15 in its own numbering). Spot-checked
rather than re-auditing from scratch: confirmed all 6 of the
"highest-leverage shared modules" genuinely have `server-only` guards
(2 already known from the duplicate-import fix above, the other 4 —
`mongodb.js`/`security.js` — confirmed directly); grepped every `"use
client"` file for any non-`NEXT_PUBLIC_` env var reference (zero found —
no server secret is ever reachable from a client component); confirmed
`middleware.js` genuinely does no auth/access-control (headers only,
matters for the Next.js CVE discussion below). One honest finding, not
acted on: only 3 of 39 pages are true Server Components (the ones Batch 16
converted); the homepage (`app/page.jsx`) — arguably the single highest-
value RSC target, given it's the highest-traffic, most SEO-relevant page —
is still fully client-rendered with client-side data fetching for every
product row. Deliberately did NOT attempt converting it in this pass: it's
a substantially more complex component than the 3 pages already converted,
and Batch 18's own experience shows even that simpler conversion shipped a
real bug (ObjectId serialization) that only surfaced from an actual `npm
run dev` — something this sandbox still can't do. Documented as a specific,
actionable recommendation in the final report instead of a blind attempt.

**Production readiness (Section 18):**
- Created `.github/dependabot.yml` (didn't exist before) — npm + github-
  actions ecosystems, weekly, grouped minor/patch to reduce noise, majors
  excluded for next/react/react-dom/mongoose so those always surface as
  their own reviewable PR. Validated with a Python YAML parse before
  trusting it.
- Vercel deployment readiness: already covered in earlier batches (old
  Batch 9) — not re-verified line-by-line in this pass given time spent on
  higher-value items below, but nothing found in this pass's QA work
  contradicts it.

**Dependencies (Section 19) — the big one this batch, via web_search
since this sandbox still has no npm registry access:**

- **Next.js 14.x is EOL (Oct 26, 2025) and now permanently unpatched.**
  The locked version here, 14.2.35, is genuinely the final 14.x release
  (Dec 11, 2025) — but Vercel's May 2026 coordinated security release (13
  advisories: middleware/proxy bypass, DoS, SSRF, cache poisoning, XSS)
  explicitly excluded 13.x/14.x from receiving any patch. Checked whether
  this app is actually exposed to the specific mechanism those advisories
  describe (middleware-enforced auth bypass) before deciding how urgently
  to frame this: confirmed `middleware.js` never gates access to anything
  (header injection only — CSP nonce, X-Robots-Tag), and every real
  authorization check happens server-side in `apiHandler.js` on each API
  call, so the specific "prefetch bypasses middleware auth" mechanism
  doesn't apply to how this app is actually built. That does NOT make the
  EOL status a non-issue — other advisories in the same bundle aren't
  scoped to middleware auth, and running a permanently-unpatched framework
  version is a forward-looking risk regardless of what's known today.
  Did not blindly bump to 15.x/16.x: that's a major-version migration with
  real breaking changes (App Router behavior, Turbopack defaults in 16,
  Node 20+ minimum, React 19) that this sandbox cannot test, and this
  project's own established practice throughout its history has
  consistently been to not ship untestable rewrites. Synced package.json's
  declared range to `^14.2.35` (matches the already-tested lockfile exactly
  — zero new risk) and documented the full upgrade path clearly in the
  final report as a recommended, deliberate follow-up.

- **multer: found genuinely vulnerable AND genuinely unused — removed
  entirely rather than upgraded.** The locked version (1.4.5-lts.1, matching
  package.json's declared range) has three real CVEs, the worst a CVSS 8.7
  unauthenticated DoS where one malformed upload request crashes the whole
  Node process (CVE-2025-48997), fixed only in 2.0.1+. But tracing actual
  usage found `src/server/middlewares/multer.js` was already dead code —
  confirmed independently (not just trusting its own comment) via grep in
  both directions: nothing imports it for real, only a comment in
  `apiHandler.js` mentions it explanatorily. Real upload parsing happens
  via native `Request.formData()` directly in `apiHandler.js`. Since
  removing an unused dependency is strictly lower-risk than upgrading a
  live one (and this project's own file already documented it as legacy
  Express-era leftover), deleted `middlewares/multer.js` and removed
  `multer` from `package.json` entirely — closes the CVE exposure and the
  "remove unused packages" ask in one safe move. Also found
  `middlewares/admin.js` in the same directory was ALSO dead code (a
  pre-RBAC Express-style admin check, fully superseded by the
  `permission.js` module actually wired into all 20+ route handlers) —
  deleted too.

- **mongoose: confirmed NOT exposed to a real, relevant CVE.** A `$where`-
  operator NoSQL injection issue (fixed in 8.9.5+) exists in older 8.x —
  package.json's stale declared range (`^8.8.1`) would technically allow a
  vulnerable resolve, but the actual locked/tested version is 8.24.1,
  well above the fix. Synced the declared range to match.

- **@sentry/nextjs: 2 major versions behind (declared 8.42.0; latest is
  10.x) — documented, not touched.** Real breaking changes exist between
  8→9→10 per Sentry's own migration guides (removed APIs, Hub→Scope model
  change). Left as a flagged, deliberate follow-up rather than a blind
  major bump, same reasoning as Next.js above.

- **bcryptjs: checked, no issue found.** Actively maintained, no
  deprecation or CVE surfaced. No action needed.

- **Systematic package.json ↔ package-lock.json comparison** (not just
  the handful of packages individually researched above): wrote a script
  to diff every declared range against its actual locked version. Found
  package.json's ranges were broadly stale relative to what's actually
  locked and already battle-tested (per Batch 18's real `npm run dev`
  session) — 19 packages synced to match their tested locked version
  exactly (`@reduxjs/toolkit`, `axios`, `cloudinary`, `dotenv`, `jsbarcode`,
  `jsonwebtoken`, `react-hook-form`, `react-hot-toast`, `react-icons`,
  `react-redux`, `recharts`, `resend`, `stripe`, `@types/node`,
  `@types/react`, `autoprefixer`, `postcss`, `tailwindcss`, plus
  mongoose/next above). This is zero-risk by construction — it doesn't
  change what's actually installed, only corrects the manifest to match
  what's already proven to work, so a future `npm install` without the
  lockfile (or Dependabot's own version comparison) has accurate
  information instead of stale ranges.
  **Important discovery from this same comparison**: 7 packages
  (`@next/bundle-analyzer`, `@sentry/nextjs`, `@vercel/otel`, `morgan`,
  `server-only`, `winston`, `winston-daily-rotate-file`) have NO entry at
  all in `package-lock.json` — they were added to `package.json` in later
  batches (17/19/etc.) that never had `npm install` available to
  regenerate the lockfile. This means **`npm ci` will currently fail**
  (it requires an exact lockfile match); **`npm install` is required**,
  not `npm ci`, the first time this project is actually set up outside
  this sandbox. Flagged clearly in the final report's deployment steps.

Files touched (dependencies): `package.json`, `.github/dependabot.yml`
(new), deleted `src/server/middlewares/multer.js` and
`src/server/middlewares/admin.js`. `package-lock.json` deliberately NOT
hand-edited (too large/complex to safely edit without `npm install` to
verify the result) — regenerates correctly on next real `npm install`.

Final regression check after all of Batch 20's changes: 223 `.js`/`.jsx`
files under `src/`, 229 including root config files — 0 syntax errors,
0 import/export problems.

Still to do before this batch is complete: final consolidated report
(Section 20) and packaging.

**Batch 20 complete.** Final report written to
`PRODUCTION_READINESS_REPORT.md` at the project root (security/performance/
Lighthouse-estimate/OWASP checklist/files-changed/commands/deployment
steps — kept separate from this file since this one is the batch-by-batch
working log and that one is the point-in-time deliverable snapshot).
Project packaged as a zip and delivered. Next session: read this file
first as always; if nothing new has broken, start from the recommended
next steps at the end of `PRODUCTION_READINESS_REPORT.md` (§12) rather
than re-auditing everything this batch already covered.

---

## Batch 19 — Section 13 (Admin Panel Security) + 14 (Payment Security) + 15 (Next.js Best Practices)

Scope: the third and final requested section group, on top of Batches
16-18. Same sandbox constraints as every batch before this one — no
network access, nothing here was ever actually run; verified with the
same static tooling (esbuild transform + import/export checker) built in
Batch 16, plus careful manual review, which is what caught most of the
real issues in this batch specifically (see below).

**Worth recording plainly**: this batch picked up mid-task after a real
context discontinuity — a "continue" arrived with no visible memory of
the work covered by this entry's own Section 14 half, which turned out
to already be complete, or of Batch 18 (a separate real-runtime bug-fix
pass after the user ran `npm run dev` directly, immediately below this
entry). Resolved by not trusting stale planning notes and checking the
actual filesystem directly before touching anything — full account
preserved in ROADMAP.md's own "CONTEXT DISCONTINUITY" section for anyone
who wants the blow-by-blow.

### Section 14 — Payment Security (Stripe)
Found already fully and correctly implemented once the filesystem was
actually checked (see the discontinuity note above) — not redone, just
verified: `ProcessedWebhookEvent` model (unique index on `eventId`, 30-day
TTL), explicit `WEBHOOK_TOLERANCE_SECONDS=300` passed to `constructEvent`
(honestly documented as making an already-existing Stripe SDK default
explicit rather than claiming to close a hole that wasn't open), an
atomic upsert-based idempotency claim (Mongo error 11000 = already
handled, anything else = real failure returned as 500 so Stripe retries),
and a `payment_status !== "paid"` gate before order fulfillment.

### Section 13 — Admin Panel Security
- **Admin session timeout**: ADMIN/SUPERADMIN accounts get shorter token
  lifetimes (10m access / 4h refresh vs. 15m / 7d default,
  env-overridable). Caught my own ordering bug before it shipped: role
  needs fetching once, before both the session record's expiry AND the
  actual token's expiry are computed, or the two disagree (a session
  record claiming days more validity than the JWT itself, the thing
  actually checked on every request, would actually have).
- **Idle logout**: new `IdleLogoutProvider.jsx`, wrapping
  `dashboard/layout.jsx` (scopes it to `/dashboard/*` for free via the
  route-segment layout system — no pathname-checking needed). 20-minute
  default, 60-second "Still there?" warning, reuses the exact logout
  sequence `UserMenu.jsx` already used rather than a parallel
  implementation. Deliberately requires an explicit "Stay logged in"
  click once the warning shows (not any incidental activity) — reasoned
  through in the component's own comment: this exists specifically to
  protect an unattended screen.
- **IP whitelist**: admin-configurable via Site Settings, not env/
  redeploy-based. Real architectural constraint worked through carefully:
  `middleware.js` runs on Edge (established elsewhere in this project) and
  can't reach Mongoose, so this is enforced in `permission.js` instead —
  which already does a fresh per-request role lookup — scoped to
  ADMIN/SUPERADMIN accounts only (storefront/customer traffic completely
  untouched). New `security{ipWhitelistEnabled, ipWhitelist}` field on
  `SiteSettingsModel`, read through the same TTL cache every other
  settings read already uses. New deliberately-UNCACHED `GET /api/
  settings/my-ip` endpoint so the admin UI can show each admin their own
  real current IP (the cached settings response is shared across callers
  within its TTL window — embedding "your IP" there would show one admin
  a DIFFERENT admin's IP). Full UI in `dashboard/site-settings` with two
  safety guards: refuses to save "enabled" with an empty list (locks out
  every admin at once), and requires explicit confirmation if enabling
  without the SAVING admin's own current IP listed.
- **Email-OTP 2FA**: same OTP shape the app already uses twice
  (email-verification-at-signup, forgot-password) — a proven pattern, not
  a new mechanism. Refactored `loginUserController`: extracted a shared
  `completeLogin()` helper (token issuance, cookies, response) called
  either directly (2FA off) or from new `verifyLoginOtpController` (2FA
  on, after the emailed code is confirmed). Caught two real issues via
  manual review: (1) `recordSuccessfulLogin` was being called twice for
  the non-2FA path post-refactor — harmless (idempotent Map deletion) but
  fixed properly by reasoning through where it semantically belongs
  (password-verification time, regardless of 2FA pending); (2) the new
  OTP-verification endpoint initially had no rate limit of its own — a
  6-digit code is only ~1M possibilities, brute-forceable within its
  10-minute window without one — added a limit matching the existing
  forgot-password-OTP endpoint's exactly. While in this area: found and
  fixed `getUserDetailsController`/`getAllUsersController` not explicitly
  excluding the OTP fields from their responses (always `null` by the
  time any authenticated request can succeed, so not an active leak, but
  worth being explicit rather than relying on that timing implicitly).
  Full toggle UI in `dashboard/profile`.
- **Audit log persistence + dashboard viewer**: new `AuditLogModel`
  (TTL at 365 days, matching the Winston audit logger's own retention
  from Batch 17 exactly). `logAuditEvent()` now dual-writes — Winston
  (unchanged) + MongoDB, the latter bounded by the existing `withTimeout`
  helper and awaited rather than fire-and-forget (Vercel serverless
  functions can be frozen the instant a response is sent, so a detached
  background write has no guarantee of completing) — a persistence
  failure is caught and logged but never blocks or fails the actual
  request. New paginated/filterable `dashboard/audit-log` viewer,
  SUPERADMIN-only (not the general permission system — an audit trail of
  every admin's actions is itself sensitive enough to restrict to the one
  role that can't be demoted). Caught two real issues here too: the new
  API route file initially used a different export pattern than every
  other route in the app and was missing the `force-dynamic` export those
  all have specifically to stop a DB-backed GET route from being
  statically cached (checked an existing route file's actual tail rather
  than assuming, matched it exactly); and the dashboard table's first
  draft used shorthand `<>...</>` fragment syntax inside a `.map()`,
  which can't accept the `key` prop React requires there — fixed with an
  explicit `Fragment` import.

### Section 15 — Next.js Best Practices
Audit-plus-targeted-fixes, not a rewrite, as planned — App Router /
Server Components were already substantially true going into this batch
(confirmed, not assumed). One earlier-planned item was deliberately
reconsidered and NOT done: converting the new 2FA/IP-whitelist toggles to
Server Actions, which on closer look would mean losing the rate-limiting/
CSRF/sanitization/security-and-audit-logging every REST endpoint gets
uniformly through `apiHandler.js`, unless manually re-implemented per
action — reasoning documented rather than the plan executed mechanically
once it stopped making sense. `server-only` package added to the 6
highest-leverage shared modules (mongodb/security/logger/cache/
apiObservability/apiHandler) — checked FIRST that none were already
imported by a client component (would have surfaced an existing mistake
as a new build failure, not just prevented a future one) before adding
anything. Disclosed honestly as covering the central chokepoints with
transitive protection, not an exhaustive pass across all ~50+ files under
`server/`. The "optimize middleware.js" item turned out to have nothing
to optimize — the IP-whitelist logic correctly never went there in the
first place, for the Edge/Mongoose reason above.

Verified: full project, 226 `.js`/`.jsx`/`.mjs` files under `src/` plus 6
root-level config files, 0 syntax errors, 0 import/export problems — the
whole tree, not just what this batch touched. As with every batch before
this one: no live build, `npm install`, or actual runtime execution was
possible in this sandbox. Running a real `npm install && npm run build`
before deploying remains the one thing this pass genuinely could not do.

---

## Batch 18 — Real runtime bug fixes (first actual `npm run dev` output seen)

Different in kind from every batch before it: this one is a response to
**real output from actually running the app** (`npm run dev`), the first
time any of this project's Section 9–12 work has been exercised outside
this sandbox's static verification. Two real, distinct issues; two
genuinely lower-priority ones acknowledged but not acted on.

### Fixed: React Server Component prop-serialization warning
```
Warning: Only plain objects can be passed to Client Components from
Server Components. Objects with toJSON methods are not supported.
[{buffer: ...}]
```
**Root cause**: Mongoose's `.lean()` strips the Document wrapper but does
NOT deep-convert every BSON-typed field — `_id` (on a product and on every
populated `category`/`subCategory`) stayed a real ObjectId instance (that
`{buffer: ...}` in the warning is literally an ObjectId's internal 12-byte
representation), `createdAt`/`updatedAt` stayed Date instances, and this
app's `translations` fields (category/subCategory models) stayed Map
instances. Batch 16's Server Component pages
(`product/[product]`, `category/[slug]`, `[category]/[subCategory]`) all
fetch data this way and hand it straight to client components
(`ProductCard`, `ProductGallery`, `ProductPurchasePanel`,
`ProductSuggestions`) — a real, live bug in that work, confirmed the
moment someone actually ran it, and exactly the kind of thing this
sandbox's static-only verification (no network, no real Next.js dev
server) could not have caught. Worth being direct about that rather than
implying otherwise.

**Fix**: new `src/lib/serialize.js` — `serializeDoc()` recursively
converts ObjectId → hex string, Date → ISO string, Map → plain object,
walking arrays/nested objects. Wired into all three Server Component data
fetchers (`server/data/product.js`, `category.js`, `subcategory.js`),
applied once to the whole result right before it's cached/returned, so
every consumer downstream — the page component's own JSX and every client
component it renders — automatically gets clean data with no changes
needed at any of those call sites. Behaviorally tested (not just
syntax-checked, given this is exactly the kind of logic where that
distinction has mattered every time it's come up in this project) against
a fixture mimicking the actual reported shape (fake ObjectId with a
`buffer` property, nested populated category with a `translations` Map,
Date fields, deeply nested arrays) — 10 test cases including the
decisive one: the output survives an actual `JSON.stringify`/`JSON.parse`
round-trip completely unchanged, which is the real definition of
"RSC-safe."

**Second bug this same fix resolves as a side effect**, worth flagging
explicitly: `ProductPurchasePanel.jsx`'s `handleBuyNow` compares
`product._id` against cart items' `productId` (`(i.productId?._id ||
i.productId) === product._id`) to check whether the product is already in
the cart. Cart data arrives via the normal JSON REST API, where `_id` was
always already a plain string (JSON has no ObjectId type — `JSON.stringify`
calls `.toJSON()`/`.toString()` on it automatically during a normal API
response). With `product._id` still an ObjectId before this fix, that
comparison was `ObjectId === "someString"` — always `false`, regardless of
whether it was actually the same product — meaning Buy Now could never
detect "already in cart" and would risk double-adding. Serializing
`product._id` to a string makes both sides of that comparison the same
type, fixing this too, without touching that comparison's own code at all.

### Fixed: missing `global-error.js` (Sentry's own recommendation)
```
It seems like you don't have a global error handler set up. It is
recommended that you add a global-error.js file with Sentry
instrumentation so that React rendering errors are reported to Sentry.
```
Direct, actionable feedback from Batch 17's own Sentry integration once it
actually ran. New `src/app/global-error.js` — Next.js's documented
exception to the usual `error.js` convention: it catches errors in the
ROOT layout itself, which means it REPLACES the root layout when it
renders rather than being wrapped by it (so, unlike a normal `error.js`,
it renders its own complete `<html>`/`<body>`, since `app/layout.jsx`
isn't there to provide them for this specific case). Calls
`Sentry.captureException(error)` in a `useEffect`, matching Sentry's own
documented pattern. Deliberately minimal and dependency-light — no design
system, no next/font, no imports from elsewhere in the app — since if the
root layout is broken badly enough to reach this file, it's the one piece
of UI that has to keep working regardless of what else is wrong.

### Acknowledged, not acted on (stated plainly, with reasoning)
- **`[webpack.cache.PackFileCacheStrategy] Serializing big strings
  (318kiB)...`** — an informational warning about webpack's own dev-mode
  persistent build cache, not a functional defect. Diagnosing exactly
  which single string is 318kiB would need actual bundle-inspection
  tooling (a running dev server, `next build` with analysis) this sandbox
  doesn't have; guessing at a fix without being able to verify it would
  be exactly the kind of speculative change this project has avoided
  throughout. This is also a common, generally-benign warning across many
  Next.js + Tailwind projects, not a distinctive signal of a defect.
- **`npm warn deprecated` for `multer@1.4.5-lts.2`, `glob@9.3.5`,
  `uuid@9.0.1`/`uuid@10.0.0`, `recharts@2.15.4`** — all pre-existing
  dependencies from before any of this project's Section 9–12 work
  (confirmed against the original `package.json`), not something this
  batch or the two before it introduced. Deliberately not upgraded
  unilaterally: `multer` 1.x→2.x and `recharts` 2.x→3.x are both
  documented BREAKING major-version migrations (recharts' own deprecation
  message links a migration guide) — recharts specifically powers the
  entire analytics dashboard this project just finished converting to
  dynamic imports (Batch 16), so an untested major-version bump there is
  a real regression risk, not a safe drop-in. `uuid` showing both v9 and
  v10 suggests a transitive dependency wants a different version than
  this app's own direct `^10.0.0` — not something fixable by editing this
  app's own `package.json` alone. `glob` is very likely transitive
  entirely (not a direct dependency here). Flagged clearly rather than
  silently upgraded; happy to act on any of these specifically if wanted,
  but not as an unrequested side effect of a bug-fix pass.

Verified: full project (219 `.js`/`.jsx`/`.mjs` files under `src/` +
`globals.css`), 0 syntax errors, 0 import/export problems.

---

## Batch 17 — Section 11 (Logging) + Section 12 (Monitoring) implementation pass

Scope: implement the full Section 11 (Logging) and Section 12 (Monitoring)
checklists on top of Batch 16. Same sandbox constraints as every prior
batch — no network access, so `winston`, `morgan`, `@sentry/nextjs`, and
`@vercel/otel` are all in `package.json` but were never actually installed
or run here; verified statically (esbuild transform + the import/export
checker, both already validated against fixtures in Batch 16) plus careful
manual review, which is what actually caught the one real bug this batch
introduced (see below — a class of bug confirmed, by direct test, that the
automated syntax checker cannot catch at all).

### Section 11 — Logging
- **Winston**, new `src/lib/logger.js`: four categorized loggers (request/
  error/security/audit), each with a Console transport always on and a
  `winston-daily-rotate-file` transport gated behind `!process.env.VERCEL`.
  This app's documented primary deploy target is Vercel serverless
  (VERCEL_DEPLOYMENT.md), where the filesystem outside `/tmp` is
  effectively read-only and not shared across invocations — a rotating log
  FILE written during one invocation isn't reliably there for the next one
  to read, and Vercel's own guidance is to just write to stdout/stderr,
  which it captures automatically. Implemented daily rotation fully and
  correctly (the literal ask) rather than skip it, but made it conditional
  on where it actually makes sense, same honest-tradeoff spirit as
  security.js's own in-memory-rate-limiter comment. Retention differs by
  category (7d request / 30d error / 90d security / 365d audit) — routine
  high-volume logs vs. the kind of trail a compliance review or
  post-incident investigation needs to go back much further for.
- **Request logs**: `lib/apiObservability.js`'s `logRequest()` — which
  already had a comment explicitly anticipating this exact swap ("swap
  this one function for a real logger... every call site stays the same")
  — now calls the Winston request logger instead of `console.log`. Every
  existing call site is unchanged.
- **Error logs**: new `logError()`, wired into `apiHandler.js`'s top-level
  catch block alongside (not replacing) the existing `console.error` —
  Vercel needs stdout regardless of what else is wired up.
- **Security logs**: new `logSecurityEvent()`, wired into four places that
  previously made security decisions with zero logging anywhere: CSRF
  (Origin/Referer) rejection, rate-limit-exceeded (both in
  `apiHandler.js`), and failed-login/account-lockout/IP-block (in
  `security.js`'s `recordFailedLogin`, severity-differentiated — every
  failed attempt at `info`, a distinct `warn` specifically at the moment a
  lockout/block newly triggers, not on every subsequent attempt while
  already locked). Also added a one-time-per-process warning for a
  previously-invisible misconfiguration: CSRF protection silently doing
  nothing at all when `NEXT_PUBLIC_SITE_URL` isn't set (found while
  updating a `.env.example` comment that turned out to be accurate but
  incomplete — see "mistakes and findings" below).
- **Audit logs**: new `logAuditEvent()` — "who did what, when" for
  authenticated, mutating (non-GET/HEAD/OPTIONS), successful (2xx)
  requests, wired in generically at `apiHandler.js`'s single choke point
  rather than added to each of the ~15 controllers with admin/mutation
  endpoints individually. Required a real, carefully-scoped design change:
  `mockReq.userId` (set by `auth.js`'s middleware) only lived inside
  `handleRequest()`'s own scope, not the outer `createNextHandler()` where
  the response/logging actually happens. Rather than change
  `handleRequest`'s return shape at each of its several early-return
  points (CSRF/rate-limit/DB-failure/no-route/file-error/middleware-stop —
  real risk to the single most critical shared function in the app),
  `createNextHandler` now creates one shared plain object BEFORE calling
  `handleRequest`, and `buildMockRequest` builds the mock request ON TOP
  OF that same object (`Object.assign`, not a fresh literal) — so
  `auth.js`'s later `req.userId = decoded.id` mutates the exact object the
  outer function already holds a reference to. None of `handleRequest`'s
  existing early-return statements needed to change at all. Confirmed via
  full manual re-read of the whole file that this is correct end to end,
  including that the audit log correctly captures the SANITIZED body
  (sanitizeInput() mutates that same shared object) rather than raw input.
- **Morgan**: genuinely adapted, not just installed and ignored. This app
  has no real Express app or Node http request/response lifecycle for
  traditional `app.use(morgan(...))` middleware to attach to — Next.js
  Route Handlers get a Web API Request, and `apiHandler.js`'s mock req/res
  are a shim built for Express-STYLE controller code, not for hosting
  middleware. New `lib/morganAdapter.js` uses morgan's real, stable public
  API in a decoupled way instead: `morgan.token()` for custom tokens fed
  with data this app already computes (sidesteps needing morgan's own
  internal response-timing hook, which depends on the real middleware
  wrapper running), `morgan.compile(format)` called directly against a
  minimal shim rather than ever attached as middleware. Wrapped in
  try/catch with a manual fallback format, since this adapts an API
  surface that couldn't be verified live in this sandbox — a logging
  concern must never be able to break the actual response it's
  describing. Output feeds into the structured request-log entry as an
  `accessLog` field rather than a second separate stream.

### Section 12 — Monitoring
- **Sentry**: `sentry.client.config.js` / `sentry.server.config.js` /
  `sentry.edge.config.js` at the project root (the last one genuinely
  needed, not boilerplate — `middleware.js` runs on Edge, a Next.js
  requirement for Middleware, not a choice, so Edge-runtime errors need
  their own init). `next.config.mjs` wrapped with `withSentryConfig()`,
  outermost — after `withBundleAnalyzer`, reasoned through deliberately:
  Sentry's webpack plugin needs visibility into the FINAL webpack config
  including whatever other plugins already changed. Client config
  correctly reads `NEXT_PUBLIC_SENTRY_DSN` (Next.js only inlines
  `NEXT_PUBLIC_`-prefixed vars into browser bundles; a plain `SENTRY_DSN`
  read there would just be `undefined`), server/edge read plain
  `SENTRY_DSN`. Everything is a safe no-op with no DSN configured — fully
  "prepared," genuinely activates with zero further code changes once a
  real Sentry account/DSN exists, which this sandbox has no way to create
  or verify against. Stated plainly: Sentry's Next.js SDK integration
  conventions have shifted across major versions; this is the
  well-established, broadly-compatible pattern, and running
  `npx @sentry/wizard@latest -i nextjs` once after `npm install` is worth
  doing to confirm it matches whatever version actually installs.
- **OpenTelemetry**: `@vercel/otel` (the Vercel-maintained convenience
  package) over hand-rolling `@opentelemetry/sdk-node` + exporters — this
  app's documented deploy target IS Vercel, so the first-party, simpler,
  more version-safe option is also the one that actually matches where
  this runs. Registered from `src/instrumentation.js` (placed in `src/`,
  matching this project's own established convention of keeping Next.js
  special files there — confirmed via where `middleware.js` already
  lives, not assumed), Next.js's documented single hook for exactly this
  kind of "run once per runtime at startup" code — also where Sentry's
  server/edge configs get loaded from, split by
  `process.env.NEXT_RUNTIME`.
- **Health / Readiness / Liveness**: three new endpoints
  (`api/health`, `api/health/live`, `api/health/ready`), deliberately NOT
  routed through `apiHandler.js`'s usual pipeline like every other API
  resource group — that pipeline's CSRF check, rate limiting, and
  hard-DB-connection requirement would all actively work against what a
  health check needs (monitoring probes typically send bare requests with
  no Origin/Referer at all; a fixed polling interval could plausibly trip
  a rate limit meant for abuse, causing a false "unhealthy" verdict from
  the monitor tripping its OWN limiter; and collapsing on a DB failure the
  same way every other endpoint does would make it impossible to
  distinguish "the process is fine" from "a dependency is down," which is
  the entire reason to split this into three endpoints rather than one).
  Matches the precedent already set by `api/order/webhook/route.js` — a
  static, non-catch-all route living alongside a resource group's usual
  `[...segments]` catch-all, confirmed to cause no routing conflict.
  Liveness stays trivial and dependency-free on purpose (a Kubernetes-style
  liveness check that pings the database would cause an orchestrator to
  repeatedly restart a perfectly healthy process during a database blip —
  restarting it fixes nothing). Readiness genuinely checks Mongo,
  bounded by the existing `withTimeout` helper (reused, not
  reimplemented). Honest caveat stated directly in the liveness endpoint's
  own comment: Vercel serverless doesn't have a literal "restart this pod"
  concept the way Kubernetes does, so the liveness/readiness distinction
  matters most for a future containerized/self-hosted deployment — still
  correctly implemented now rather than treated as dead weight because it
  doesn't map perfectly onto the current hosting model, and genuinely
  useful today regardless (uptime-monitoring services, a load balancer if
  ever fronted by one).

### Mistakes made and caught along the way (again stated plainly)
- **Real bug, caught by manual review, not tooling**: while adding the
  CSRF-rejection security-log call in `apiHandler.js`, referenced `ip` in
  that call before its own `const ip = getClientIp(nextRequest)`
  declaration a few lines below (the original code only computed `ip`
  later, in the rate-limiting section, since CSRF used to run before
  anything needed it). This is a temporal-dead-zone `ReferenceError` —
  would have crashed on every actual CSRF rejection in production. Fixed
  by moving the `ip` computation earlier (pure, side-effect-free, safe to
  move). Confirmed by direct, deliberate test — feeding esbuild a
  minimal repro of exactly this pattern — that the syntax checker built in
  Batch 16 does NOT catch this class of bug at all (a TDZ violation is
  valid syntax; it only fails at actual execution). Worth remembering
  going forward: any code that reorders or moves existing logic needs a
  manual "does every variable this touches already exist at this point"
  check — automated syntax checking alone is not sufficient for that
  specific class of change, and this batch is proof it's not a
  theoretical concern.
- Started `next.config.mjs`'s Sentry build options with an `errorHandler`
  callback whose exact current shape across `@sentry/nextjs` versions I
  wasn't confident about. Reconsidered and removed it rather than guess —
  kept only the options confidently verified as stable across versions
  (org/project/authToken/silent/widenClientFileUpload/hideSourceMaps/
  disableLogger).
- Re-examined an existing `.env.example` comment ("CSRF fail-open... logged
  nowhere") while updating it for this batch's changes, to make sure it
  wasn't now stale. It was still accurate — but incomplete: one specific
  fail-open path (missing `NEXT_PUBLIC_SITE_URL`, meaning CSRF protection
  silently does nothing at all) is a genuine, actionable misconfiguration
  that had zero visibility anywhere. Added a one-time-per-process security
  log entry for exactly that case rather than just editing the comment to
  match the old behavior — the other two fail-open branches (missing
  Origin/Referer header; a malformed one) were deliberately left
  unlogged, since both are benign/expected in normal operation (see
  `isSameOriginRequest`'s own comments) and logging every occurrence would
  just be noise, unlike the misconfiguration case.

Verified: full project re-checked after every meaningful change, not just
once at the end — 217 `.js`/`.jsx`/`.mjs` files under `src/` plus the 6
new/changed root-level config files (`next.config.mjs`, three
`sentry.*.config.js`, `tailwind.config.js`, `postcss.config.js`), 0 syntax
errors, 0 import/export problems. As with every batch before this one: no
live build, `npm install`, or Lighthouse/Sentry-dashboard run was possible
in this sandbox — running a real `npm install && npm run build` before
deploying remains the one thing to actually do that this pass couldn't.

---

## Batch 16 — Section 9 (Performance) + Section 10 (SEO) implementation pass

Scope: implement the full Section 9 (Performance) and Section 10 (SEO)
checklists against the app as it stood after Batch 15, end to end. This
was a large, multi-part pass (touches roughly 50 files); this entry
groups it by concern rather than narrating file-by-file.

**Sandbox constraints, stated up front**: same as every prior batch — no
network access (no `npm install`), so nothing here was verified with an
actual `next build`, `next dev`, a real browser, or a live Lighthouse run.
Verification in this batch was: an `esbuild` transform pass for
syntax (found a usable copy bundled with a globally-installed `tsx`
package already present in the sandbox), a custom regex-based import/
export consistency checker, targeted behavioral unit tests for the two
pieces of genuinely new stateful/parsing logic (the cache module's TTL+
eviction behavior, and the RSS route's XML escaping), and careful manual
review. Both static-analysis scripts were themselves sanity-tested against
deliberately broken fixtures before being trusted, after the first draft
of the syntax checker turned out to silently report "0 errors"
unconditionally (wrong esbuild CLI flag form, wrong error-text grep) — see
inline comments in the tooling for the full account. Anyone picking this
up with real `npm install`/browser access should still run a real
Lighthouse pass and a real build before deploying; that's the one thing
this pass genuinely could not do.

### Section 9 — Performance
- **Images**: every `<img>` in the codebase (48 across ~35 files, storefront
  and dashboard) converted to `next/image`, via a new shared
  `components/SafeImage.jsx` wrapper rather than ad hoc per file. That
  wrapper exists because next/image is stricter than a bare `<img>` in two
  ways this app's data hits constantly: (1) product/category/banner images
  are optional in the data model, and next/image can throw on a missing
  `src` where a plain `<img>` just silently renders nothing — falls back
  to a new `public/placeholder-image.svg` (public/ was completely empty
  before this); (2) the admin dashboard's upload forms preview a picked
  file via `URL.createObjectURL()` before it's uploaded — a `blob:` URL,
  which next/image's optimizer can't process — handled via `unoptimized`,
  as is the SVG placeholder itself (Next disallows SVG through the
  optimizer by default, `dangerouslyAllowSVG` deliberately left off rather
  than weakened sitewide for one static asset).
- **Fonts**: migrated Inter + Playfair Display from manual Google Fonts
  `<link>` tags (plus a second, fully duplicate `@import` in globals.css —
  the same two fonts were being fetched from Google twice over on every
  visit) to `next/font/google` (`lib/fonts.js`). Self-hosted, non-blocking,
  automatic `font-display: swap`. Let the CSP in `middleware.js` narrow
  `font-src`/`style-src` to `'self'` as a direct consequence — nothing
  external is fetched for fonts anymore.
- **Dynamic imports / code splitting**: all 8 `dashboard/analytics` tabs
  (6 of which import `recharts`) were statically imported into one page —
  converted to `next/dynamic` with a shared loading skeleton, by far the
  single biggest bundle-size win found. `InvoiceModal` dynamically
  imported (`ssr:false`) at its two usage sites. `jspdf`/`jsbarcode` were
  already dynamically imported inline by an earlier batch — confirmed,
  left alone. Deliberately did NOT dynamic-import `BarcodeScanner`: it's
  39 lines, zero heavy dependencies, and always visible on its page —
  would add a loading waterfall for no bundle-size benefit.
- **Memoization**: `ProductCard` and `CampaignSection`/`CampaignProductCard`
  wrapped in `React.memo` (list items re-rendered on every unrelated
  parent update otherwise). New `store/campaignSelectors.js` — a
  `createSelector`-memoized `productId → campaign` Map, replacing an
  O(campaigns × their products) `.find()` scan that both `ProductCard`
  and the product page used to run on every single render.
  `GlobalProvider`'s context value (previously a fresh object literal
  built on every render, re-rendering every single `useGlobalContext()`
  consumer app-wide whenever GlobalProvider itself re-rendered for any
  reason) is now wrapped in `useMemo` — confirmed first that all 11
  grouped functions were already individually `useCallback`-wrapped,
  since memoizing the wrapper object only actually helps if its members
  are themselves stable.
- **Server Components / Streaming / ISR** (the architecturally significant
  part): `product/[product]`, `category/[slug]`, and
  `[category]/[subCategory]` converted from fully client-rendered pages
  (fetch in a `useEffect` after mount, loading skeleton, soft-404s) into
  async Server Components with `generateMetadata`, direct Mongoose reads
  (new `server/data/*.js` — same pattern `layout.jsx` already used for
  site settings, bypassing the Express-style controllers on purpose to
  avoid a pointless self-HTTP-hop), real `notFound()` 404s, and
  `revalidate` (60s product / 300s category+subcategory). Genuinely
  interactive/personalized pieces (gallery, add-to-cart/buy-now,
  currency+campaign-aware pricing, suggestions) extracted into small
  client components fed by props instead of doing their own fetch.
  `loading.js` added for all three routes (Suspense streaming boundaries)
  plus a global `not-found.js`.
  **Deliberately NOT attempted**: converting the homepage, cart, checkout,
  or dashboard to Server Components. This app's storefront is built
  around Redux (GlobalProvider fetches categories/settings/campaigns/
  coupons/rates on mount; the homepage separately fetches five more
  analytics-driven product rows), and a from-scratch rewrite of that
  working, 15-batches-hardened system — untestable live in this sandbox —
  is not a responsible move for a Performance/SEO pass. The three routes
  above were chosen because they're what search/social traffic actually
  lands on and their core identity (what a product/category *is*) doesn't
  depend on cart/currency/campaign state the way their *displayed price*
  does.
- **Route cache / API cache / "Redis-ready"**: new `lib/cache.js` — an
  in-process TTL cache with a Redis-shaped async interface
  (`get/set/del/getOrSet/invalidate`), explicitly NOT changing
  `apiHandler.js`'s HTTP `Cache-Control` behavior (a previous batch
  deliberately left that alone for reasons that still apply — see that
  file's own comment). Wired into `category`/`subCategory`/`siteSettings`/
  `campaign` controllers' public reads (with invalidation on every
  mutation endpoint) and into the new product/category/subcategory
  Server Component data fetchers. Added a MAX_ENTRIES=500 FIFO eviction
  safety net before using it for per-product keys specifically (the
  category/settings/campaign caches each have exactly one key; products
  don't). Behaviorally tested, not just syntax-checked.
- **Request de-duplication**: `lib/axios.js`'s exported `Axios` is now a
  thin wrapper, not the raw instance — for an explicit allowlist of
  known-safe read endpoints (this app sends several conceptually-read
  operations as POST-with-body, so a naive "GET only" rule would have
  missed most of the actual traffic), concurrent identical in-flight
  requests share one promise instead of firing twice. All existing
  interceptor/retry/401-refresh logic on the underlying instance is
  untouched.
- **Compression / preconnect / render-blocking**: `next.config.mjs` now
  explicitly sets `compress: true` and `images.formats:
  ['image/avif','image/webp']`; added `@next/bundle-analyzer` (guarded
  behind `ANALYZE=true`, `npm run analyze`). Added an explicit
  `<link rel="preconnect">` to Cloudinary in the root layout (real,
  universal, per-page dependency); removed the now-unnecessary Google
  Fonts preconnect links. The Google Analytics snippet moved from a raw
  `<script>` tag to `next/script` with `strategy="afterInteractive"`.
- **Edge Runtime**: not extended beyond where it already applies
  (middleware, which runs on Edge as a Next.js requirement, not a choice).
  Nearly the entire API surface depends on Mongoose/bcryptjs/
  jsonwebtoken/Cloudinary/Stripe/Resend/multer — all already declared
  Node-only via `serverComponentsExternalPackages` — so forcing
  `runtime:'edge'` anywhere else would break, not help. Stated plainly
  rather than papered over.

### Section 10 — SEO
- **Metadata API / Open Graph / Twitter Cards**: root layout gained
  `metadataBase`, a `title` template (`'%s | SiteName'`, so any child page
  setting its own title gets composed automatically instead of every page
  re-fetching settings to string-concat it), and full `twitter{}`
  metadata (previously absent entirely, sitewide). The product/category/
  subcategory pages each now export real `generateMetadata` built from
  the actual item — previously every product page shared the exact same
  sitewide default title/description, the single biggest gap this pass
  found.
- **JSON-LD / Structured Data**: new sitewide, always-on Organization +
  WebSite (+ `SearchAction`, pointed at the real `/search?q=` route)
  JSON-LD in the root layout, additive alongside (not replacing) the
  admin's existing optional custom JSON-LD field. New Product +
  BreadcrumbList JSON-LD on the product page; BreadcrumbList + ItemList on
  category/subcategory pages.
- **Breadcrumbs**: added a visible breadcrumb UI to the product page
  (previously had none at all — category/subcategory pages already had
  one).
- **Robots / Sitemap / RSS**: sitemap gained subcategory URLs (that route
  existed, was crawlable, and had simply never been listed — an outright
  gap, not a design choice); robots.txt's default fallback gained
  `Disallow: /api/`, `/dashboard/` and a `Sitemap:` line (admin's own
  saved override still takes full, unchanged precedence). Both switched
  from `force-dynamic` to `revalidate=3600` (ISR) — Route Handlers support
  the same segment config as pages, no need to recompute either from the
  database on literally every single crawler hit. New `rss.xml` route —
  latest-50-products feed, `application/rss+xml`, XML-escaped (behaviorally
  tested against adversarial product names containing `&`/`<`/`>`/quotes).
- **Canonical / noindex**: per-page `alternates.canonical` on all three
  rewritten routes. Every `page.jsx` in this app is a Client Component
  (checked across the whole tree), which can't export its own `metadata` —
  rather than wrap ~10 routes in new pass-through `layout.js` files,
  `middleware.js` now sets `X-Robots-Tag: noindex, nofollow` for
  cart/checkout/login/register/forgot-password/reset-password/verify-otp/
  success/cancel/dashboard, which is the header-level equivalent of the
  same meta tag and needed only one file.
- **404 handling**: product/category/subcategory pages now call real
  `notFound()` instead of silently rendering an empty/placeholder state at
  200 OK. Worth calling out specifically for `[category]/[subCategory]`:
  it's a ROOT-level two-segment dynamic route (matches any `/x/y` not
  claimed by a more specific route), so this was a real, if unglamorous,
  fix — every malformed or guessed 2-segment URL used to be a soft-404.
  The new data fetcher also checks that the subcategory actually belongs
  to the category (the old lookup never did), since a real-but-unrelated
  ID pair is exactly the kind of case proper 404 handling needs to catch.

### Mistakes made and caught along the way (stated plainly, not glossed over)
- The syntax-checking tool's first draft silently reported zero errors
  unconditionally, on any input — a wrong esbuild CLI flag form combined
  with grepping for the wrong error-text pattern. Caught by deliberately
  feeding it a broken file before trusting it further; both scripts in
  this batch were re-validated against fixtures after every meaningful
  change to their own logic, not just written once and assumed correct.
- The import/export checker's first version didn't recognize
  `export const { a, b } = someSlice.actions` — the destructuring pattern
  every single Redux slice in this codebase actually uses — and flagged
  two real, correct imports as broken. Investigated before assuming
  either the app or the tool was at fault; it was the tool. Fixed and
  re-validated.
- Introduced a real naming collision while wiring `lib/cache.js` into
  `layout.jsx` (`import { cache } from "react"` vs. a second `import
  cache from "@/lib/cache"`) — caught by manual review before running the
  checker on it, fixed by renaming the import.
- First draft of `ProductPurchasePanel.jsx` dynamically imported
  `axios`/`api` inside a click handler for no real reason — inconsistent
  with how the rest of the app uses those modules, no bundle-size benefit
  for a lightweight, always-needed pair. Reverted to static imports.
- Two literal typos (`#` instead of `//` on comment-continuation lines in
  `robots.txt/route.js`) were genuine syntax errors, caught immediately by
  the syntax checker and fixed.
- First draft of the RSS feed hardcoded "Shah Premium Foods" as the site
  name instead of reading it from settings like every other piece of
  metadata in this pass — inconsistent, fixed to read the same cached
  settings key `layout.jsx`/`siteSettings.controller.js` already use.

Verified: full project (210 `.js`/`.jsx` files + `globals.css`), 0 syntax
errors, 0 import/export problems, across the whole `src/` tree, not just
the files touched in this batch. As stated above, no live build/Lighthouse
run was possible in this sandbox — that remains the one thing to actually
run before deploying.

---

## Batch 15 — CRITICAL REGRESSION FIX: reverted `mongoose.set("sanitizeFilter", true)`

Bug report: analytics (all 5 tabs), checkout, and the storefront's own
product listings (homepage, product detail, category/subcategory pages)
were all returning 500s or silently showing no products, with errors
like `Cast to date failed for value "{ '$gte': ..., '$lte': ... }"` and
`Cast to ObjectId failed for value "{ '$in': [...] }"`.

**Root cause, and an honest account of the mistake**: Batch 13 added
`mongoose.set("sanitizeFilter", true)` as a "defense-in-depth" layer,
reasoning it would be a safe addition on top of the custom
`sanitizeInput()` from Batch 9. That reasoning was wrong in a way that
broke a large part of the site: `sanitizeFilter: true` doesn't just
strip dangerous operators from untrusted input — it treats ANY
object-shaped filter *value* as untrusted by default and wraps it in
`{ $eq: ... }` unless that specific filter is explicitly marked safe via
`mongoose.trusted({...})`. That requirement applies just as much to the
application's own server-constructed queries as to anything a client
sends — and this codebase legitimately builds filters with query
operators constantly: analytics date-range filters
(`{ createdAt: { $gte, $lte } }`), product lookups by an ID array during
checkout (`{ _id: { $in: [...] } }`), and more, across **17 different
controller files** (confirmed by grep, not estimated). None of those
were wrapped in `mongoose.trusted()`, so every one of them broke — Mongo
tried to cast the whole `{ $gte, $lte }` / `{ $in: [...] }` object as a
literal value against the field's real type (Date/ObjectId) and failed.

**Fix**: reverted `mongoose.set("sanitizeFilter", true)` entirely — not
replaced with a "fixed" version, a straight revert — because the custom
`sanitizeInput()` (Batch 9, wired into `apiHandler.js`) already correctly
handles the actual threat model here: it strips `$`-prefixed keys from
REQUEST data (query/body/params) before any controller ever sees it,
which is exactly where a filter-injection risk from untrusted input
would enter. It doesn't share this false-positive problem because it
never touches filters the server builds internally, only what arrives
from the client — making it the correct single layer for this concern,
not one of two that turned out to conflict. `strictQuery` (added in the
same original batch, an unrelated setting about rejecting queries by
undefined schema paths) is unaffected and stays enabled.

This is a real mistake, called out plainly rather than glossed over: a
security hardening change was made without fully accounting for how
Mongoose's `sanitizeFilter` interacts with the application's own
legitimate use of query operators, and it shipped in three batches
across several "Continue" turns before surfacing as a live bug report.
The fix is a one-line revert with no other code changes needed, since
the redundant, correctly-scoped protection was already in place the
whole time.

Verified: 193 files, 0 syntax errors, 0 import/export issues.
**This one is worth a real functional test, not just static
verification** — reload Analytics (all tabs), place a test order, and
confirm products actually appear on the homepage/category pages again.

---



### Found and fixed one real landmine while auditing the response layer
`apiHandler.js`'s shared response builder had its OWN fallback default of
`sameSite: "none"` in production for any `res.cookie()` call that didn't
explicitly pass its own `sameSite` — the exact same CSRF-weakening
default already fixed in Batch 9's `cookieOptions`, but at a different
layer. The one current caller (`user.controller.js`) always passes an
explicit value, so this was dormant rather than active, but any future
`res.cookie()` call anywhere in the codebase that omitted `sameSite`
would have silently reintroduced the weakness. Fixed the fallback itself,
not just the one call site that happens to override it today.

### Standard API Response
Already consistent across the codebase by convention —
`{ message, error, success, data? }` on every controller response,
confirmed by inspection rather than assumed. The new global error/
timeout responses added below deliberately use this exact same shape,
so a client can't tell a genuine controller error apart from an
infrastructure-level one by response shape.

### Error Handling — structural fix, not just a new feature
`apiHandler.js`'s `createNextHandler` is now a thin wrapper around the
actual request handling: ANY uncaught error — from a controller that
forgot its own try/catch, a middleware throwing, anything — is now
caught in exactly one place and turned into the same standard error
shape, instead of propagating up into Next.js's own error handling. This
is a direct structural fix for the class of problem diagnosed in Batch
12 (the confusing React-hook-call crash cascade) — that specific
incident traced back to a stale build, not application code, but the
underlying gap it exposed (nothing caught a raw thrown error before it
reached Next's fallback rendering) was real independent of what
triggered it that time.

### Logging
New structured JSON log line per completed request
(`apiObservability.js`'s `logRequest`) — method, path, status, duration,
request/correlation IDs, IP. Request bodies are only logged for non-2xx
responses (less noise, more debugging value exactly when needed), and
always redacted first (password/token/OTP/authorization/cookie fields
never reach a log line, even server-side ones — hosting-platform log
access is still a real exposure surface).

### Validation
Hand-rolled rather than adding a schema-validation library (zod/yup/joi)
for this — `lib/validate.js`, applied to the highest-value, most
attacker-facing endpoints: email FORMAT validation (not just presence)
on register/forgot-password, mobile format validation on both address
endpoints. Honest scope note: this validates a handful of the most
consequential fields on the most attacker-facing endpoints, not a full
schema-validation rollout across all 23 controllers — the existing
presence-checks (`if (!field)`) everywhere else are unchanged and still
the app's primary input gate.

### Versioning
`X-API-Version` response header, applied globally. Deliberately NOT a
`/api/v1/...` URL restructure — this app's ~150 routes and every
frontend call site already assume today's unversioned paths, and there's
no actual second API version to distinguish yet; retroactively
restructuring every URL would be a large, purely mechanical,
high-regression-risk change for no functional benefit right now. The
header is real, non-breaking groundwork if a genuine v2 is ever needed.

### Request IDs / Correlation IDs
Both generated (or, for correlation ID, echoed back if the client
already sent `X-Correlation-Id`) on every request, included in every
response's headers and every log line — makes it possible to trace one
specific request from a bug report straight to its server log line, and
to follow one logical multi-call operation across a whole log stream.

### Pagination — found a genuinely widespread gap, fixed centrally
Audited list/pagination endpoints and found a pattern repeated across
roughly a dozen controllers (inventory, customer, analytics, support
ticket, product request, activity, product, etc.): a client-supplied
`limit` with a sane default but NO upper bound —
e.g. `limit = limit || 10` doesn't stop a caller from sending
`limit: 999999` and forcing a huge query/response on demand. Rather than
hand-edit ~10 files individually (real risk of a typo breaking one, for
an identical fix in every case), this is now clamped globally in
`apiHandler.js` — any `limit` field on any request's query or body is
capped at 200 (comfortably above every legitimate default anywhere in
this codebase; the highest found was 15), closing the gap everywhere at
once instead of file by file.

### Filtering / Sorting
Already reasonably implemented per-endpoint where relevant (status/
department/category filters on various list views; sort is mostly a
fixed, sensible `createdAt: -1` rather than client-controlled — not
revisited in this pass since client-controlled arbitrary sort fields are
more a feature-completeness question than a security gap, and the
current fixed-sort approach is actually the safer default).

### Compression — deliberately NOT implemented, explained rather than skipped silently
Considered manually gzip-compressing JSON responses in `apiHandler.js`,
and decided against it: most modern hosting (Vercel and similar
platforms) already compresses responses transparently at the edge, and
self-hosted deployments typically put a reverse proxy (nginx/Caddy) in
front of a Node app specifically so compression is handled at that
layer, not in application code. Manually compressing here risks
double-compression or a mismatched `Content-Encoding` header on
platforms that already handle it — a real failure mode (broken/
undecodable responses) that can't be tested from this sandbox. Standard
guidance stands instead: ensure whatever sits in front of this app
(hosting platform or reverse proxy) has compression enabled, which is
the correct layer for this concern.

### Caching
Every API response now defaults to `Cache-Control: private, no-store`
unless a controller already set its own (none currently do). This is
the real security angle on "caching" for an API like this one: most
responses are authenticated/personal (orders, profile, cart) or admin
data, and a shared proxy/CDN caching one of those because nothing said
not to would be a genuine sensitive-data-exposure bug. Deliberately did
NOT add selective public-caching rules for specific "safe" endpoints
(e.g. category lists) in this pass — picking the wrong one and shipping
an untestable staleness bug is a worse outcome than every response
being consistently fresh.

### Timeouts
25-second global timeout wraps every request; a client gets a clean 504
instead of hanging indefinitely. Honest limitation stated directly in
the code: this bounds how long the CLIENT waits, it does NOT cancel the
underlying DB query/external call server-side (true cancellation would
need an `AbortController` threaded through every Mongoose query and
external API call in every controller — not attempted in this pass).

### Retry — already correctly implemented, confirmed rather than duplicated
Found `lib/axios.js` already has a well-built retry layer from an
earlier session: GET-only (explicitly, with a comment on why — retrying
POST/PUT/DELETE could double-charge a card or duplicate an order),
network-errors and 502/503/504 only, capped at 3 attempts with backoff.
This already correctly implements the idempotency-safety nuance that
matters most here — confirmed by reading it, not re-implemented.

Verified: 193 source files, 0 syntax errors (`esbuild` transform pass),
0 import/export issues. Static verification only, as with every batch —
the timeout/error-handling/logging wrapper in particular is exactly the
kind of change worth exercising against a real running dev server
(trigger a deliberate error in a controller and confirm a clean JSON 500
comes back instead of a crash; check that `X-Request-Id`/
`X-Correlation-Id`/`X-API-Version` headers appear on a real response).

---



### Section 4 — Rate Limiting
- Fixed a design gap before adding new buckets: rate-limit keys now use
  the FULL request path (`POST:/api/user/login`) instead of just the
  reconstructed sub-path (`POST:/login`) — the sub-path alone isn't
  globally unique (two different resource groups could share a sub-path
  string like `/search` or `/upload`), so this closes a theoretical
  bucket-collision gap before it could ever matter in practice.
- New buckets: **Search** (30/min/IP), **Cloudinary upload** (avatar
  15/hr, general 30/hr — protects Cloudinary quota/cost, not just server
  load), **Stripe** (checkout + delivery-charge-payment, 10/15min each —
  every call creates a real Stripe Checkout Session, a cost/quota concern
  as much as a security one). Global API limiter, Login, OTP, and
  Forgot-Password limiters were already done in Batch 9.
- **Progressive delays + account lockout**: 5 failed logins locks the
  *account* (not just rate-limits the IP), with the lockout duration
  doubling on each further failure (30s → 1min → 2min... capped at
  30min).
- **IP blocking**: an IP that racks up failed logins against 8+
  *distinct* accounts gets blocked outright for an hour — this is
  deliberately a different signal than the account lockout above: the
  lockout catches one account attacked from many IPs (distributed brute
  force), the IP block catches one IP attacking many accounts
  (credential stuffing / password spraying), which per-IP rate limiting
  alone can't distinguish from normal traffic since no single account
  crosses its own threshold.
- All wired into `loginUserController`, checked before the DB lookup so
  a blocked attempt costs almost nothing.

### Section 6 — File Upload Security
- **Real finding**: `multer.js` was never actually imported anywhere in
  the app — its "5MB limit" was dead code. Actual multipart parsing
  happens via `Request.formData()` directly in `apiHandler.js`, which is
  where the real limit (and everything else below) now lives.
  `multer.js` left in place but clearly marked dead, in case anything
  external still references the path.
- **Magic-byte validation**: real file-signature checking (JPEG/PNG/GIF/
  WebP/ICO), independent of the spoofable client-supplied Content-Type
  header — this is what actually makes "prevent executable upload" true
  structurally (an allowlist of recognized image signatures), not a
  separate blocklist to maintain.
- **Virus scan placeholder**: real integration point in
  `lib/fileUploadSecurity.js`, called on every upload before it reaches
  Cloudinary — honestly documented as unable to run a real scanner in
  this sandbox; always reports clean until wired to a real provider
  (deliberately doesn't block everything as a "safer" default — a
  placeholder that silently blocks all uploads would be worse than no
  placeholder).
- **Image compression**: Cloudinary `quality: "auto"`, applied
  universally.
- **Convert to WebP / strip metadata — caught and avoided a real
  regression**: initially force-converted every upload to WebP at
  upload time, then found `dashboard/product-requests/page.jsx` fetches
  a submitted photo's Cloudinary URL raw and embeds it in a jsPDF export
  hardcoded as `"JPEG"` — forcing the stored asset to WebP would have
  silently broken that export. Reverted: compression stays universal,
  WebP conversion is now an opt-in delivery-time URL transform
  (`cloudinaryWebpUrl()` in `lib/utils.js`) for call sites that display
  an image in `<img>`/CSS only. Not yet retrofitted into every existing
  `<img>` tag site-wide — that's a larger, separate visual-component
  pass, listed below as still open.
- **Random filename**: confirmed already correct (Cloudinary's default
  public_id generation, since no `public_id`/`use_filename` was ever
  passed) — documented so it doesn't get "fixed" into the less-safe
  behavior later.

### Section 7 — Database Security
- `mongoose.set("sanitizeFilter", true)` and `strictQuery` set at module
  load, before any query can run — layered on top of (not instead of)
  the custom `sanitizeInput()` from Batch 9.
- **Indexes**: audited all models. Found and fixed real gaps —
  `Address.userId` and `CartProduct.userId` had NO index despite being
  filtered on every single fetch (full collection scans); `Product` had
  no index supporting `{ publish, category }` storefront browsing or
  `stock`-based inventory queries; `Notification`'s existing
  `createdAt`-only index didn't actually support its real query pattern
  (filtered by `targetModule`, then sorted) — added a proper compound
  index for it.
- **Transactions — the most significant fix in this batch**: order
  creation was NOT atomic. Stock decrement, coupon-usage increment,
  order save, and cart clearing were 4-5 independent writes — if the
  process crashed or threw partway through (e.g. between decrementing
  stock and the order actually saving), the result was permanently
  corrupted state (stock gone with no order, or a coupon marked used
  with nothing to show for it). All three order-creation paths
  (`cashOnDeliveryOrderController` and both branches of the Stripe
  webhook) now run as one all-or-nothing MongoDB transaction.
- **Found and fixed a genuine pre-existing bug while adding
  transactions**: stock decrement used to read `stock`, compute the new
  value in JS, then write it back — a classic race condition (two
  concurrent orders for the same product could read the same starting
  stock and the second write would silently clobber the first), AND it
  silently clamped insufficient stock to zero instead of rejecting the
  order — meaning overselling was already possible with no error at
  all. Fixed with a single atomic conditional update
  (`findOneAndUpdate({ stock: { $gte: quantity } }, { $inc: { stock:
  -quantity } })`) that can't race and that actually rejects when stock
  is insufficient.
- **One deliberate nuance**: the Stripe webhook path uses `allowOversell:
  true` on that same atomic update — by the time the webhook fires,
  Stripe has ALREADY captured payment, so rejecting the order over
  insufficient stock at that point would mean keeping the customer's
  money with no order and no product, a worse outcome than a rare,
  logged, admin-visible oversold state. The pre-payment COD path
  correctly still rejects.
- **Optimistic concurrency**: added to `Product` and `Order` schemas.
  Verified (not assumed) which existing `.save()` call sites this could
  actually affect — found `campaign.controller.js`'s
  `syncProductCampaignDiscount()` does a real fetch→mutate→save on
  Product, and `updateOrderStatusController`/`cancelOwnOrderController`
  do the same on Order; both are already inside try/catch blocks, so a
  new (rare) `VersionError` on a genuine concurrent edit becomes a
  normal error response, not a crash — and surfacing that conflict is
  the intended improvement over the previous silent-lost-update behavior.
- **TTL indexes — explained rather than faked**: a real MongoDB TTL
  index deletes a whole document once a date field is in the past. OTP
  fields live directly on the User document (a TTL index on their
  expiry would delete the whole account) and sessions are subdocuments
  in an array on the User document (TTL indexes don't operate on
  individual array elements at all) — neither fits a TTL index without
  moving them into their own top-level collections, a real schema
  refactor not attempted in this pass given how much session-rotation
  logic already depends on the current embedded-array shape. Implemented
  the honest, safe equivalent instead: sessions are now opportunistically
  pruned of expired entries every time the array is read or written
  (`pruneExpiredSessions()` in `sessionManager.js`), so they don't
  accumulate indefinitely even without a TTL index doing it in the
  background.
- **Unique indexes**: audited — already correct everywhere it matters
  (`User.email`, `Order.orderId`, `Coupon.code`, `Role.name`).
- **Connection pooling + retry strategy**: added explicit
  `maxPoolSize`/`minPoolSize` and `retryWrites`/`retryReads` to the
  Mongoose connection call. Connection-establishment retry-with-backoff
  was already implemented well before this batch.
- **Projection / lean queries**: added `.lean()` to the highest-traffic
  read-only endpoints (all public product browsing/search/detail
  queries in `product.controller.js`) as a representative, real
  implementation — NOT a full audit of every read query across all 23
  controllers, which is a larger undertaking than this pass covered.

### Still open / honestly not done in this pass
- Site-wide `<img>` tag adoption of `cloudinaryWebpUrl()` — the helper
  exists and is documented, but wasn't retrofitted into every product
  card / banner / avatar component (visual-regression risk untestable in
  this sandbox).
- A true TTL-index-based session/OTP expiry would require moving them
  into dedicated collections — noted as a real architectural option, not
  attempted here.
- `.lean()` / projection audit is representative (product browsing),
  not exhaustive across all 23 controllers.

Verified: 191 source files, 0 syntax errors (`esbuild` transform pass),
0 import/export issues. **Static verification only, and this batch in
particular touches money-critical code (Stripe webhook, stock/coupon
consistency) that genuinely needs a live MongoDB replica set + live
Stripe test-mode webhook to be truly confidence-checked** — neither is
available in this sandbox. Recommend testing, in order: (1) place a COD
order, confirm stock decrements once and the order/cart/coupon-usage all
appear correctly; (2) place two near-simultaneous orders for a product
with exactly 1 unit of stock in two browser tabs, confirm only one
succeeds and the other gets a clear "insufficient stock" error, not a
crash or a negative stock value; (3) a full Stripe test-mode checkout,
confirming the webhook creates the order correctly.

---



Bug report included: (1) `Invalid hook call`/`useContext`/`useMemo` crashes
from Next's own bundled React while rendering `/_error` for a failed
`GET /api/inventory?lowStock=true` request, and a `GET /api/admin/
badge-counts 404`; (2) `GET /login?email=...&password=...` appearing
in the dev server's request log several times.

**Investigated both — neither is a bug in this codebase's current code:**

- `grep`ed the entire repo for `/api/inventory` (bare, no sub-path) and
  `/api/admin/badge-counts` — zero matches anywhere. The real inventory
  endpoints are `/api/inventory/list`, `/api/inventory/low-stock`, etc.
  (see `lib/api.js`), all of which exist and work. Nothing in this app
  calls the two broken URLs in the report. Diagnosis: a stale browser tab
  still running an older build's JS (from a previous session/zip version,
  before those routes were renamed/removed) polling against the current
  dev server — 404/500 on a route that no longer exists → Next dev tries
  to render its `/_error` debug overlay for that failed request → *that
  render* is what's crashing with the hook errors, a known Next.js
  dev-mode fragility (often triggered by a stale `.next` cache,
  especially right after `middleware.js` was added while the dev server
  was already running). Fix is operational, not code: close all
  `localhost:3000` tabs, `rm -rf .next`, restart `npm run dev`, open a
  fresh tab. One honest caveat on this diagnosis: the log's last line
  shows that exact same path, `GET /api/inventory?lowStock=true`,
  returning 200 later on — and Next.js's file-based router doesn't
  "flakily" 404/500 vs. 200 the same never-matching path within one
  build, it's deterministic. What IS verifiable directly from this repo:
  no file matches a bare `/api/inventory` request in the current
  source (only `/api/inventory/[...segments]/route.js`, a catch-all that
  requires ≥1 path segment — `/list`, `/low-stock`, etc. — and doesn't
  match zero segments at all), so nothing in this exact codebase could
  serve either response for that literal path. That gap — same literal
  URL, different outcomes, no code here that explains either outcome — is
  itself the signature of stale cached code (an old `.next` build and/or
  an old browser tab) being served instead of the current source at some
  point during that session, which is why "clear cache, fresh tab" is the
  right fix even though the exact mechanics of that one log line aren't
  fully reconstructable from the log alone.
- `LoginPage` was directly read: it only ever submits via
  `handleSubmit()` (react-hook-form, which calls `preventDefault`
  internally) and never reads `useSearchParams()` for email/password —
  so the app itself has no code path that would produce a
  `?password=...` URL or read one back. Most likely explanation: manual
  testing via the browser address bar.

**Real hardening added anyway** (cheap, and good practice regardless of
root cause): `login`, `register`, and `reset-password` pages now scrub a
stray `password`/`email` (login), `password` (register), or
`password`/`newPassword`/`confirmPassword` (reset-password) query param
from the URL immediately on mount via `router.replace()` — without ever
reading or using the value — so a credential that ends up in a URL by any
means (bookmark, shared link, manual paste, browser extension) doesn't
sit in the address bar, browser history, or get sent in a Referer header
to Google Fonts/Analytics. `reset-password`'s legitimate `email` param
(passed through from the OTP step, not sensitive) is left untouched.

Verified: 190 files, 0 syntax errors.

---



Bug report: `Uncaught EvalError ... violates ... script-src ... 'unsafe-eval'
is not an allowed source`, pointing at
`@next/react-refresh-utils/dist/runtime.js`.

Root cause: Next.js dev mode's Fast Refresh / webpack HMR runtime loads
modules via `eval()` — that's how hot-reloading works under the hood in
dev — and Batch 9's CSP (`script-src 'self' 'nonce-...' + GA host`, no
`'unsafe-eval'`) correctly blocked it, which is exactly what a strict CSP
is supposed to do to arbitrary `eval()` calls — it just didn't
distinguish "arbitrary/injected eval" from "Next's own dev-only tooling."

Fix (`src/middleware.js`): `'unsafe-eval'` is now added to `script-src`,
and `ws: wss:` to `connect-src` (for the HMR livereload websocket), ONLY
when `NODE_ENV !== "production"`. The production CSP is completely
unchanged from Batch 9 — nonce + self + the one named GA host, no
`unsafe-eval`, no relaxation at all — since Next's production build
never uses `eval()` for its own code, there's no legitimate need for it
there and no reason to weaken the production policy to fix a dev-only
problem.

Verified: 190 files, 0 syntax errors.

---



Batch 9 already covered `Content-Security-Policy` (nonce-based, via
`middleware.js`), `Strict-Transport-Security`, `Referrer-Policy`,
`Permissions-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, and
removed `X-Powered-By`. This batch adds the rest of the explicitly
requested list, all in `next.config.mjs`'s `headers()` (each with its own
in-file comment on the exact value chosen and why):

- **Cross-Origin-Opener-Policy**: `same-origin`. Safe here since this
  app's Stripe integration is a full top-level redirect
  (`window.location.href = session.url`), never a popup, so there's no
  `window.opener` relationship this could break.
- **Cross-Origin-Embedder-Policy**: `credentialless`, deliberately NOT
  the stricter `require-corp`. `require-corp` would require every
  cross-origin resource this site loads (Cloudinary/Unsplash product
  images, Google Fonts, the optional GA script) to serve its own
  `Cross-Origin-Resource-Policy` header — outside this app's control —
  and fails CLOSED (silently breaks image/font/script loading) if even
  one doesn't. `credentialless` gets most of the same cross-origin-
  isolation benefit without that fragility, since it only requires CORP
  on resources loaded WITH credentials, which nothing in this app does.
  Flagged as the one header in this batch that genuinely can't be fully
  confidence-checked without a live browser hitting the deployed site —
  recommend verifying product images / fonts / GA still load after
  deploying.
- **Cross-Origin-Resource-Policy**: `same-origin`. Governs whether OTHER
  sites can load resources FROM this one — doesn't affect Open Graph
  scraping (server-side crawlers aren't browsers and don't enforce CORP)
  and has no effect on product images anyway (those are served by
  Cloudinary, not this app).
- **X-DNS-Prefetch-Control**: `off` (matches helmet.js's own secure
  default — small privacy hardening).
- **X-Download-Options**: `noopen` (legacy IE-only mitigation, harmless
  on modern browsers).
- **Origin-Agent-Cluster**: `?1`.

`X-XSS-Protection` was also already present from Batch 9 (kept for
legacy browser compatibility even though modern browsers ignore it in
favor of CSP).

Verified: `next.config.mjs` syntax-checked directly with `node --check`
(this file lives outside `src/`, so it isn't covered by the project's
`src/`-scoped syntax checker) — passes clean. No other files touched this
batch.

---



Large, multi-part request: audit + implement enterprise security across
authentication, authorization, and OWASP Top 10 mitigations. This was
worked through in priority order across three "Continue" turns. Below is
an honest, item-by-item accounting against everything that was asked for
— marked ✅ done, 🔶 partial (with exactly what's left), or **N/A**
(verified not applicable to this stack, not silently skipped).

### Authentication
- ✅ **Secure JWT implementation** — separate secrets for access/refresh
  (already existed, verified), both required at startup or the relevant
  controller throws rather than silently signing with `undefined`.
- ✅ **Short-lived access token** — 5h → 15m (`generateAccessToken.js`).
- ✅ **Refresh token rotation** — every refresh issues a new refresh token
  (new `jti`); the one just used is immediately invalid, whether or not
  its 7-day expiry has passed. **Reuse detection**: replaying an
  already-rotated token revokes every session on the account.
  (`generateRefreshToken.js`, `sessionManager.js`, `refreshTokenController`)
- ✅ **Secure cookies** — `httpOnly` + `secure` in production (already
  existed) — plus fixed `sameSite` from `"None"` in production (a
  cross-site-cookie setting that was actively weakening CSRF protection
  for what is, per this app's own architecture, a same-origin deployment)
  to `"Lax"`, with a code comment on when it would need to change back.
- ✅ **CSRF protection** — Origin/Referer verification for all
  state-changing requests, in `apiHandler.js` (every one of the 23 API
  resource groups routes through it). Stripe's webhook already bypasses
  this file entirely (own signature verification), unaffected.
- ✅ **Session invalidation** — password reset/change now revokes other
  sessions; new "log out of all devices" action.
- ✅ **Token revocation** — per-device session revocation (list + revoke
  one, from the new Active Sessions section on the Profile page).
- ✅ **Email verification** — already existed (OTP-based), verified working.
- ✅ **Password reset** — already existed (OTP-based), verified working,
  now additionally enforces the password policy below and revokes
  sessions on success.
- ✅ **Multi-device login support** — this was actually backwards before:
  a single `refresh_token` field meant logging in on device #2 silently
  killed device #1's session. Replaced with a real `sessions[]` array on
  the user model (`user.model.js`) — each device now has its own
  independently-valid, independently-revocable session, visible and
  manageable from Profile → Active Sessions.

### Passwords
- ✅ **bcrypt cost 12+** — was 10 in all 5 hashing call sites (register,
  reset, update-account, call-center-agent provisioning, seed script) —
  raised to 12 (seed script intentionally left at a lower/dev-appropriate
  setting is NOT the case here — it's also 12 now, for consistency).
- ✅ **Password breach detection** — best-effort HIBP k-anonymity check
  (`passwordPolicy.js`) — only a SHA-1 prefix ever leaves the server, per
  HIBP's own design. **Fails open** on network error/timeout (an HIBP
  outage can't become a signup-blocking DoS) — genuinely can't be
  exercised from the sandbox this was built in (network egress there is
  limited to package registries); the logic is correct per HIBP's
  documented API contract, but treat a real deployment's first signup as
  the actual first test of this code path.
- ✅ **Prevent common passwords** — synchronous blocklist (~150 entries),
  zero network dependency, always enforced, hard-blocks a match.

### Authorization / RBAC
- ✅ **Roles: Admin / Manager / Staff / Customer** — the existing system
  (`role.model.js` + dynamic per-module permissions) already had this
  *functionally* under different names (`MODERATOR`/`EMPLOYEE`) plus a
  bonus `ANALYST` role and full custom-role support via the admin Roles
  UI — renamed `MODERATOR`→`MANAGER`, `EMPLOYEE`→`STAFF` to match the
  requested list exactly, with an in-place migration for any existing
  installs/users already on the old names (`ensureSystemRoles()`).
- ✅ **Permissions middleware** — already existed (`permission.js`),
  verified in place.
- 🔶 **API route protection** — `auth`/permission middleware is applied
  per-route across all 23 resource groups (pre-existing), but this pass
  did NOT re-verify every single one of the ~150+ individual routes has
  the *correct* middleware for its sensitivity level one by one — that
  would be its own dedicated audit. Spot-checked several (user, HR,
  roles) and found/fixed one real gap (mass assignment below); no others
  surfaced in the areas checked.
- ✅ **Server-side protection** — mass assignment audit (see OWASP list
  below) confirms controllers don't trust client-supplied role/permission
  fields.
- 🔶 **Database protection** — NoSQL injection input sanitization is done
  (below); did NOT additionally audit DB connection security / principle-
  of-least-privilege DB user credentials / field-level encryption of any
  particularly sensitive fields — those are largely hosting/ops
  configuration (e.g., the MongoDB connection string's own user
  permissions) rather than application code, and weren't in scope for a
  code-level pass, but flagging so it isn't silently assumed done.

### OWASP Top 10
- **N/A — SQL Injection**: no SQL database in this stack (MongoDB/Mongoose).
- ✅ **NoSQL Injection** — `sanitizeInput()` in `src/lib/security.js`,
  wired into `apiHandler.js`, strips `$`-prefixed and dotted keys from
  every request body/query/params before any controller sees them.
- ✅ **Prototype Pollution** — same function also strips `__proto__`/
  `constructor`/`prototype` keys (same traversal closes both issues at once).
- ✅ **Stored XSS** — audited every `dangerouslySetInnerHTML` in the app
  (found only 2, both admin-configured content in `layout.jsx`, now
  nonce-gated by CSP + `<`-escaped against script-tag breakout). Found and
  fixed a real one: `Footer.jsx`'s social links / quick links rendered an
  admin-configured URL straight into `href` with no scheme check — an
  admin-role account (now including MANAGER/STAFF, not just SUPERADMIN)
  could store a `javascript:` URL and it would run in any visitor's
  browser on click. New `safeExternalUrl()` in `lib/utils.js` allows only
  `http:`/`https:`/`mailto:`/`tel:`/relative paths.
- 🔶 **Reflected XSS** — React escapes all rendered content by default,
  and the sweep above found no other place that routes raw input around
  that escaping; not exhaustively re-verified line-by-line across every
  page for every query-param usage.
- ✅ **CSRF** — see Authentication section above.
- **N/A — SSRF**: verified no server-side feature fetches a client-
  supplied URL anywhere in the codebase (grepped for it explicitly).
- **N/A — Open Redirect**: verified no `?redirect=`-driven navigation or
  similar pattern exists anywhere; Stripe's `success_url`/`cancel_url` are
  built from a hardcoded env var, never client input.
- ✅ **Clickjacking** — `X-Frame-Options: SAMEORIGIN` (pre-existing) +
  `frame-ancestors 'self'` in the new CSP.
- **N/A — Directory/Path Traversal**: verified no filesystem
  `readFile`/`writeFile` on user input anywhere — all "file" storage is
  Cloudinary, not local disk.
- **N/A — Command Injection**: verified no `child_process`/`exec`/`spawn`
  anywhere in the codebase.
- ✅ **Mass Assignment** — audited every controller for unfiltered
  `req.body` → Mongoose constructor/update. Found and fixed one real
  instance: `hrPayroll.controller.js`'s employee create/update passed raw
  `req.body` straight into the model, which could set `userId` (linking
  to an arbitrary login account) or `isCallCenterAgent` outside the
  dedicated flow meant to own those fields — now whitelists an explicit
  field list. `updateUserDetailsController` was already safe on inspection.
- **N/A — XML attacks**: no XML parsing library anywhere in `package.json`
  or the codebase.
- ✅ **Broken Authentication** — the whole Authentication section above.
- 🔶 **Broken Access Control** — RBAC is real and reasonably granular
  (see above), but see the "API route protection" caveat — not every
  individual route was re-verified one by one in this pass.
- 🔶 **Sensitive Data Exposure** — `.select("-password -sessions -forgot_
  password_otp -forgot_password_expiry")` patterns checked and correct
  everywhere they were touched this pass; not exhaustively re-checked
  across every controller response in the codebase for a stray leaked field.
- ✅ **Security Misconfiguration** — `X-Powered-By` disabled, HSTS added,
  real nonce-based CSP added (`middleware.js`) — no blanket
  `unsafe-inline` on `script-src`.
- ✅ **Rate limiting** (+ bypass hardening) — in-memory sliding-window
  limiter in `apiHandler.js`: tight per-IP-per-route buckets on
  login/register/OTP/password-reset/refresh, generous default elsewhere.
  Honest limitations, stated in the code: (1) in-memory + per-process —
  correct for this project's single-Node-process architecture, would need
  a shared store (Redis) if ever horizontally scaled; (2) IP-based, so a
  motivated attacker rotating IPs/using a proxy pool isn't fully stopped
  by this alone — for login specifically, the account-level defenses
  (rate limiting stacked with bcrypt's inherent per-guess cost, plus
  breach/common-password checks preventing weak passwords in the first
  place) provide the rest of the defense-in-depth; a dedicated per-account
  lockout counter would be the next layer if this becomes a concern in
  practice.

Verified: 190 source files, 0 syntax errors (`esbuild` transform pass),
0 import/export issues (fixed a checker false-positive along the way —
the checker itself now correctly recognizes `export async function`,
so this run is a clean 0, not a filtered 25). **Static verification only,
as with every batch before this one** — this is unusually true for this
batch specifically: token rotation, session management, and the HIBP
breach check are exactly the kind of logic that needs a real login →
refresh → login-on-second-device → logout-one-device flow exercised
against a live MongoDB + real network access to be truly confidence-
checked, neither of which this sandbox has. Recommend that flow as the
first real test after deploying this build, specifically: log in on two
browsers/devices, confirm both stay independently logged in, refresh a
few times on one and confirm the other is unaffected, then use Profile →
Active Sessions to sign one out remotely and confirm it's immediately
logged out.

---



## Batch 7 ("Continue") — SEO settings: admin UI + actual live use (item #23, closed)

Picked up the highest-priority carried-forward item from Batch 3's "Still
open" list: item #23 (SEO) had a `seo{}` block on the settings model and a
working sitemap.js + footer link, but the admin edit UI, the actual use of
those fields in page `<head>` metadata, and a live robots.txt route were
all still missing — so nothing an admin could actually configure ever
reached the live site except the sitemap itself. Closed all three gaps:

1. **Admin UI** (`dashboard/site-settings/page.jsx`): new "SEO" section —
   meta title/description/keywords, Open Graph image URL, canonical URL,
   Google Analytics ID, Google Search Console verification ID, structured
   data (JSON-LD, validated at save time with a non-blocking warning if
   invalid), and robots.txt content. Uses the exact same
   react-hook-form-nested-path + generic-merge-on-save pattern every other
   section on this page already uses, so no backend controller changes
   were needed for the save path itself.
2. **Actual use in `<head>`** (`app/layout.jsx`): `generateMetadata()` now
   reads the whole `seo{}` block — title/description fall back to
   siteName/a sane default same as before, plus keywords, Open Graph tags,
   canonical URL, and Search Console verification via Next's built-in
   `verification.google` metadata field. `RootLayout` itself (now async)
   injects the Google Analytics gtag snippet and a validated JSON-LD
   `<script>` when those fields are set — outside what the Metadata API
   alone can express, so done directly in the layout. Both now share one
   `cache()`-wrapped settings fetch (`getSiteSettingsForHead`) so the
   settings document is only queried once per request despite two
   consumers needing it.
3. **robots.txt** (`app/robots.txt/route.js`, new): serves whatever the
   admin typed into the new SEO section live at `/robots.txt`, falling
   back to `"User-agent: *\nAllow: /"` if unset or the DB is unreachable.
   Deliberately a plain Route Handler rather than Next's `app/robots.js`
   metadata-file convention, since that convention expects a structured
   `{rules, sitemap}` object and generates its own text — it doesn't fit
   serving an admin-editable free-form string the way the model already
   stores it. No static `public/robots.txt` or `next.config` rule exists
   to conflict with it.

Also verified (no changes needed, already correct end-to-end): item #19
(banner → landing page routing) — `Carousel.jsx`'s `bannerLandingHref()`
and `banner-page/[id]/page.jsx`'s own lookup logic use matching
`campaignId`/`productIds`/default-to-`/products` rules on both ends.

Verified: 186 source files now (was 185), 0 syntax errors (`esbuild`
transform pass), import/export sweep shows the same 25 pre-existing false
positives as every prior batch (confirmed harmless) and no new issues.
Static verification only, as before — recommend a real `npm run dev`
check of: Site Settings → SEO → save a meta title/description/GA ID/JSON-
LD block → view page source on the homepage to confirm the title/meta/
script tags appear, and hit `/robots.txt` directly to confirm it echoes
back the saved content.

### 🔶 Still open / carried forward to next "Continue"
- **#22** Liquid Glass design system consistency audit — not started this
  round; still just the partial state noted in Batch 3.
- **#25** Full responsive audit — still not done.
- **#27** Google OAuth — still not started; no new dependency needed (see
  prior note on Google Identity Services + existing JWT tooling).
- Business Analysis tab's metric registry ~70/~80 coverage note from
  Batch 3 — unchanged, still worth a line-by-line scan if full 1:1
  coverage matters.

---



## Batch 6 — three fixes: analytics currency, coupon suggestions, order-mobile requirement

### 1. Analytics dashboard now follows the navbar currency, not just the base currency
All 7 analytics tabs (Overview/Dashboard, Financial & Growth, Inventory &
Sales, Customer & Order, Marketing & Website, Expense Analysis, Business
Analysis) previously read `s.currency.baseCurrency` — the admin's Site
Settings default — regardless of what currency was picked in the navbar.
Only the Settings tab had already been switched to `s.currency.selected`
on an earlier explicit request (see that tab's own comment, which said
"until/unless asked to match" — this batch is that ask). All 7 tabs now
read `s.currency.selected`, which already tracks the base currency
automatically until a navbar override is set — so every metric across the
whole Analytics dashboard now updates immediately when the currency
changes, whether that change comes from the admin's Site Settings save or
from anyone (admin or shopper) picking a different currency in the navbar.

### 2. Coupon codes are no longer suggested to users
`CouponInput.jsx` had a "View available coupons (N)" toggle that listed
every active coupon's code, description, and an "Apply" button — letting
any shopper browse and use codes without earning/receiving them
elsewhere. Removed entirely; the box is now just a plain input + Apply/
Remove, exactly like a normal promo-code field. The unused
`activeCoupons`/`showAll` state was also cleaned up from the component
(the global fetch in `GlobalProvider` for that data was left as-is —
harmless, just no longer rendered anywhere).

### 3. Mobile number moved from the account profile to the order's delivery address
Placing an order used to hard-block with "Please add your phone number in
your profile" if the account profile's `mobile` field was empty — even
though the Profile page itself never actually marked that field as
required, so the block only ever really showed up at the worst possible
moment (checkout). Per explicit request: the account profile no longer
requires a mobile number at all; instead, the **delivery address used for
the order** now requires one, since that's the number that actually
matters for getting a delivery to someone.

- `dashboard/address/page.jsx`: the `mobile` field on the address form is
  now required (was optional).
- `server/controllers/address.controller.js`: `updateAddressController`
  now validates `mobile` the same way `addAddressController` already did,
  so an existing address can't be edited to remove it.
- `app/checkout/page.jsx`: dropped the profile-mobile block; added a
  guard on the *selected address's* `mobile`, with an inline warning on
  any address card that's missing one (with a link to fix it) plus a
  top-of-page banner and a disabled "Place Order" button until it's set.
- `server/controllers/order.controller.js` (defense in depth — never
  trust the client): all three order-creation paths
  (`cashOnDeliveryOrderController`, `payCodDeliveryChargeController`,
  `paymentController`) now validate `address.mobile` instead of
  `user.mobile`. `paymentController` (full online/Stripe payment)
  previously had **no** mobile check at all — that gap is now closed too,
  so all three payment paths are consistent. Every `customerSnapshot`
  (including both branches of the Stripe webhook) now records the
  delivery address's mobile as the order's contact number, falling back
  to the profile's only if the address one is somehow still blank.

Verified: 0 syntax errors across all 185 source files (`esbuild`
transform pass) and the import/export-resolution sweep found the same 25
pre-existing false positives as before (confirmed harmless — the
checker's regex doesn't match `export async function`) and no new issues.
Static verification only — a real `next build`/`npm run dev` smoke test
is recommended for: (a) switching currency in the navbar and confirming
every Analytics tab updates, (b) confirming no coupon list appears
anywhere near the Apply Coupon box, (c) placing an order with an empty
profile mobile but a valid address mobile (should succeed), and an
address with no mobile (should be blocked with the new message).

---



## Batch 5 — Currency selection reverting to admin base currency on refresh (fixed)

### 🐞 Bug: picking a currency from the navbar worked, but reverted to the
admin's site-wide base currency the moment the page was refreshed

**Root cause:** `GlobalProvider.jsx`'s boot effect used to call
`dispatch(setSessionId(sid))` *before* calling `loadPersistedState()`.
`setSessionId` is an ordinary Redux action — nothing filtered it out of
`persistMiddleware` — so it passed straight through and immediately
re-saved `state.currency`/`state.siteSettings` to `localStorage` using the
store's still-default values (the store intentionally no longer preloads
from `localStorage` — see `store.js`'s own comment on the earlier
hydration-crash fix). That silently overwrote a previously-saved currency
override with the defaults a few lines *before* the code ever read that
saved data back out — so on every refresh, the restore logic was reading
data that had already been wiped moments earlier in the same effect, and
`fetchSiteSettings()`'s (otherwise-correct) `setBaseCurrency()` guard just
won by default.

Beyond fixing that one call-order bug, the same failure mode was
structurally possible from *any* component: `GlobalProvider` wraps
`{children}` in `Providers.jsx`, and React fires child effects before
parent effects on mount, so any descendant with its own mount-time
`dispatch()` (a cart-badge fetch, an activity log call, etc.) could
clobber the saved data before `GlobalProvider`'s restore effect ever ran —
a bug that could reappear on any page that later added a new mount-time
dispatch, not just the one instance that first surfaced it.

**Fix (two parts, in `src/providers/GlobalProvider.jsx` and
`src/store/localStorageMiddleware.js`):**
1. Reordered the boot effect so `loadPersistedState()` and the
   theme/language/currency restore dispatches run as the very first
   statements — before `setSessionId` or anything else.
2. Hardened this structurally at the middleware level: `localStorage` is
   now read once into a module-level cache at import time (before any
   component can possibly run), and `persistMiddleware` refuses to write
   anything until a new `markHydrated()` (exported from
   `localStorageMiddleware.js`) has been called. `GlobalProvider` calls
   `markHydrated()` immediately after dispatching the restored state, so
   no action from any component, in any mount order, can ever clobber
   saved data before it's been read back — removing the ordering
   dependency entirely instead of just fixing the one call site that
   happened to trigger it first.

Verified: 0 syntax errors across all 185 source files (`esbuild` transform
pass) and a full import/export-resolution sweep found no real issues (25
initial hits were false positives from the checker's regex not matching
`export async function`, confirmed by manual inspection of both
`apiHandler.js` and `notification.controller.js`). A real `next build`
still can't run in this sandbox (no network access to the Linux SWC native
binary), so this is static verification, not a runtime test — recommend
a real `npm run dev` smoke test of: pick a non-default currency from the
navbar → hard refresh → confirm it's still selected (not reverted to the
site's base currency).

---


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

---

## Batch 10 (this round) — Vercel "Schema hasn't been registered for model 'address'" + integration audit

| # | Issue | Root cause | Fix |
|---|---|---|---|
| 1 | Production crash on Vercel: `Schema hasn't been registered for model "address". Use mongoose.model(name, schema)` | Vercel builds each `src/app/api/**/route.js` into its own isolated serverless function with its own module graph. A model is only registered — `mongoose.model("address", schema)` actually *runs* — if something that specific function imports (directly or transitively) happens to import that model file; `connectDb()` alone only opens a DB connection, it never registers anything. `order.model.js` (`delivery_address`) and `user.model.js` (`address_details`) both `ref: "address"`, but this project's controllers call `.populate("delivery_address")` / `.populate("address_details")` — and several controllers doing so never imported `address.model.js` themselves. Audited **every** `.populate()` call in the codebase against every model's `ref:` targets and every controller's direct imports (cross-checked, including tracing which controllers get bundled together via shared `route.js` files, since a couple of files were "saved" only by accident that way). This turned out to be systemic, not address-only: 12 controller files populated a ref to a model they never directly imported (`barcode`, `subcategory`, `inventory`, `callLog`, `activity`, `customer`, `user`, `coupon`, `productRequest`, `customerCare`, `product`, `cart` .controller.js — full per-file breakdown of which model(s) each was missing is in the git history of this fix / this session's tool transcript). | Two layers. **Root-cause fix**: new `src/server/models/registerModels.js` side-effect-imports all 20 model files; imported at the top of `src/lib/mongodb.js`, which every single API route already loads (via `apiHandler.js`) before its controller runs — so every model is now unconditionally registered on every request, permanently closing this bug class, including for any populate() call not yet written. **Defense-in-depth**: also added the specific missing direct model import(s) to each of the 12 controller files above, matching this codebase's existing convention of controllers importing what they use. `seed.js` / `server/config/connectDb.js` checked and confirmed unaffected (standalone CLI script, already imports every model it needs directly, not part of the Vercel request path). |
| 2 | (found auditing #1, unrelated) New campaigns silently lost 5 fields on creation: badge style/gradient/image, text color, icon color | `campaign.controller.js`'s `createCampaignController` used an explicit destructuring whitelist for `req.body` that was never updated when an earlier round ("Fix 21" per the in-code comment) added `badgeStyle`/`badgeGradient`/`badgeImage`/`textColor`/`iconColor` to `campaign.model.js`'s schema — creating a campaign with a gradient/image badge or custom colors silently fell back to schema defaults (solid red, white text/icon) instead. `updateCampaignController` was never affected — it spreads `req.body` directly rather than whitelisting, so editing an existing campaign always worked. | Added all 5 fields to both the destructure and the `new CampaignModel({...})` construction in `createCampaignController`. |
| 3 | (found auditing #2) `product.model.js` had `preCampaignDiscount` defined twice | Same field (`{type:Number, default:0}`) appeared at two separate points in the schema object literal — harmless today only because both copies were identical (JS silently keeps the later duplicate key), but a maintenance trap: editing the first copy later would silently do nothing. | Removed the redundant earlier definition, kept the later, better-commented one. |
| 4 | (found checking the same "stale whitelist" pattern elsewhere) New products silently lost their short description on creation | Same bug class as #2. `product.controller.js`'s `addProductController` destructuring whitelist never included `shortDescription`, even though the Add Product form (`upload-product/page.jsx`) has a real, labeled input for it (`register("shortDescription")`, one-line summary shown under the product name on listing pages) and sends it. `updateProductController` was unaffected (spread pattern). Checked `overstockThreshold` too while here — confirmed no form anywhere actually collects it, so its schema-default-only behavior is correct as-is, not a bug. | Added `shortDescription` to `addProductController`'s destructure and the `new ProductModel({...})` construction. |
| 5 | (minor, found while checking the checkout money-path) COD order-placement response returned the unpopulated order | `cashOnDeliveryOrderController` computed a fully `.populate()`d version of the just-created order (delivery address + user) into a `populated` variable, then returned the earlier unpopulated `saved` instead — the populated query ran for nothing. Checked `checkout/page.jsx`'s handling of this response: it only reads `success` and then refetches orders separately, so this was never user-facing — dead code / a wasted query, not a functional bug. | Response now returns `populated`. Fixed since it was already right there and zero-risk; not chased further afield. |

### Verification this round
Sandbox filesystem had reset (as expected between sessions) — rebuilt `/home/claude/build-check/` from scratch: `syntax_check.js` (esbuild transform via the globally-installed `tsx` package's bundled copy, no network needed), `export_check.js`, `undefined_check.js`. Had to fix a bug in my own freshly-rebuilt `export_check.js` before trusting it: its Redux-slice destructure regex required `\s+` between `const` and `{`, but this codebase's slice files write `export const{a,b}=x.actions` with zero spaces — tightened to `\s*`. Baseline confirmed clean before any project edits (187 files/0 syntax errors, 184 files/0 export problems, 3 undefined_check hits all manually confirmed false positives — comment text, not code). Re-ran all three after every edit through to the end: final state 188 files/0 syntax errors, 185 files/0 export problems, 5 undefined_check hits, all confirmed false positives (2 are new — my own explanatory comments inside `registerModels.js` mentioning "connectDb()" / "mongoose.model(" as prose, same class as the 3 pre-existing ones). No `mongoose` package available anywhere in this sandbox (no network), so — same as every prior batch — model-registration correctness for item #1 was verified by full manual reading (every `ref:` in every model cross-referenced against every controller's imports and every `route.js`'s controller-bundling, not spot-checked) rather than by actually constructing a live Mongoose registry; a real `next build` still can't complete here for the same no-network reason. **This fix has not been confirmed against a live MongoDB + real `mongoose.model()` calls** — it's static-analysis-verified and follows the standard, well-established fix pattern for this exact Next.js/Mongoose/serverless error, but re-deploying and confirming the specific reported error is actually gone is the one thing only a real deploy can tell you.

## Recommended order for the next "Continue"
1. First priority: confirm the redeploy on Vercel no longer throws the "address" error (or any other `Schema hasn't been registered for model "X"` variant) anywhere in the app — click through address-related flows specifically (profile addresses, checkout, admin customers, admin orders, admin barcode scan, admin inventory adjustments, admin coupons product picker) since those were the exact call sites this round's fix targeted. If anything still surfaces, it'll be the same bug class — check the failing route's controller for a `.populate()` on a ref whose model file isn't imported anywhere in that route's bundle, or just confirm `registerModels.js` is still being imported at the top of `src/lib/mongodb.js`.
2. This round deliberately did not exhaustively re-audit all ~22 `new XModel({...})` creation controllers for the "stale whitelist" bug class (items #2/#4 above) — only the highest-traffic ones (product, campaign, user registration, order/checkout). The remaining, lower-traffic admin CRUD controllers (role/barcode/subcategory/inventory/callLog/notification/analyticsSettings/siteSettings/activity/coupon/callCenterAgent/hrPayroll/productRequest/customerCare/category/cart/deliveryZone/address) are still unaudited for this specific pattern — worth a pass if time allows, lower priority than #1.
3. Still outstanding since Batch 7, untouched across Batches 8/9/10: #19/#23 end-to-end re-verify, #22 Liquid Glass design consistency pass, #25 responsive audit, #27 Google OAuth.
4. Re-run all three verification scripts after any further change, every time, before considering something done — remember to rebuild `/home/claude/build-check/` first if starting a fresh session.

Just say **Continue** — this file gets read first, updated last.

---

## Batch 11 (this round) — 4 newly reported issues: site settings not persisting, payment logos vanishing, analytics currency

| # | Issue | Root cause | Fix |
|---|---|---|---|
| 1 | Site Settings admin page: Announcement Bar / Footer / Shopping List Banner edits didn't stay visible in the settings section itself after saving, AND didn't appear on the frontend | `site-settings/page.jsx`'s `useForm({defaultValues})` set defaults with FLAT literal-dotted-string keys — `"header.announcementText": settings.header?.announcementText || ""` — while every field is `register()`ed with a real dotted PATH name (`register("header.announcementText")`). React Hook Form's internal `get(defaultValues, name)` resolves dotted names by walking a genuinely NESTED object; a flat key that merely *contains* a dot doesn't satisfy that, so it always resolved to undefined — every dotted field (header, footer incl. socialLinks, theme, language, shoppingListBanner) rendered blank/default on every load, regardless of what was actually saved. This is the exact mirror-image of the bug Batch 8 already fixed (Batch 8 fixed the SUBMIT side; the DEFAULT-VALUES side had the identical flat-vs-nested mismatch and was never caught). Two-part consequence: (a) the admin section always looked reset on reload, and (b) because `handleSubmit` submits the current value of every registered field, not just ones touched that session, saving the form for any reason after a reload re-submitted those blank defaults and the backend's merge logic legitimately overwrote the real saved values with blank — which is what eventually made it disappear from the frontend too. | Rewrote `defaultValues` as a genuinely nested object mirroring the registered field structure (`header: {announcementText, showAnnouncement}`, `footer: {..., socialLinks: {...}}`, `theme: {activeTheme}`, `language: {activeLanguage}`, `shoppingListBanner: {...}`), matching exactly what the already-fixed `onSubmit` reads. |
| 2 | Site Settings: theme is actually dark (and correctly renders dark site-wide) but the Site Settings admin page shows it as "default" | Same root cause as #1 — `"theme.activeTheme"` was one of the flat dotted keys, so the theme radio group never reflected the real saved value on load, always appearing to default. Confirmed independently by tracing `GlobalProvider.jsx`: the live site's theme comes from `useSelector(s => s.siteSettings.theme)` — straight from Redux, fetched via `/api/settings/get` — completely bypassing this broken form, which is exactly why the live site was always right while only the settings *form* was wrong. | Same fix as #1 (same `defaultValues` rewrite covers `theme.activeTheme` too). |
| 3 | Payment Method Logos "getting deleted automatically" | `handlePaymentLogoAdd` uploaded the image file, then only called `setPaymentMethods(updated)` (local state) and `dispatch(setSiteSettings({...settings, paymentMethods: updated}))` (optimistic Redux) — it never called any backend endpoint to actually persist the change. Contrast with `handleBannerAdd`, which does call a dedicated `api.addBanner` endpoint that saves immediately. So a payment logo only ever existed in that browser tab's transient state; the next time fresh server data replaced it — a reload, a different admin session, or `GlobalProvider`'s existing periodic settings poll (every 30s) — the never-saved logo vanished. Nothing was deleting it; it was never saved in the first place. `handlePaymentLogoRemove` had the identical gap (not what was reported broken, fixed anyway for consistency). | Added `addPaymentMethodController` / `deletePaymentMethodController` to `siteSettings.controller.js`, mirroring `addBannerController`/`deleteBannerController` exactly (push/filter + immediate `.save()`). Wired `POST /api/settings/payment-method/add` and `DELETE /api/settings/payment-method/delete` into the settings route, added matching `api.js` entries, and rewrote both frontend handlers to actually call them before touching local/Redux state. |
| 4 | Analytics dashboard "Settings" tab (monthly expenses, balance sheet figures, marketing inputs) — amounts should be in base currency and update in real time when base currency changes | `SettingsTab.jsx` (the Analytics dashboard's own Settings tab — distinct from the Site Settings admin page above) had zero currency awareness: no currency `useSelector`, no symbol, every field a bare number input. Compared against the already-working pattern in the other 7 analytics tabs (`FinancialTab.jsx` etc., per Batch 8): `useSelector(s=>s.currency.baseCurrency)` + `useSelector(s=>s.currency.rates)` + `displayPrice(value, currency, rates)` from `@/lib/utils`, which treats the raw number as always stored in BDT (same convention as product prices app-wide) and converts BDT→target currency for display using live/cached FX rates. Spot-checked all 7 other tabs still reference `baseCurrency` — Batch 8's claim holds; this tab was the one genuine gap. | Added the same `useSelector`+`displayPrice` pattern. Kept the actual editable `<input>` in raw BDT terms (avoids risky convert-while-typing/convert-back-on-save round-tripping that no other tab attempts either) but added a ৳ prefix label plus a live "≈ [symbol][amount]" preview under each monetary field whenever base currency isn't BDT — both pull from Redux, so changing the base currency in Site Settings updates every preview automatically within the same ~30s poll window as everything else, no save/reload/re-entry needed. Deliberately NOT applied to non-monetary fields in the same tab (Sales Tax Rate is a %, and `adClicks`/`emailsSent`/`emailOpens`/`emailClicks` are counts, not amounts) — only genuinely monetary fields got the treatment. |

### Verification this round
Same rebuilt `/home/claude/build-check/` tooling from Batch 10 (still present, same session). Ran all three scripts after every fix and once more at the end: 188 files/0 syntax errors, 185 files/0 export problems, 5 undefined_check hits, all the same previously-confirmed false positives (comment text) — no new hits. Additionally traced the actual runtime mechanics rather than stopping at static analysis: confirmed `GlobalProvider.jsx` really does `setInterval(fetchSiteSettings, 30_000)` and that `theme`/`baseCurrency` really are read via `useSelector` directly off the `siteSettings`/`currency` Redux slices (not through the broken form), which is what makes the live site correct independent of the admin-form bug — this is runtime-behavior confirmation via code tracing, not a live-server test (still no network/mongoose in this sandbox, so a real Vercel deploy is still the only way to see these render).

### Known minor residual (not fixed, documented on purpose)
`site-settings/page.jsx`'s `useForm` still only captures `defaultValues` once at mount — if an admin hard-refreshes landing *directly* on `/dashboard/site-settings` before `GlobalProvider`'s initial settings fetch resolves, the form could still momentarily init from stale/empty data. Considered adding a `reset(nestedDefaults)` inside the existing `useEffect(() => {...}, [settings])`, but that would also fire on every 30s poll and on the admin's own post-save `dispatch(setSiteSettings(...))` — risking silently wiping any text an admin is mid-typing when a poll lands. Since `GlobalProvider` mounts at the root layout (confirmed via `Providers.jsx` → `layout.jsx`), this only matters on a hard-refresh-direct-to-this-page, not normal in-app navigation — judged not worth the trade-off. Flagging here rather than silently leaving it out.

## Recommended order for the next "Continue"
1. First priority: on the actual deploy, click through all four fixed flows —
   (a) edit Announcement Bar/Footer/Shopping List Banner/Theme in Site Settings,
   reload the page, confirm the values are still shown filled in, not blank;
   (b) confirm the announcement bar/footer/theme actually show up on the live
   site; (c) upload a payment logo, reload (or wait 30s), confirm it's still
   there; (d) open Analytics → Settings, confirm ৳ labels + converted previews
   show, then change base currency in Site Settings and confirm the previews
   update within ~30s without touching the Analytics tab.
2. The "known minor residual" noted just above (hard-refresh-direct-to-settings-
   page race) is the only unaddressed piece of this round's reports — low
   priority, only revisit if it's actually observed in practice.
3. Still not exhaustively re-audited: the ~18 lower-traffic admin CRUD
   controllers for the Batch 10 "stale whitelist" pattern (see Batch 10's own
   recommended-next section for the exact list).
4. Still outstanding since Batch 7, untouched across Batches 8-11: #19/#23
   end-to-end re-verify, #22 Liquid Glass design consistency pass, #25
   responsive audit, #27 Google OAuth.
5. Re-run all three verification scripts after any further change, every time
   — remember to rebuild `/home/claude/build-check/` first if starting fresh.

Just say **Continue** — this file gets read first, updated last.

---

## Batch 12 (direct follow-up feedback on Batch 11 item #1) — analytics currency, take 2

The user came back specifically on the analytics-currency fix with two clarifications Batch 11 hadn't fully captured: (1) they want the **primary displayed amount** to change with currency, not a small secondary "≈ converted" hint sitting next to an unchanged BDT input; (2) they want it to react to the **navbar currency switcher** too, not only to the admin changing base currency in Site Settings.

| # | Change | Detail |
|---|---|---|
| 1 | `SettingsTab.jsx` now shows/accepts values directly converted into the current currency, not a frozen BDT input + hint | Rewrote `NumField`: the input's displayed value is now `convertFromBDT(value, currency, rates)`, rounded to 2dp; typing converts back via `convertToBDT(...)` before calling the parent's `onChange`, so the underlying `settings` state (and everything sent to the backend) stays in BDT throughout — only the display layer converts. A small "stored as ৳X" note replaces the old "≈ converted" hint, same transparency goal, inverted now that the live-converted number is the primary one. Verified merely *switching* currency (without editing) never touches `onChange`/`convertToBDT` — only an actual edit round-trips through the conversion math — so passively viewing figures in a different currency causes zero drift to the real stored BDT value. |
| 2 | `SettingsTab.jsx` now reacts to the navbar currency switcher, not just Site Settings' base currency | Re-read `currencySlice.js` closely: `baseCurrency` is the admin-set site default, and by original design (per that file's own comment, naming "analytics tabs" specifically) is what every analytics tab reads, deliberately ignoring any personal navbar override, so business-reporting figures stay stable regardless of what currency an admin happens to be browsing the storefront in. `selected` is the field the navbar switcher sets, and already tracks `baseCurrency` automatically *unless* personally overridden — i.e. it's already the exact union of both triggers the user asked for. Switched this ONE tab's `useSelector` from `baseCurrency` to `selected`. This is a deliberate, explicit-request departure from the other 6 analytics tabs, which still read `baseCurrency` only — documented clearly in-code and here rather than silently diverging, since it means Analytics → Settings can now show different currency behavior than Analytics → Financial/Business/etc. if someone changes the navbar currency without also updating Site Settings' base currency. Only touched `SettingsTab.jsx`, matching the user's own scope ("Settings section of analytic dashboard") — did not change the other 6 tabs. |
| — | Supporting refactor in `utils.js` | Extracted the currency-symbol map that used to live only inside `displayPrice()` into an exported `CURRENCY_SYMBOLS` constant (pure refactor, `displayPrice()`'s own behavior/signature unchanged — it's used in many places across the app and this round didn't touch any of its callers). Added `convertFromBDT`/`convertToBDT` — numeric, unformatted versions of the same BDT-pivot conversion math `displayPrice()` already used, needed because `displayPrice()` returns a formatted string (`"$409.84"`), not a plain number a controlled `<input type="number">` can use. |

### Verification this round
Same `/home/claude/build-check/` tooling, still present from Batch 10/11 (same session throughout). Ran all three scripts after the rewrite: 188 files/0 syntax errors, 185 files/0 export problems, same 5 previously-confirmed false positives on `undefined_check`, no new hits. Full manual read-through of the whole rewritten file for coherence (traced `set()` → `save()` to confirm BDT-only values ever reach `settings` state or the backend payload — confirmed).

### If a future session is asked to also make the other 6 analytics tabs follow the navbar switcher (for full consistency with this one)
Same one-line change in each: swap `useSelector(s => s.currency.baseCurrency)` for `useSelector(s => s.currency.selected)`. Worth asking the user first whether they actually want that, since it reopens the exact trade-off `baseCurrency` was originally introduced (Batch 7/8) to avoid — business reporting figures shifting based on personal/incidental storefront browsing currency, across every tab rather than just Settings.

Just say **Continue** — this file gets read first, updated last.

---

## Batch 13 (new report) — navbar currency selection reverted to base currency after a page refresh

### The report
Picking a currency from the navbar worked immediately, but after refreshing the page it reverted to the site's base currency instead of staying on the personally-picked one.

### Investigation (documented in full — this one is worth being honest about)
`currencySlice.js`'s own comment claims this already works: the whole slice is localStorage-persisted, and `GlobalProvider` is supposed to restore `selected` from storage on boot, but only as a real override (`isUserOverride: true`) — otherwise it lets the freshly-fetched base currency win. Read every file in this path in full: `localStorageMiddleware.js` (persists synchronously on every dispatch, no gap), `store.js` (documents a *prior*, related hydration-mismatch bug and its fix — real data restoration was deliberately moved into a `useEffect` in `GlobalProvider`, strictly post-hydration), `GlobalProvider.jsx` (found the restoration and the `fetchSiteSettings()` boot call lived in two *separate* `useEffect`s, in the correct declaration order), `PreferenceSelector.jsx` (dispatches correctly, reads state reactively), `currencySlice.js`'s reducers (re-verified byte-for-byte — `setBaseCurrency`'s `if (!s.isUserOverride) s.selected = next` guard is exactly right, no inverted condition or typo). Grepped the whole codebase for every currency-action dispatch site — confirmed no hidden third call site. Also checked `ProductCard.jsx` and the product detail page — both read currency reactively via `useSelector`, ruling out a "component froze a stale value" theory.

Wrote and ran a Node.js simulation reproducing the exact effect/async structure (a real `Promise`+`setTimeout` standing in for the network call). It passed: the override was correctly preserved, exactly matching what the code's own design intends — React does guarantee same-commit `useEffect`s run in declaration order, and the restore effect has no `await` in it at all, so by that guarantee it should always finish before the fetch's async dispatch resolves.

**Being straightforward about where this leaves things:** static reading and simulation both say the *original* two-effect code should already work, and this sandbox has no live browser to reproduce the actual race Vercel/a real browser would hit (SSR + hydration + Next.js's App Router add real complexity a Node.js simulation doesn't capture, and this project has already hit one bug in exactly this neighborhood before — see `store.js`'s hydration-mismatch comment). Rather than ship "I couldn't reproduce it so I'm leaving it," the fix below removes the cross-effect timing dependency entirely, regardless of whether that was the exact original mechanism — which either fixes the reported bug directly, or removes a genuine fragility that was one refactor away from causing this exact symptom regardless.

### Fix
Merged the two effects into one. Restoring the saved currency/theme/language now happens as the first lines of the *same* `useEffect` that calls `fetchSiteSettings()`, `fetchCategories()`, etc. — not a separate, independently-scheduled effect. This makes the ordering airtight by simple, single-function, synchronous JavaScript execution (restoration *must* finish before `fetchSiteSettings()` is even called, let alone before its `await`-gated `setBaseCurrency` dispatch resolves) — there is no longer a cross-effect timing question to reason about at all, in this sandbox or in a real browser. `src/providers/GlobalProvider.jsx` is the only file touched.

### Verification this round
Same tooling, still present. `syntax_check`: 188 files/0 errors. `export_check`: 185 files/0 problems. `undefined_check`: same 5 known false positives (one shifted line number since code moved around — checked, confirmed still the same comment-text hit, not a new issue). Noted but deliberately did not touch: `GlobalProvider.jsx` line 44 (`selectedCurrency`) is read via `useSelector` but never actually used anywhere in the component — harmless dead code (an unnecessary re-render subscription), unrelated to this bug, out of scope for this round.

### If this exact symptom is somehow still reported after this fix
The mechanism is now about as simple as this gets (one synchronous restore, then one async fetch, in that literal order, in one function) — if it still doesn't stick, the next thing to check is whether the browser's localStorage is actually being written at all (private/incognito mode, a browser extension blocking storage, or a `localStorage.setItem` quota/permissions error being silently swallowed by `persistMiddleware`'s `try {} catch {}`). Consider temporarily removing that `catch {}` to surface any write failures during a live debugging session — this sandbox has no way to trigger or observe that possibility.

Just say **Continue** — this file gets read first, updated last.

---

## Batch 14 (user reports Batch 13 did NOT fix it) — deeper investigation, instrumentation added

### The report
"still currency is setting as admin defined base currency with refreshing after setting into a different currency from the navbar." Batch 13's effect merge did not resolve it. This is useful information on its own: it rules out cross-effect *timing* as the mechanism, since that path is now airtight by plain sequential code execution, not by relying on React's effect-ordering guarantee.

### What got checked this round (in addition to everything in Batch 13)
- `userSlice.js` + `user.model.js` for a hidden per-user currency field that `fetchUser()` might be overwriting things with — grepped, nothing found, ruled out.
- `siteSettingsSlice.js` in full for the first time (previously only seen through a comment reference). Found it has a **real, documented, separate** bug-and-fix history for the same *class* of problem, but for theme/language, not currency (Fix 41/44/49: a DB refetch used to blindly overwrite a user's personally-chosen `activeTheme`/`activeLanguage`; fixed by preserving those two leaf fields across every refetch once the user has made a choice). Confirms this general bug class is real and has bitten this codebase before — useful context, though that specific fix doesn't touch `currencySlice` at all, so it doesn't directly explain the currency case.
- An SSR-baked-stale-price theory: Next.js App Router server components could in principle render prices server-side, with zero awareness of a client-side personal currency choice — which would look exactly like "reverts on refresh" but wouldn't be a timing bug at all. Checked every top-level page, the root layout, `Header.jsx`, `ProductCard.jsx` — everything that touches prices is `"use client"` with reactive `useSelector` reads; the root layout only fetches data for the browser-tab title/favicon. No evidence found; theory refuted.
- A stale-cached-JS-bundle theory (service worker, custom cache headers) — no service worker/manifest exists, no `vercel.json`, `next.config.mjs`'s `headers()` is security headers only. Next.js's own content-hashed build filenames make normal browser caching a non-issue across deployments regardless.
- Built a temporary, minimal `createSlice()` polyfill and executed the **actual, real** `currencySlice.js` + `localStorageMiddleware.js` source files directly in Node — not a hand-written reimplementation this time, the literal project files — through the full pick-currency → persist → simulate-refresh → restore → `setBaseCurrency` sequence. Result: correctly preserved the override, using the real code. (The temporary shim was deleted before packaging — it must never ship as part of this project.)

### Being straightforward about where this leaves things
Every piece of this mechanism reachable from a static-analysis sandbox — reducers, middleware, every price-displaying component's client/server status, four separate alternate theories — checks out correct or gets ruled out. This sandbox has no live browser, so I cannot reproduce the actual failure myself. Two honest possibilities remain: (a) the deployment being tested doesn't actually include the Batch 13 fix yet, or (b) there's a genuine browser-environment-specific cause (privacy/incognito mode, an extension blocking storage, a storage quota error) that only live browser DevTools can surface. Rather than guess a third time, this round adds real instrumentation instead.

### Diagnostics added (not another guess — instrumentation to get real signal)
- `localStorageMiddleware.js`: both previously-silent `catch {}` blocks (on read and on write) now `console.warn(...)` with the actual error. Any real failure — quota exceeded, privacy-mode storage block, a non-serializable value having snuck into state, corrupted JSON — is now visible in the browser console instead of invisibly falling back to defaults with zero trace.
- `GlobalProvider.jsx`: one `console.log("[currency-restore]", { savedCurrency, savedIsOverride, willRestore })` at the exact restore decision point. Marked in-code as temporary and safe to remove once persistence is confirmed solid across a few real refreshes.

### What would help most on the next report, if this persists
Confirm the zip actually deployed is this latest one (check the file timestamp or diff against what's live). If it is, and the bug still happens: open the browser console, refresh, and check what `[currency-restore]` logs. `savedIsOverride: true` + still reverting would point somewhere genuinely new (worth a fresh investigation with that concrete data point). `savedIsOverride: false/undefined` when it should be `true` would point at the write side — check for a `[persist]` warning in the console from right after actually clicking a currency in the navbar.

Just say **Continue** — this file gets read first, updated last.

---

## Batch 15 — the actual root cause, found and fixed

### How this one finally got solved
The user provided real browser console output across a few exchanges — this is the difference-maker the last two batches were missing. In order: (1) right after picking EUR from the navbar, `localStorage.getItem('spf_store_v1')` correctly showed `isUserOverride: true, selected: "EUR"` — proving the write side was never broken; (2) feeding that exact real JSON through the real `loadPersistedState()` function in a standalone test confirmed the parsing was never broken either; (3) refreshing immediately after, the `[currency-restore]` diagnostic (added in Batch 14) showed `savedIsOverride: false` anyway. Data that was provably correct in storage seconds earlier was reading back as default immediately after a refresh — meaning something clobbers it *during* the refresh, after the write, before the restore.

### Root cause
Redux's own `configureStore()` — nothing this app's code does directly — dispatches an internal `@@redux/INIT...`-prefixed action through the *entire* middleware chain the instant the store is created. That happens at module-evaluation time on every fresh page load, before any component mounts, well before `GlobalProvider`'s restore-from-localStorage effect ever runs. `persistMiddleware` never filtered by action type — it saved on literally every action that passed through it, redux-internal or not. So that internal init action's pass-through save wrote the store's bare default state (no currency override at all, since nothing has restored anything yet at that point) straight to localStorage, silently overwriting whatever a previous session had legitimately saved — before the restore effect ever got a chance to read the original data.

This is why the write always checked out correct, the parsing always checked out correct, and Batch 13's effect-ordering fix didn't help at all: the damage happens before React even mounts, entirely outside any component lifecycle or effect-ordering question. Three batches spent looking at the wrong layer of the stack — the bug was never in the restore logic at all, it was in an unconditional save happening one step earlier than any of this app's own code runs.

Reproduced empirically before trusting this diagnosis: wrote a Node test using the real `currencySlice.js` + `localStorageMiddleware.js` source files (via a temporary, standalone `createSlice()` shim, since `@reduxjs/toolkit` isn't installable in this sandbox — deleted immediately after every test run, confirmed absent from the deliverable) that models a user picking a currency, then a simulated store-recreation firing Redux's real internal init action type through the real middleware. It reproduced the bug exactly: EUR correctly saved, then wiped by the simulated init action, before the simulated restore ever reads it.

### Fix
`localStorageMiddleware.js`'s `persistMiddleware` now skips its save step entirely when `action.type` starts with `"@@redux/"` — a long-standing, stable Redux convention covering both the INIT action and `combineReducers`' internal `PROBE_UNKNOWN_ACTION` sanity check (matching the prefix rather than an exact string handles the randomized suffix Redux appends to both).

Verified with three separate tests against the updated real source file: (1) the exact bug-reproduction scenario now passes — a picked currency survives a simulated refresh; (2) a real user action (`setSelectedCurrency`) still persists completely normally — confirms the fix filters *only* Redux-internal actions, not real ones; (3) `setBaseCurrency` dispatched while an override is active still correctly leaves `selected` alone, confirming the pre-existing `isUserOverride` protection logic still works correctly *together* with this new filter, not just in isolation.

### Verification this round
Same tooling. `syntax_check`: 188 files/0 errors. `export_check`: 185 files/0 problems. `undefined_check`: same 5 known false positives, no new hits.

### Note for next session
The Batch 14 diagnostics (`[currency-restore]` console log in `GlobalProvider.jsx`, and the `[persist]` console warnings in `localStorageMiddleware.js`) are still in place. The console log was marked as temporary/removable once persistence is confirmed solid — leaving it in for one more round is deliberate, in case this fix somehow doesn't fully resolve what the user sees live (it's been wrong to be fully confident twice already in this saga, even though this round's evidence and reproduction are considerably stronger than either prior attempt). Once the user confirms a currency choice now survives a real refresh, both diagnostics are safe to remove as a small cleanup — the `[persist]` warnings are arguably worth keeping permanently though, since silently swallowing storage errors was a real, independent reliability gap regardless of this specific bug.

Just say **Continue** — this file gets read first, updated last.
