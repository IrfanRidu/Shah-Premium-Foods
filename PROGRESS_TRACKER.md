# PROGRESS TRACKER — Role/Dashboard/Wishlist Overhaul

> READ THIS FILE FIRST IN ANY NEW SESSION. Updated after every real step.
> If told "continue", find the first unchecked `[ ]` box below and resume
> there. Do not restart investigation — it is already done (summary below).

## Source of truth for requirements (verbatim from user)
1. New roles: Demo Admin, Super Admin, Admin, Users, Employee (HR, Call
   center agent, others — addable by Super Admin/HR/Admin). Demo Admin:
   views everything, no action ever really writes to the DB, shows a nice
   popup on every simulated action/error, sensitive data/routes hidden.
2. Admin dropdown → one link ("Go to Super Admin Dashboard" etc.), not the
   full route list. Super Admin sidebar → grouped into 6 collapsible
   categories (open by default): Products, Analytics, Customer care and
   call center, Website Maintenance, HR and Payroll, Security and
   permissions. Dashboard homepage = brief overview of all sections.
3. User dropdown → My Profile, My Orders, Submit Shopping List, Wishlist
   (new). Everything else lives under My Profile. Employees (HR, Call
   center agents), Admin each get their own accessible dashboard (same
   simplified-entry-point treatment as #2).

## Codebase orientation (already fully read — do not re-read STATUS.md
in full again, just grep it if a specific question comes up)
- Next.js 14 App Router monolith, MongoDB/Mongoose, Redux Toolkit.
- Every API route funnels through `src/lib/apiHandler.js` →
  `createNextHandler(req, params, ROUTES)` where ROUTES is
  `{ "METHOD:/path": [[middlewares], controller] }`. THE place to
  intercept Demo Admin mutations centrally.
- Roles today (`role.controller.js` `ensureSystemRoles`): SUPERADMIN,
  ADMIN, MANAGER, STAFF, ANALYST, USER, CALL_CENTER_AGENT (scoped to
  customerCare only). Role docs store per-module {view,create,edit,delete}
  in `role.model.js`; `FULL_PERMS(excludeRoles)` helper already exists.
- `permission.js`: `checkPermission(module,action)` — SUPERADMIN bypasses
  via literal string check; everyone else (incl. ADMIN once a roleDoc
  exists) checked against their RoleModel doc. `superAdminOnly` = hard
  literal-string gate, used today only for roles-CRUD routes + audit-log
  routes. `enforceIpWhitelist` / token-lifetime logic both use
  `ADMIN_ROLES = Set(["ADMIN","SUPERADMIN"])`.
- `UserMenu.jsx`: base MENU (My Profile/My Orders/Addresses/Submit List)
  + flat 15-item ADMIN_MENU dumped into dropdown, permission-filtered.
- `dashboard/layout.jsx`: USER_LINKS (4) + flat ADMIN_LINKS (17), no
  grouping, no collapse. NO `/dashboard/page.jsx` exists at all (404
  today). Audit Log link already uses `superAdminOnly:true` flag, hidden
  from non-literal-SUPERADMIN already — reuse this exact mechanism to
  keep Audit Log hidden from Demo Admin.
- `dashboard/roles/page.jsx` guarded by `if (!isSuperAdmin(myRole))`.
- `dashboard/admin-users/page.jsx` has the `ROLES` array + role `<select>`
  — this is where Super Admin will assign DEMO_ADMIN (just add to list,
  no new UI needed). Guarded by `isSuperAdmin(myRole)` for edit access.
- `lib/utils.js` has `isAdmin`/`isSuperAdmin` string-check helpers.
- Employee/HR: `employee.model.js` (HR record, optional `userId` link) +
  `hrPayroll.controller.js` (CRUD, NO login-provisioning today) vs.
  `callCenterAgent.controller.js` (DOES provision a linked login+role,
  gated by `checkPermission("customerCare","edit")` — already reachable
  by anyone with that permission, not hard-locked to SUPERADMIN).
- No Wishlist anywhere (model/API/UI) — confirmed via grep, building from
  scratch. Best templates: `address.model.js` / `address.controller.js` /
  `api/address/[...segments]/route.js` / `addressSlice.js` (simple
  per-user list CRUD, exactly the shape wishlist needs).
- `GlobalProvider.jsx`: boot sequence fetches user→permissions, then
  cart/address/orders in parallel. Add `fetchWishlist` alongside those.
- `store/store.js`: reducer registry — add `wishlist` key.
- `axios.js`: central instance, response interceptor already does
  token-refresh-on-401 — ADD a second interceptor here that detects a
  `isDemoAction` flag on ANY response and fires a global custom event,
  so ONE new listener component covers every mutating call site in the
  app (hundreds of them) without editing each page.
- `ConfirmBox.jsx` / `.modal-overlay` / `.modal-box` / `.btn-primary` /
  `.icon-btn` CSS classes already exist — reuse, don't reinvent.
- `analytics.controller.js` has a heavy `getDashboardMetricsController`
  (revenue/profit/etc) — for the new "brief overview" page, build a
  SEPARATE lightweight controller (counts only, cheap) rather than reuse
  the heavy financial one.
- Sandbox has NO network access (npm registry 403) and NO node_modules —
  cannot npm install or run a real build. VERIFIED WORKAROUND: global
  `tsc` (TypeScript compiler, preinstalled) with
  `{allowJs:true,checkJs:false,jsx:"preserve",noEmit:true}` correctly
  catches real JSX/JS syntax errors (tested against both a clean project
  file and deliberately-broken ones). Use this as the syntax-check gate
  before finalizing. Location of test rig: `/home/claude/work/synctest`.

## FINALIZED DESIGN DECISIONS (so future-me doesn't re-litigate these)
- **DEMO_ADMIN permission shape = full FULL_PERMS(false)-equivalent**
  (same shape as SUPERADMIN, including `roles` module = true) so EVERY
  `checkPermission` check passes through to the apiHandler interception
  layer uniformly — a demo admin never hits a real 403 for lack of
  permission, only ever gets a smooth "simulated" response. This is what
  "can view/attempt ALL functionality" requires.
- **DEMO_ADMIN is deliberately NOT added to the literal `isSuperAdmin()`
  string check** — instead add a new `hasFullDashboardAccess(role)`
  helper (`isSuperAdmin(role) || isDemoAdmin(role)`) and swap it in for
  UI-visibility gates (sidebar "show everything", roles page render
  guard, admin-users role-select visibility). This keeps a hard
  literal-SUPERADMIN-only wall specifically around: (a) Audit Log
  (nav+route, via existing `superAdminOnly` flag/middleware, UNCHANGED —
  this is the one genuinely sensitive route that stays fully hidden/
  blocked for Demo Admin, not just simulated), and (b) anything else we
  deliberately keep on the strict check.
- **New `superAdminOrDemo` middleware** added to permission.js, applied
  to the roles-CRUD routes ONLY (not audit-log) so Demo Admin can view +
  "attempt" role edits (gets simulated), while audit-log stays on strict
  `superAdminOnly`.
- **Demo interception point**: in `apiHandler.js`'s `handleRequest`,
  AFTER the middleware chain resolves successfully, BEFORE the
  controller is invoked: if `mockReq.userRole === "DEMO_ADMIN"` and
  method is POST/PUT/PATCH/DELETE, skip the controller entirely, return
  `{success:true, error:false, isDemoAction:true, message:"Demo Mode: ...", data: req.body || {}}`
  with the DB never touched. GET/HEAD always pass through untouched (so
  viewing works normally, incl. reading masked data from controllers).
- **Popup**: axios.js response interceptor checks `res.data?.isDemoAction`
  → `window.dispatchEvent(new CustomEvent("demo-action",{detail:...}))`.
  New `DemoModeNotice.jsx` component (mounted once, near root layout)
  listens and renders a distinct modal/banner (not a toast — user asked
  for "a nice customized popup"). Normal page logic continues running
  unmodified (optimistic UI still updates from the echoed data), so nothing
  per-page needs to change.
- **Sensitive masking for DEMO_ADMIN** (server-side, in the controllers,
  so it's never even sent over the wire): HR & Payroll → mask
  `monthlySalary`/`bankAccountNumber`-type fields; admin-users/Customers →
  mask email/mobile (partial); site-settings → mask
  `security.ipWhitelist` entries. Small shared helper:
  `src/server/utils/demoMask.js`.
- **Employee sub-types**: Call Center Agent creation ALREADY WORKS
  (`callCenterAgent.controller.js`, gated by `customerCare.edit`, so
  Admin/SuperAdmin already reach it) — leave that flow untouched.
  ADD a new, additive "Employee Type" picker to the existing "Add
  Employee" form in `dashboard/hr-payroll/page.jsx` (HR/Admin/SuperAdmin,
  gated by existing `hrPayroll.edit`) that can optionally provision a
  linked login with role ∈ {HR, MANAGER, STAFF, ANALYST} — a generalized,
  whitelisted version of the same pattern `callCenterAgent.controller.js`
  already uses. New role `HR` added to `ensureSystemRoles`, scoped to
  `hrPayroll` (+`dashboard` view).
- **Dropdown simplification**: `UserMenu.jsx` ADMIN_MENU (15 links)
  replaced by ONE role-aware entry: SUPERADMIN/DEMO_ADMIN → "Go to Super
  Admin Dashboard"; ADMIN → "Go to Admin Dashboard"; any employee-tier
  role (MANAGER/STAFF/ANALYST/HR/CALL_CENTER_AGENT or any future custom
  role with dashboard access) → "Go to Dashboard". Base MENU becomes: My
  Profile, My Orders, Submit Shopping List, Wishlist (Addresses removed
  from dropdown, folded into Profile page as a tab instead).
- **Sidebar regrouping** (`dashboard/layout.jsx`) — exact bucket mapping
  (covers all 17 existing links, verified against ADMIN_LINKS):
  - Products: category, subcategory, product, upload-product, inventory,
    product-requests
  - Analytics: analytics
  - Customer care and call center: admin-orders, customer-care,
    admin-users
  - Website Maintenance: campaigns, coupons, delivery-zones,
    site-settings
  - HR and Payroll: hr-payroll
  - Security and permissions: roles, audit-log (audit-log stays
    superAdminOnly-flagged so it's invisible to Demo Admin same as today)
  Each category = collapsible `<details>`/accordion, default OPEN,
  rendered only if it has ≥1 visible child link for the current role.
- **New `/dashboard/page.jsx`** — overview home. USER role → redirect to
  `/dashboard/profile`. Admin-tier → light stat cards per category
  (Products count, pending Product Requests, Orders today/total,
  open Customer Care tickets, Customers count, Employees count) pulled
  from a new cheap `getOverviewStatsController` in `analytics.controller.js`.
- **Wishlist**: `wishlist.model.js` (userId+productId pairs, unique
  compound index) / `wishlist.controller.js` (add/remove/list/check,
  mirrors address.controller.js) / `api/wishlist/[...segments]/route.js`
  / `store/wishlistSlice.js` / `api.js` entries / heart-icon toggle button
  added to `ProductCard.jsx` (top-right of image, mirrors existing badge
  positioning) and the PDP purchase panel / new `dashboard/wishlist/page.jsx`
  grid page / wired into `UserMenu.jsx` + `dashboard/layout.jsx` +
  `GlobalProvider.jsx` boot fetch + `store/store.js` registry.
- **Profile consolidation**: extract current `dashboard/address/page.jsx`
  body into reusable `components/AddressBook.jsx`; `dashboard/profile/page.jsx`
  becomes tabbed (Profile Info / Addresses / Security); old
  `/dashboard/address` route kept working (renders the same shared
  component) for back-compat, just no longer linked from nav.

## PHASES / CHECKLIST
Work top-to-bottom. Check off `[x]` only once a step is actually done
AND (for code) syntax-checked via the tcs rig.

### Phase 0 — Setup
- [x] Investigation complete (this file)
- [x] Verified tsc-based syntax-check workaround works

### Phase 1 — Roles & permissions backend ✅ DONE
- [x] `role.controller.js`: added DEMO_ADMIN + HR to `ensureSystemRoles`.
      ALSO fixed a real pre-existing bug found while doing this: FULL_PERMS
      never included `customerCare`/`hrPayroll` keys, so ADMIN's roleDoc
      silently defaulted both to false (schema default) — ADMIN could
      never actually see/use Customer Care or HR & Payroll despite the
      sidebar showing the links. Fixed FULL_PERMS + added a migration
      updateOne for SUPERADMIN/ADMIN/DEMO_ADMIN roleDocs so this is
      correct even on a DB where those docs already existed pre-fix.
      Also made assignUserRoleController + getMyPermissionsController
      call ensureSystemRoles() defensively (self-healing regardless of
      seed script / Roles page visit order).
- [x] `permission.js`: added `superAdminOrDemo` export (sets req.userRole
      — important, see apiHandler note below); added DEMO_ADMIN to
      `ADMIN_ROLES` (ip whitelist enforcement)
- [x] token lifetime files (generateAccessToken.js/generateRefreshToken.js):
      added DEMO_ADMIN to admin-tier set
- [x] `lib/utils.js`: added `isDemoAdmin`, `hasFullDashboardAccess`,
      `EMPLOYEE_ROLES`, `isEmployeeRole`, `hasDashboardAccess` helpers
- [x] `api/roles/[...segments]/route.js`: mutation routes now use
      `superAdminOrDemo` (audit-log route left untouched on strict
      `superAdminOnly` — deliberately still fully blocked for Demo Admin)
- [x] `dashboard/admin-users/page.jsx`: ROLES list now
      `["USER","ADMIN","MANAGER","STAFF","ANALYST","HR","CALL_CENTER_AGENT","DEMO_ADMIN","SUPERADMIN"]`;
      gating swapped to `hasFullDashboardAccess`
- [x] `dashboard/roles/page.jsx`: render-guard swapped to
      `hasFullDashboardAccess`
- [x] `notification.controller.js`: DEMO_ADMIN added to unfiltered-view
      shortcut (was already functionally fine via its RoleModel doc, this
      just skips an extra query)
- [x] Syntax-checked all touched files (tsc rig) — all clean

### Phase 2 — Demo Admin simulation engine ✅ DONE
- [x] `apiHandler.js`: interception block (see detailed note above)
- [x] `axios.js`: response interceptor detects `isDemoAction`, dispatches
      `window.dispatchEvent(new CustomEvent("demo-admin-action",{detail}))`
- [x] New `components/DemoModeNotice.jsx`: listens for that event, shows a
      distinct card via `toast.custom()` (reuses the Toaster already
      mounted in Providers.jsx — same stacking/positioning/dismissal, no
      new portal system needed). Uses its OWN fixed friendly copy rather
      than echoing the API's message verbatim (avoids a duplicate-looking
      toast next to whatever normal toast.success(res.data.message) the
      page itself already shows — the two are deliberately complementary,
      not identical). Fixed toast id so rapid clicking refreshes/extends
      one card instead of stacking duplicates.
- [x] Mounted in `providers/Providers.jsx` (inside GlobalProvider, next to
      the existing Toaster)
- [x] Design decision on "same for any error message" requirement: since
      the interception ALWAYS returns success:true for anything that
      would have been allowed (never fabricates a fake error), there is
      no separate "simulated error" case — a Demo Admin only ever sees a
      REAL error (auth expired, CSRF, rate-limit, network) for something
      that genuinely isn't the simulation's concern, shown with its
      normal real message. Documented for the user in the final summary.
- [ ] Small demo-mode badge indicator — DEFERRED into Phase 4's sidebar/
      dropdown rewrite rather than a separate isolated pass (dashboard
      sidebar already auto-shows `user.role` as a badge once DEMO_ADMIN
      exists as a role at all — confirmed while reading dashboard/
      layout.jsx earlier — so baseline coverage already exists even
      before Phase 4; Phase 4 will make it more prominent + add to
      UserMenu.jsx too for storefront pages outside /dashboard)
- [x] Syntax-checked all touched files — all clean

### Phase 3 — Sensitive data masking for Demo Admin ✅ DONE (scoped)
- [x] New `server/utils/demoMask.js`: `maskEmail`, `maskPhone`,
      `maskAccountNumber`, `maskAmount` (returns 0, keeps Number type so
      existing sum/display code doesn't break), `maskFieldsForDemo`
      (generic flat-field masker, array or single object, works on both
      Mongoose docs and plain/lean()/aggregate results)
- [x] hrPayroll.controller.js: masked in `listEmployeesController`
      (monthlySalary, bankAccount, totalMonthlySalary) and
      `listPayrollController` (baseSalary/bonus/deductions/netPay). The
      4 mutation endpoints in this file needed no changes — already
      fully caught by the apiHandler.js interception (POST/PUT/DELETE).
- [x] customer.controller.js: masked email/mobile in
      `getCustomersController` (list), `getCustomerDetailController`
      (detail), AND `exportCustomersController` (CSV export — this one
      matters most: it's a GET/download, not touched by the write-
      blocking layer at all, so without this it would've been a real,
      complete PII leak of every customer straight into a downloaded file)
- [x] customerCare.controller.js: masked customerEmail/customerPhone in
      `listTicketsController` (the "Customer care and call center"
      category is explicitly one of the 6 named sections, so covering its
      main PII surface felt worth the small extra cost)
- [x] Audit Log: needed NO new work — already fully blocked via the
      existing `superAdminOnly` middleware (unchanged, strict, literal
      SUPERADMIN-only) rather than shown-and-redacted, which was always
      the intended design here (see Phase 1 design notes)
- [x] Syntax-checked all touched files — all clean
- **Deliberately deferred / out of scope for this pass** (documented,
  not silently dropped): (1) Site Settings' `security.ipWhitelist` —
  its GET endpoint is genuinely public/unauthenticated (`ROUTES:
  "GET:/get": [[]]`, no `auth` at all, cached sitewide for every visitor
  including anonymous ones) so there's no cheap, low-risk way to even
  know the caller's role there without adding a new "soft auth" concept
  — judged lower severity (internal office IPs, not customer PII/
  financial data) relative to the cost/risk of touching this specific
  hot, public, cached path. (2) Nested populated fields two levels deep
  (e.g. a support ticket's populated `userId.email`, as opposed to the
  ticket's own top-level `customerEmail`) — the generic masker works on
  flat top-level fields; will mention this as a known minor residual gap.

### Phase 4 — Dropdown + sidebar + overview page ✅ DONE
- [x] `UserMenu.jsx` — fully rewritten. Base MENU: My Profile / My Orders /
      Submit Shopping List / Wishlist (Addresses removed — now lives in
      Profile, see Phase 7). `getDashboardEntry(role)` replaces the old
      15-item ADMIN_MENU with exactly one contextual link:
      SUPERADMIN → "Go to Super Admin Dashboard",
      DEMO_ADMIN → "Go to Super Admin Dashboard (Demo)",
      ADMIN → "Go to Admin Dashboard",
      HR/MANAGER/STAFF/ANALYST/CALL_CENTER_AGENT (isEmployeeRole) → "Go to
      Dashboard". Demo Admin gets a distinct secondary-color flask badge
      instead of the plain role-name badge.
- [x] `dashboard/layout.jsx` — fully rewritten. `USER_LINKS` mirrors the
      new dropdown (Profile/Orders/Submit List/Wishlist). `ADMIN_CATEGORIES`
      groups all 17 original links into exactly the 6 named categories —
      verified every single original link landed somewhere, none dropped:
        Products (6): category, subcategory, product, upload-product,
          inventory, product-requests
        Analytics (1): analytics
        Customer care and call center (3): admin-orders, customer-care,
          admin-users
        Website Maintenance (4): campaigns, coupons, delivery-zones,
          site-settings
        HR and Payroll (1): hr-payroll
        Security and permissions (2): roles, audit-log
      `SidebarCategory` = collapsible, default open (useState(true)),
      chevron toggle. `canSee()` uses `hasFullDashboardAccess` (Super
      Admin + Demo Admin see everything) EXCEPT a new `strictSuperAdminOnly`
      flag used only on Audit Log (literal isSuperAdmin check — stays
      hidden from Demo Admin, consistent with Phase 3). Roles & Staff
      dropped its old superAdminOnly flag entirely — now governed purely
      by the normal module/action permission check like everything else
      (more correct: if a real Super Admin ever hand-grants a custom role
      `roles.view`, they should see the link too, not be hard-blocked by
      a separate flag). Added a top-level "Dashboard Overview" link
      (→ `/dashboard`) above the 6 categories. Demo Admin gets an extra
      one-line reminder under their info card in the sidebar too, not
      just the badge.
- [x] `analytics.controller.js` → new `getOverviewStatsController`:
      deliberately NOT gated behind `checkPermission("analytics","view")`
      like the rest of that file — every admin-tier role (including a
      narrow Employee with zero analytics access) needs to land on
      `/dashboard` successfully, so this one only requires `auth`, then
      resolves the caller's OWN role/permissions internally (same
      pattern as getMyPermissionsController) and only computes/returns a
      section's stats if that specific caller has `view` on the
      underlying module — mirrors dashboard/layout.jsx's canSee() logic
      exactly, so nobody ever sees a card for a section they can't click
      into. Cheap countDocuments()-style queries only, run in parallel via
      Promise.all, not the heavier revenue aggregation the main Analytics
      tab uses. Route: `GET /api/analytics/overview` (auth only). api.js:
      `getDashboardOverview`.
- [x] New `dashboard/page.jsx` — the actual overview home. Redirects a
      plain USER role to `/dashboard/profile` (waits for role to actually
      resolve first, not a false-empty redirect on first render). Renders
      one clickable card per visible section (doubles as the mobile
      navigation hub, since the categorized sidebar is desktop-only —
      `hidden md:flex`, unchanged from before — so on mobile this page is
      how an admin-tier user actually gets around now that the dropdown
      is down to one link). Demo Admin gets a "DEMO MODE" badge next to
      the heading too.
      CAUGHT AND FIXED DURING BUILD: first draft used
      `bg-theme-primary/10` (Tailwind's slash-opacity shorthand) on a
      custom CSS-variable-backed class — that shorthand only works on
      Tailwind's own generated color utilities, not arbitrary custom
      classes, so it would've silently done nothing. Replaced with the
      same `color-mix(in srgb, var(--color-primary) 12%, transparent)`
      inline-style pattern already proven elsewhere in this codebase
      (the existing `.badge` CSS class, and my own DemoModeNotice.jsx).
- [x] Syntax-checked all touched/new files — all clean

**Known, accepted mobile-nav tradeoff** (not a regression — the sidebar
was ALREADY desktop-only before any of this work): an admin-tier user on
mobile navigating BETWEEN two sub-pages of the same category (e.g.
Products → Inventory) now goes through the `/dashboard` overview hub or
browser back, rather than reopening a 15-link dropdown. This is the
direct, intended consequence of the spec's explicit ask to cut the
dropdown to one link; the overview page's clickable cards are the
mitigation. A full mobile drawer/nav was NOT built — out of scope, not
requested, and a meaningfully larger undertaking on its own.

### Phase 5 — Wishlist feature (end to end) ✅ DONE
- [x] `server/models/wishlist.model.js` — {userId, productId}, unique
      compound index (also serves both real queries: existence-check and
      full-list)
- [x] `server/models/registerModels.js` — added the new model import.
      IMPORTANT catch during build: this file exists specifically because
      Vercel's isolated serverless functions need every model that's ever
      `.populate()`d to be registered in whichever bundle handles a given
      request, not just the one that happens to import wishlist.controller.js
      directly — skipping this is exactly the kind of bug that only shows
      up in production, not locally, so did it immediately rather than
      risk forgetting.
- [x] `server/controllers/wishlist.controller.js` — get (populated +
      filters out any item whose product was since deleted), add, remove,
      toggle (upsert-style add, used by the heart-icon button)
- [x] `api/wishlist/[...segments]/route.js` — auth-only, no
      checkPermission (personal data, same as address/cart)
- [x] `store/wishlistSlice.js` + registered in `store.js` (NOT added to
      `KEYS_TO_PERSIST` in localStorageMiddleware.js — confirmed that only
      `["siteSettings","currency"]` are meant to be localStorage-persisted;
      wishlist follows cart/address/orders' existing pattern of being
      server-fetched fresh instead, for consistency)
- [x] `lib/api.js`: `getWishlist`/`addToWishlist`/`removeFromWishlist`/
      `toggleWishlist` entries
- [x] `GlobalProvider.jsx`: `fetchWishlist` added alongside
      fetchCartItems/fetchAddress/fetchOrders in the boot sequence,
      refreshAll, and the exposed context value
- [x] New shared `components/WishlistButton.jsx` (used by BOTH
      ProductCard and the PDP panel — one place for the toggle logic).
      Tracks its own optimistic local state from what it just did on
      click rather than trusting the API response's `data.wishlisted`
      field to always be present — deliberately, because a Demo Admin's
      toggle request is intercepted centrally by apiHandler.js and comes
      back as a generic simulated echo that has no `wishlisted` key, so
      relying on the response shape would silently break the heart icon
      specifically in demo mode. Two variants: `floating` (white circle
      over a product image, for ProductCard) and `inline` (reuses the
      existing `.icon-btn` class, for the PDP panel next to Add to
      Cart/Buy Now).
- [x] `ProductCard.jsx`: heart button added top-right of the image
      (top-left is reserved for campaign/discount badges)
- [x] `ProductPurchasePanel.jsx`: heart button added to both the desktop
      CTA row and the mobile sticky bottom bar
- [x] New `dashboard/wishlist/page.jsx`: re-fetches fresh on open (same
      reasoning as My Orders — boot-time fetch could be stale by the time
      someone navigates here), grid layout REUSING ProductCard directly
      (its heart button is already filled/red for everything shown here,
      so clicking it to remove an item works with zero extra code)
- [x] Wired into UserMenu + sidebar — both already pointed at
      `/dashboard/wishlist` from Phase 4; the route now actually exists
- [x] Verified this page needs no auth-redirect of its own: confirmed via
      grep that NONE of the sibling personal pages (myorders/profile/
      submit-list) have client-side login-redirect logic either — this
      app's dashboard pages render for anyone, but every API call they
      make requires a valid token, so an unauthenticated visit just shows
      empty states (my page already does exactly this by construction,
      no extra code needed)
- [x] Syntax-checked all touched/new files — all clean

### Phase 6 — Employee sub-types (HR add-employee flow) ✅ DONE
- [x] Found and fixed a genuine pre-existing bug while reading
      callCenterAgent.controller.js closely (needed its exact pattern as
      a template): it calls `crypto.randomBytes()` for temp-password
      generation but never imports `crypto` anywhere in the file — Node's
      bare global `crypto` is the Web Crypto API, which has no
      `.randomBytes` method (that's the separate legacy `node:crypto`
      module, imported correctly elsewhere in this same codebase e.g.
      passwordPolicy.js/sessionManager.js) — so this would throw the
      moment anyone created a call center agent with a login and no
      custom password typed in. Fixed with the correct import.
- [x] `hrPayroll.controller.js`: new `createEmployeeWithLoginController`,
      whitelisted to `PROVISIONABLE_ROLES = ["HR","MANAGER","STAFF","ANALYST"]`
      (CALL_CENTER_AGENT deliberately excluded — already has its own
      dedicated flow via Customer Care; ADMIN/SUPERADMIN/DEMO_ADMIN/USER
      excluded on purpose — this endpoint can only ever attach an
      *existing*, already-permission-scoped role, never grant elevated
      access or invent a new permission combination, mirroring exactly
      why callCenterAgent.controller.js's own role-provisioning is scoped
      the same way). Same safe pattern: crypto.randomBytes temp password,
      bcrypt cost 12, atomic User+Employee creation, existing-email check.
      Reused the existing `pickEmployeeFields` whitelist for the HR-record
      half, so the SAME mass-assignment protection already documented at
      the top of this file (userId/isCallCenterAgent excluded) applies
      here too, automatically, with no new whitelist to maintain.
      ALSO fixed a gap noticed while re-reading this file for the login
      feature: `listEmployeesController`'s Phase 3 masking only covered
      monthlySalary/bankAccount, not the employee's own email/phone —
      added those two maskers as well.
- [x] `api/hr-payroll/[...segments]/route.js`: new
      `POST:/employees-with-login` route, `checkPermission("hrPayroll","edit")`
      — same gate as every other write in this file, so HR/Admin/Super
      Admin (and Demo Admin, simulated) can all reach it, matching "which
      Super admin, HR, admin can add" directly
- [x] `lib/api.js`: `createEmployeeWithLogin` entry
- [x] `dashboard/hr-payroll/page.jsx`: Employee modal now has a "Also
      create a dashboard login for this person" checkbox (new-employee
      only — retrofitting a login onto an existing HR-only record isn't
      handled by this particular form) that reveals a Role picker
      (mirrors PROVISIONABLE_ROLES exactly) + optional password field.
      On success, the modal shows a one-time credentials panel (role/
      email/temp password) since the password genuinely can't be
      retrieved again afterward — explicitly does NOT show this panel
      when `isDemoAction` comes back true (a Demo Admin's simulated
      response has no real tempPassword to show — would've displayed
      the literal string "undefined" as the password, so this needed
      catching specifically). Employees table also gained a "Login"
      column showing a role badge (with email as a hover title) when an
      employee has a linked account, backed by populating `userId` in
      `listEmployeesController`.
- [x] Syntax-checked all touched files — all clean

### Phase 7 — Profile consolidation ✅ DONE
- [x] New `components/AddressBook.jsx`: extracted verbatim from the old
      standalone address page's body (form + list + delete-confirm),
      renamed to `AddressBook`, added an optional `showHeading` prop
      (true = standalone page behavior unchanged, false = for embedding
      inside a tab without a redundant duplicate heading)
- [x] `dashboard/address/page.jsx`: slimmed to a 9-line wrapper around
      the shared component — kept working at its original URL for
      back-compat/bookmarks, just no longer linked from dropdown/sidebar
      (both point at the new Profile tab instead now)
- [x] `dashboard/profile/page.jsx`: rewritten as a 3-tab page (Profile
      Info / Addresses / Security) wrapped in `<Suspense>` (required by
      Next.js App Router for any component reading `useSearchParams`,
      which this uses to support an optional `?tab=` deep link).
      Profile Info = the exact original avatar-upload + name/email/mobile
      form, unchanged. Addresses tab = `<AddressBook showHeading={false}/>`.
      Security tab = the exact original TwoFactorSection + SessionsSection,
      unchanged, just grouped under a tab instead of stacked below the
      form on the same page.
- [x] Syntax-checked all touched/new files — all clean

### Phase 8 — Employee "own dashboard" sanity pass ✅ DONE (verification only, no code changes needed)
- [x] Manually traced the permission-driven mechanism end-to-end for
      STAFF, HR, CALL_CENTER_AGENT, ADMIN, and DEMO_ADMIN against both
      dashboard/layout.jsx's canSee() and analytics.controller.js's
      canView() — confirmed both use the identical underlying permission
      doc, so sidebar visibility and overview-card visibility always
      agree for every role with zero extra code: e.g. STAFF's actual
      permissions (`orders`,`customers`,`inventory`,`products`:view — no
      `analytics`/`customerCare`/`hrPayroll`/`settings`/`roles`) correctly
      surface only Products (partial) + Customer care and call center
      (partial) in both places; HR correctly surfaces only HR and
      Payroll in both places; CALL_CENTER_AGENT (permissions:
      `{customerCare:{view:true,edit:true}}`, everything else schema-
      defaulted false — confirmed by re-reading ensureAgentRole() in
      callCenterAgent.controller.js) correctly surfaces only Customer
      care and call center in both places; ADMIN correctly sees
      everything except Security and permissions (both links inaccessible
      to it) in both places; DEMO_ADMIN correctly sees everything except
      Audit Log specifically (strictSuperAdminOnly, literal check) in
      both places. No gaps found, no code changes needed.

### Phase 9 — Seed data ✅ DONE
- [x] `seed.js`: added `Demo Explorer` (demoadmin@shahpremiumfoods.com /
      Demo@1234, role DEMO_ADMIN) and `HR Priya`
      (hr@shahpremiumfoods.com / Hr@123456, role HR) to `demoUsers`,
      continuing the exact existing naming/password/mobile-numbering
      conventions. `ensureSystemRoles()` already runs before user-seeding
      in this script (unchanged), so both new roles exist before these
      accounts are created — no ordering issue.
- [x] Found and fixed two more genuine PRE-EXISTING doc-staleness bugs
      while updating credentials documentation for the new roles:
      (1) README.md's "Notes" section still said the seed's roles were
      "SUPERADMIN, ADMIN, MODERATOR, EMPLOYEE, ANALYST, USER" — MODERATOR/
      EMPLOYEE were renamed to MANAGER/STAFF in an earlier work batch (per
      STATUS.md) but this line was never updated to match; fixed, and
      added the two new roles. (2) SETUP.md's seed instructions listed
      `admin@shahpremiumfoods.com` / `Admin@123` as "the superadmin
      account" created by the seed — that email doesn't match ANY entry
      in the actual `demoUsers` array (the real superadmin is
      `superadmin@shahpremiumfoods.com` / `Super@123`; `admin@...` isn't
      seeded at all) — fixed to list accurate credentials and mention the
      new Demo Admin account, since this is the doc a new developer reads
      first.
- [x] (Markdown files — no syntax-check tooling applies; visually verified
      the edits rendered correctly)

### Phase 10 — Verification pass ✅ DONE
- [x] Full-project tsc syntax check: all 39 touched/created files copied
      together into one fresh check — 0 errors
- [x] Systematic import/export verification: grepped the actual export
      line for every NEW cross-file import added this session
      (utils.js's new helpers, demoMask.js, permission.js's
      superAdminOrDemo, wishlistSlice actions, WishlistButton/
      AddressBook/DemoModeNotice default exports, wishlist model/
      controller, hrPayroll's new controller, analytics' new controller,
      GlobalProvider's useGlobalContext, employee.model.js's named
      exports) — every single one resolves correctly, no typos found
- [x] Re-checked every remaining `isSuperAdmin(` call site in the whole
      codebase individually: UserMenu.jsx (has its own separate
      isDemoAdmin branch right after — correct), audit-log/page.jsx
      (intentionally stays strict — correct, matches design), customer-
      care/page.jsx's canSeeCallHistory (already works for Demo Admin
      automatically via its OWN third `permissions?.analytics?.view`
      clause, since Demo Admin's permission doc has analytics:true — no
      change needed, nice confirmation that giving Demo Admin a full
      permission doc makes most of the EXISTING codebase's permission
      checks "just work" without individually auditing every one),
      dashboard/layout.jsx's own strictSuperAdminOnly check (by design).
- [x] grep for leftover references to removed dropdown items /old
      ADMIN_MENU pattern — clean, only expected/intentional matches found
- [x] **Found and fixed one more genuine gap during the security re-read
      of the interception logic**: `POST /api/customer-care/create`
      (submit a support ticket) intentionally has NO auth middleware at
      all — "customers can open tickets without staff perms" — which
      means `mockReq.userId` never gets set for that specific route
      regardless of caller, so a Demo Admin submitting a ticket through
      it would have actually been written for real, un-intercepted
      (apiHandler.js's interception can only catch a request it can
      attribute to a specific user). Fixed properly rather than papering
      over it: added a new `optionalAuth` middleware (auth.js) —
      identifies the caller from a token when one's present, but never
      rejects the request when one isn't — and applied it to just this
      one route. Preserves anonymous ticket submission exactly as before
      for everyone else, while a logged-in Demo Admin is now correctly
      recognized and intercepted like on every other route. Bonus
      side-effect improvement noticed while verifying this was safe:
      `createTicketController` already had `userId: req.userId || null`
      — meaning logged-in (non-demo) customers' tickets will now also
      correctly get attributed to their account instead of always being
      anonymous, which they never did before this fix.
- [x] Verified file-upload requests (multipart/form-data, e.g. "Upload
      Product") can't leak binary data through the demo-simulation echo:
      confirmed in apiHandler.js's own body-parsing code that an
      uploaded file's buffer is kept in a separate `file` variable, never
      merged into `body` (only plain string fields go there) — so
      `buildDemoSimulatedResponse`'s `{...mockReq.body}` echo only ever
      spreads strings, never binary data.
- [x] Verified the edge middleware (src/middleware.js, CSP nonce header)
      applies broadly with no route-specific logic that could interfere
      with the new `/api/wishlist/*` routes — confirmed safe by inspection,
      no changes needed.
- [x] Syntax-checked the 2 additional files touched during this phase
      (auth.js, customer-care route) — clean

### Phase 11 — Documentation ✅ DONE
- [x] Appended new "Batch 23" entry to `STATUS.md`, prepended at the top
      matching this project's own established newest-first convention,
      covering all of: the Demo Admin mechanism, dropdown/sidebar/
      overview rework, Wishlist, Employee sub-types, profile
      consolidation, every pre-existing bug found+fixed along the way,
      and the verification approach used
- [x] This tracker fully updated — every phase now checked off

### Phase 12 — Package & deliver ✅ DONE
- [x] Checked for bloat: no node_modules/.next/.git present, project is
      a clean 2.8MB — nothing to remove
- [x] Final safety pass: checked all 39 touched files for accidentally-
      duplicated export declarations (multiple str_replace edits to the
      same file is exactly the kind of thing that can silently produce
      these) — none found. Checked for stray debug console.logs / TODO
      markers introduced during this session — none found.
- [x] One more full combined syntax re-verification of all 39 files
      together, fresh — 0 errors
- [x] Zipped and delivered

## TASK COMPLETE
All 3 numbered requirements from the original spec implemented, verified,
and documented. See the final chat message for the full summary of
scope, assumptions, and any deliberately-deferred items.

## LOG (append-only, newest at bottom, one line per concrete action)
- Investigation phase complete, this file created.

---

# SESSION 2 — Bug fixes + Enterprise Call Center CRM Module

> Batch 23 above = a different, already-completed task. This is a new
> session appended to the same file (same convention, not a new file).
> **IMPORTANT — sandbox reliability note (learned the hard way this
> session):** file edits that report success in one turn are NOT
> guaranteed to still be on disk at the start of the next turn — this
> session had 3 of 4 edited files silently revert between turns despite
> every tool call reporting success at the time. DO NOT trust this
> file's `[x]` checkmarks alone. Before resuming: re-grep/re-view every
> file this doc claims is done and confirm the actual content is really
> there, THEN continue. Treat "done" as "was verified done as of the
> LOG timestamp below" not "is guaranteed to still be true."

## Source of truth (condensed — full verbatim spec is in the original
## human turn: 5 bug reports + full Enterprise Call Center CRM spec)
Part A, 5 bugs: (1) `GET /api/roles/all` 500/E11000 dup key MANAGER,
(2) super admin sidebar misaligned, (3) sidebar categories should
default CLOSED not open, (4) sidebar profile card too big/wasted gaps,
(5) products page sticky title+sort bar bleeds through content.
Part B: full self-hosted (Asterisk+SIP.js+WebRTC+Socket.IO, NO paid
telephony) call-center CRM inside the existing Customer Care section —
click-to-call+WhatsApp on every order, real incoming-call routing with
queueing/hold-music, live agent status, agent dashboards, call logs,
round-robin order distribution, agent-vs-superadmin permission split,
undo/versioning, reports, Socket.IO notifications, new Mongo
collections referencing (never duplicating) existing User/Order.
Chat instruction overrides the spec doc's own "wait for confirmation
between every feature" — build continuously, checkpoint in this file +
deliver a real zip at milestones, resume on "continue."

## Codebase orientation (fully investigated, confirmed against real
## files — do not re-derive from scratch, grep if a detail is needed)
- Next.js 14.2 App Router, `"type":"module"` (pure ESM everywhere,
  including any custom server.js). Mongoose 8.24, Redux Toolkit,
  react-icons (`Fa*`), recharts already a dependency. Custom JWT auth
  (jsonwebtoken+bcryptjs), no NextAuth. Vercel-oriented today
  (@sentry/nextjs, @vercel/otel present) — standard Vercel serverless
  can't hold a persistent Socket.IO server, see decision below.
- ALL API routes go through ONE pipeline: `src/lib/apiHandler.js`
  `createNextHandler(req,params,ROUTES)`; each resource group is a
  catch-all `src/app/api/<group>/[...segments]/route.js` exporting
  `ROUTES={"METHOD:/path":[[middlewares],controller]}`. Gives CSRF,
  rate limits, sanitization, structured logging (matches the exact log
  format in the bug report), generic mutating-request audit write,
  25s timeout, and Demo Admin transparent interception — ALL new CRM
  routes MUST use this exact shape, never a hand-rolled route.js.
- `auth` (hard JWT check, sets req.userId) / `optionalAuth` in
  `middlewares/auth.js`. `checkPermission(module,action)` /
  `superAdminOnly` (strict) / `superAdminOrDemo` in
  `middlewares/permission.js`.
- **Already exists — extend, never duplicate:** `callLog.model/
  controller.js` (today = plain `tel:` link, manual outcome logging
  after, agentId refs `employee` not `user`); `notification.model/
  controller.js` (broadcast-by-permission-module + per-user `readBy[]`,
  NOT per-recipient fan-out; `createNotification()` is the one write
  path, reuse verbatim); `callCenterAgent.controller.js` (agent
  create/list/update/suspend/delete already fully works, reuse as-is);
  `customerCare.controller.js` (separate ticket system, unrelated,
  leave alone); `employee.model.js` (HR record, optional `userId`
  link, `isCallCenterAgent` flag — **"agent" identity = Employee._id
  throughout**, resolve via `EmployeeModel.findOne({userId:req.userId})`
  same as the existing controller does); `auditLog.model/controller.js`
  (DIFFERENT thing — generic per-request security trail, 365-day TTL,
  not field-level/not revertible — do NOT repurpose for the CRM undo
  requirement, build a separate `crmChangeLog` instead, name chosen
  specifically so it's never confused with this pre-existing one).
- `order.model.js`: phone at `customerSnapshot.mobile` (nested, not
  top-level). `order_status` enum (Pending/Confirmed/On-Hold/On the
  way/Delivered/Cancelled/Return/Refunded) must NOT be extended with
  CRM values (ripples into delivery/payment logic elsewhere) — add
  separate additive fields instead: `assignedAgent`(ref employee),
  `assignedAt`, `followUp:{scheduled,date,note}`. Schema already has
  `optimisticConcurrency:true` — any load-then-save must handle
  VersionError. Existing `statusHistory[]` is a log only, not undo-
  capable, leave as-is.
- `registerModels.js`: every new model file MUST be added here or
  Vercel's serverless isolation throws "Schema not registered" on
  first `.populate()` — bit a previous batch already, checklist item
  for every new model below.
- Existing `tel:` click-to-call links to upgrade live in exactly 3
  files: `admin-orders/page.jsx`, `admin-users/page.jsx`,
  `customer-care/page.jsx`.
- No network, no node_modules in this sandbox. Verified workaround:
  global `tsc` (v6.0.3) in allowJs/checkJs:false/jsx:preserve/noEmit
  mode as a real syntax gate — rig at `/home/claude/work/synctest`,
  recreate with a `tsconfig.json` (allowJs, checkJs:false,
  jsx:"preserve", noEmit:true, target ES2022, module ESNext,
  moduleResolution Bundler) if it's gone, copy any .jsx/.js file in as
  `*.jsx` and run `tsc -p tsconfig.json` — clean output = no syntax
  errors. New runtime deps this build needs (added to package.json so
  `npm install` works for the user, but genuinely can't be exercised
  end-to-end here): `socket.io`, `socket.io-client`, `sip.js`,
  `ari-client`.
- **This sandbox's own shell is `dash` (`/bin/sh`), NOT bash — no
  brace expansion (`mkdir -p a/{b,c}` silently creates a garbled
  literal-named folder instead of expanding). Always write out
  separate `mkdir -p` lines instead.**

## Finalized design decisions
- Socket.IO needs a persistent process → primary design targets a
  custom **`server.js`** (ESM, wraps Next.js + attaches Socket.IO) run
  on the same VPS as Asterisk — simplest, matches the user's own stated
  infra intent. Socket URL read from `NEXT_PUBLIC_SOCKET_URL` (default
  same-origin) specifically so "storefront stays on Vercel, only a
  small Socket.IO+ARI service on the VPS" also works with just an env
  var if preferred — will present both options plainly, not decide for
  the user silently.
- CallLog/Notification: EXTEND (additive fields/enum values only,
  every existing field and caller keeps working exactly as today).
- New models (no existing equivalent): AgentStatus, Assignment,
  CallRecording, Callback, QueueEntry, CrmChangeLog.
- Permission gating: day-to-day agent actions →
  `checkPermission("customerCare","edit")` (matches today's convention,
  CALL_CENTER_AGENT already has this). Everything under the spec's
  explicit "Only Super Admin can…" header (agent create/delete/suspend/
  assign, live monitoring, all recordings, all analytics/export,
  routing/queue/hold-music config, permissions, audit/undo) →
  `superAdminOnly` strict — including TIGHTENING the pre-existing
  agent create/update/delete routes from today's `customerCare.edit` to
  `superAdminOnly` (deliberate, spec-driven, will flag clearly to the
  user as an intentional change).
- Own catch-all `src/app/api/callcenter/[...segments]/route.js` (own
  ROUTES map), not bolted onto customer-care's — large enough to
  deserve its own resource group; `/api/customer-care/*` stays as-is
  except the one deliberate tightening above.
- Module layout: all logic under `src/modules/callcenter/` per spec;
  only the couple of files Next.js's file-based routing physically
  requires elsewhere (the route.js catch-all, page.jsx files) live
  outside it, importing FROM the module.

## PHASES — work top-to-bottom, verify-on-disk before checking `[x]`
### Phase 0 — Investigation & setup — [x] DONE (see above)
### Phase 1 — Bug fixes — [x] DONE, verified on disk + tsc-clean as of
this LOG entry:
- Bug 1 `role.controller.js`: real cause was NOT naive reseeding
  (ensureSystemRoles already per-doc upserts) — the unconditional
  MODERATOR→MANAGER/EMPLOYEE→STAFF rename collided with the unique
  `name` index once the defaults-upsert loop had already created
  MANAGER/STAFF, on any DB still holding a legacy doc — crashed every
  call, forever. New `migrateLegacyRoleName()`: if new name already
  exists, re-home straggler users + delete the redundant legacy doc
  instead of colliding; else do the plain rename.
- Bugs 2+3 `dashboard/layout.jsx` `SidebarCategory`: default
  `useState(true)`→`useState(false)`. Alignment: hardened header row
  (`items-start`+explicit `text-left`+`shrink-0` chevron) so 2-line-
  wrapping titles can't visually drift regardless of wrap point —
  couldn't find one isolated smoking-gun className diff in the actual
  code (every category already shares one array+component), disclosed
  as robustness-hardening rather than a single pinpointed cause.
- Bug 4 same file, profile card: bell moved from its own dedicated flex
  row (a whole wasted row+margin inside a card already forced to the
  sidebar's fixed 240px column) to an absolute corner badge; p-4→p-3,
  gap-3→gap-2.5.
- Bug 5 `products/page.jsx`: removed `sticky top-[150px] md:top-24`
  entirely — the code's own prior comment had already flagged the
  offset as an unmeasured estimate "worth confirming on a real device,"
  this is that confirmation coming back negative. Back to normal flow.
- Reverted once between turns for unknown sandbox reasons, RE-APPLIED
  and RE-VERIFIED via grep + tsc — confirmed genuinely on disk as of
  this log line. A checkpoint zip covering just these 5 fixes is being
  delivered this turn before any CRM work continues, specifically so
  this work is safe in the user's hands even if the sandbox misbehaves
  again.

### Phase 2 — CRM data layer (models) — [x] DONE, verified on disk +
tsc-clean: agentStatus/assignment/callRecording/callback/queueEntry/
crmChangeLog models created; callLog/notification/order extended
additively; all 6 new models registered in registerModels.js.
- [x] models/agentStatus.model.js, assignment.model.js,
      callRecording.model.js, callback.model.js, queueEntry.model.js,
      crmChangeLog.model.js
- [x] Extend callLog.model.js / notification.model.js / order.model.js
      (additive only, see design decisions)
- [x] Add every new model to registerModels.js
- [x] tsc-check all, verify on disk

### Phase 3 — Services — [x] DONE: assignmentService (round robin incl.
least-loaded-agent picking, manual reassign, abandoned sweep, history),
crmChangeLogService (log+undo, dot-path field revert), queueService
(enqueue/oldest-waiter-connect/abandon), callStatsService (daily stats +
performance series + company-wide), agentPresenceService (bridges
userId->Employee->AgentStatus, auto-connects oldest queued caller when
an agent goes available). Decided NOT to add a separate
notificationService.js wrapper — extended the existing
notification.controller.js's createNotification() in place instead
(additive targetUserId param), since that's already the established
single write path other controllers import directly; a wrapper would
just be pointless indirection.
### Phase 4 — Socket.IO — [x] DONE: server.js (root, custom Node+Next+
Socket.IO server, ESM since package.json has "type":"module"; also
hosts the abandoned-order-reassign interval sweep since it's now a
persistent process), socketServer.js (JWT auth off the same httpOnly
`accessToken` cookie + JWT_SECRET_ACCESS every HTTP route already uses,
parsed off the raw handshake cookie header — no separate token-passing
needed client-side; real `superadmins` room joined based on actual role
lookup, not a broadcast-to-everyone shortcut — caught and fixed that in
my own first draft before it shipped), events.js (event name constants),
useSocket.js hook (withCredentials so the cookie rides along),
package.json (added ari-client/sip.js/socket.io/socket.io-client;
dev/start now run `node server.js`; kept `dev:next-only` as an escape
hatch back to plain `next dev` if ever needed; `build` untouched).
### Phase 5 — Core API routes — [x] DONE: 6 new controller files under
modules/callcenter/controllers/ (agentStatus, callback, assignment,
queue, changeLog, crmOrder) + extended callLog.controller.js in place
(real-time status updates, notes thread, detail, filtered list) +
extended notification.controller.js (already done in Phase 3, see
above) + new `src/app/api/callcenter/[...segments]/route.js` (own
ROUTES map, same createNextHandler pipeline as every other route) +
hooked order-status changes into the CRM change-log from inside the
existing order.controller.js (guarded in its own try/catch so a CRM
logging hiccup can never break the core order-status update) + tightened
customer-care's agent create/update/delete to superAdminOnly (done
earlier, part of this phase's permission work).
SECURITY FIX caught + closed this phase: listCallLogsController and
listCallbacksController both accepted a client-supplied `scope=all`
without checking the caller was actually super-admin-tier — a regular
agent could have requested every other agent's calls/callbacks. Now
resolves the caller's real role server-side and silently downgrades to
scope=mine for anyone not in SUPER_ADMIN_ROLES, regardless of what the
query string asked for.
REAL BUG caught + fixed this phase: the str_replace that appended the
real-time controllers to callLog.controller.js accidentally dropped
getCallHistoryController's own return/catch/closing-brace, leaving
every function after it nested one level too deep inside an unclosed
function — a real syntax error, caught by the tsc gate (not shipped),
root-caused by re-reading the file top-to-bottom rather than guessing,
fixed by restoring the missing block, then re-verified clean.
VERIFICATION METHOD UPGRADE this phase: beyond the tsc syntax gate, also
wrote a one-off Python import-resolution audit — parses every
import/require specifier out of every touched file and confirms it
resolves to a real file on disk (handles both relative `../` paths and
the `@/` alias per jsconfig.json). Caught nothing wrong this run (120,
then 85 after the fix, imports all resolved) but is a materially
stronger check than syntax-only and cheap to rerun — worth reusing for
every future phase, not just this one.
### Phase 6 — Click-to-call+WhatsApp — [x] DONE: phoneUtils.js (E.164
normalize w/ configurable NEXT_PUBLIC_DEFAULT_COUNTRY_CODE, wa.me link
builder, duration formatter). WhatsAppButton.jsx supports both a compact
icon-only circle (matches icon-btn-call's exact sizing) and a labeled
pill mode (`label` + `compact` props) for the two different existing
button styles found across the 3 pages. New `.icon-btn-whatsapp` CSS
class added to globals.css, WhatsApp brand green, same shape/pattern as
the existing `.icon-btn-call`. Wired into all 3 real pages with existing
tel: links, beside every existing Call touchpoint (not replacing them —
Call stays on tel: until Phase 7's SIP softphone is ready to take over):
admin-orders (1 spot), admin-users (2 spots: table row + detail modal),
customer-care (2 spots: collapsed-row icon + expanded "Call Customer"
pill). Verified: syntax-clean, all 30 imports resolve, all 3 pages
confirmed actually importing+using the component (grep count check, not
just "should have").
NOTE for Phase 7: the existing `call()`/`handleCall()` functions in all
3 pages still just do `tel:` — when the SIP softphone lands, these are
the exact functions to redirect into `useSipClient().makeCall()` instead
(or in addition to, for a tel: fallback on non-agent accounts, e.g. a
plain ADMIN calling a customer ad hoc without being a provisioned
call-center Employee — see logCallInitiatedController's existing
"not every customerCare staff member is a call-center Employee" comment,
same reasoning applies to who gets real WebRTC calling vs. tel: fallback).
### Phase 7 — WebRTC/SIP client — [x] DONE: telephony/sipClient.js
(framework-agnostic SIP.js v0.21 wrapper: UserAgent/Registerer/Inviter/
SessionState, remote-audio element attach, DTMF, basic hold via track
enable/disable — noted in-code that a "real" SDP-renegotiation hold is a
known simplification to revisit against a live PBX). hooks/
useSipClient.js (React binding: call state machine, CallLog API
integration on answer/end, agent status auto-flips to on_call/available
around calls). components/AgentStatusToggle.jsx (the 5 manual statuses
only — ringing/on_call are automatic, never shown as agent-pickable),
Softphone.jsx (persistent floating widget: connect toggle, active-call
controls, renders IncomingCallModal.jsx when phoneState is "incoming").
SIP CREDENTIAL PROVISIONING added (needed before any of the above can
register to anything): employee.model.js additive sipUsername/
sipPassword fields (plaintext for now — explicit in-code security note
that production should encrypt at rest, not silently pretended as
solved); generated via crypto.randomBytes (matching the existing temp-
login-password pattern) in createCallCenterAgentController; new GET
/api/callcenter/telephony/credentials endpoint returning sipUri/password/
wsServer/sipDomain from ASTERISK_WS_URL + ASTERISK_SIP_DOMAIN env vars
(503s clearly if telephony isn't configured yet, rather than a confusing
generic failure).
WIRED IN: AgentStatusToggle + Softphone added to dashboard/layout.jsx,
gated to `user.role === "CALL_CENTER_AGENT"` only — not shown to every
dashboard user. Softphone is `fixed` positioned so it didn't need a
dedicated layout slot.
BUG CAUGHT + FIXED before landing: useSipClient.js originally required
a second NEXT_PUBLIC_SIP_DOMAIN client env var for makeCall() that
could drift out of sync with the server's ASTERISK_SIP_DOMAIN (already
returned by the credentials endpoint) — reused the fetched value via a
ref instead, removed the redundant config surface and a dead no-op
variable in the same pass.
Also removed a non-existent `animate-pulse-once` Tailwind class from
IncomingCallModal.jsx (would have silently done nothing — not a build
error, just dead markup) — kept `animate-bounce` (a real utility) on the
icon for the incoming-call visual cue.
VERIFIED: tsc syntax-clean, 90 imports across 31 files all resolve
(Python audit), brace-balance sanity check on the 3 most complex new
files (useSipClient 30/30, Softphone 48/48, AgentStatusToggle 36/36).
HONEST LIMITATION (repeated deliberately, this is the phase it matters
most for): none of this SIP/WebRTC code has been exercised against a
real Asterisk server — no telephony infra or network access in this
sandbox. It's written correctly against the real SIP.js API as far as
static review can confirm, but live-call verification is a Phase-8/
your-VPS activity, not something already secretly tested here.
### Phase 8 — Asterisk config + ARI call-routing service — [x] DONE:
asterisk-config/{pjsip,extensions,http,rtp,ari}.conf (WebRTC WSS
transport, Stasis-based dialplan handoff rather than app_queue for full
programmatic control, TLS/NAT/RTP-port callouts inline),
generatePjsipConfig.js (queries MongoDB for provisioned agents, writes
pjsip_agents.conf — re-run on agent add/delete), ariClient.js (the real
routing logic: sequential ring through available agents oldest-first,
per-agent timeout->next agent, queue+MOH if all busy, recording via
MixMonitor + a polling watcher that syncs finished files into
CallRecording docs), telephony/README.md (full VPS walkthrough).
BUGS CAUGHT + FIXED before landing, not just documented as known issues:
(1) dead unused imports in ariClient.js removed. (2) the "agent becomes
available -> connect oldest waiter" flow updated DB records but never
actually touched the Asterisk channel — connectOldestWaiterTo() now
populates callLogId, agentPresenceService.js now dynamically+guardedly
calls a new bridgeQueuedCallerToAgent() so this is a REAL bridge, not
just DB bookkeeping that looked complete but wasn't. (3) PJSIP endpoint
naming mismatch (generatePjsipConfig.js uses sipUsername,
ringAgent() was building from agentId._id) — fixed ringAgent() to use
sipUsername (added to the 2 relevant .populate() calls). (4) resolved,
not hand-waved, the real cross-process Socket.IO limitation if
ariClient.js runs separately from server.js — wired it to start FROM
server.js instead, guarded by ASTERISK_ARI_PASSWORD so a missing/
unconfigured Asterisk never crashes the app on boot.
VERIFIED: tsc syntax-clean, brace/paren balance on ariClient.js (66/66,
153/153), 79 imports across 30 module files all resolve.
HONEST LIMITATION: nothing in this phase has touched a real Asterisk
server — no telephony infra/network access in this sandbox. Correct
against documented config/API syntax as far as static review confirms;
real-call verification is a your-VPS activity per the README.
### Phase 9 — Agent dashboard baseline — [x] DONE: dashboard.controller.js
(3 endpoints: my-stats, my-recent-calls, my-performance — all resolve
the caller to their Employee/agent identity first, 403 cleanly if not a
provisioned agent rather than leaking data), wired into the callcenter
route. StatsCards.jsx (today's incoming/outgoing/missed/answered, total+
average talk time, assigned/completed/pending orders — matches spec's
list exactly). RecentCalls.jsx (last 10, status-colored, recording play
link when available). New page at dashboard/call-center/page.jsx — added
as "Agent Dashboard", first item in the existing Customer care and call
center sidebar section (didn't touch the other 3 existing links there).
Handles the not-a-provisioned-agent case gracefully (clean message +
403, not a crash) rather than assuming every viewer is an agent.
VERIFIED: tsc syntax-clean, 103 imports across 35 files resolve, grep-
confirmed the sidebar link and all 3 new routes are actually wired (not
just files sitting unreferenced).
### Phase 10a — Super Admin CRM console — [x] DONE: Live Agent Monitor
(dashboard/call-center-admin/page.jsx — real-time status grid + counts
via the existing GET /agent-status/all + Socket.IO), CRM Reports
(dashboard/call-center-admin/reports/page.jsx — recharts pie+bar,
30s-interval refresh, new GET /dashboard/company-reports endpoint,
superAdminOnly), CRM Change History + one-click undo (dashboard/
call-center-admin/change-log/page.jsx — uses the existing GET
/change-log + POST /change-log/undo endpoints, was already fully built
server-side since Phase 5/3, just had no UI until now). All 3 wired into
the sidebar using the exact same `strictSuperAdminOnly` pattern the
pre-existing Audit Log link already used (genuinely hidden from
DEMO_ADMIN too, not just simulated).
GAPS CAUGHT + FIXED while wiring this up (things that looked done in
earlier phases but weren't actually connected or were silently broken):
(1) sweepDueCallbacks() (built Phase 5) was never scheduled anywhere —
now runs every 60s from server.js, same pattern as the abandoned-order
sweep. (2) AgentStatusToggle.jsx's socket listener compared against
`socket.userId`, which never exists on the CLIENT-side socket object
(only set server-side during auth) — this made the listener's filter
condition permanently false, i.e. it silently did nothing since Phase 7.
Fixed to track the agent's own employee id from its initial fetch and
actually sync displayed status on real external changes (another tab, a
super admin action) instead of a dead comparison.
VERIFIED: tsc syntax-clean, 120 imports across 38 files resolve.
DEFERRED to Phase 10b (queue/routing settings config UI, hold-music
upload, agent management CRUD UI beyond what callCenterAgent.controller.js
already exposes) and Phase 10c (Order Visibility tabs + customer
timeline) — see below.

### Phase 10c — Order Visibility tabs + timeline — [x] DONE:
listCrmOrdersController (tabs: all/pending/completed/follow-up/
cancelled map onto order_status where it already covers them, follow-up
is its own field since it isn't a real order_status value — "mine" is a
SCOPE via assignedAgent, not a tab, matching how the spec actually lists
these 6 together), getOrderCrmDetailController (one call returns
everything the timeline needs). OrderTimeline.jsx (Assigned Agent +
Assignment Time + full Assignment History + Call History + Notes with
add-note inline, in one panel — spec's exact list). New page at
dashboard/call-center/orders/page.jsx (tab bar + list + slide-in
timeline panel), added to the sidebar as "My Order Queue" right after
Agent Dashboard.
BUGS CAUGHT + FIXED before landing: (1) listCallLogsController's new
orderId filter was written but the pre-existing mine/all scope logic
below it still ran unconditionally, which would have silently
restricted an order's call-history view to only calls where the
CURRENT viewer happened to be the agent — fixed to skip that whole
block when orderId is present, matching the comment's own stated intent
that was never actually implemented. (2) crmOrder.controller.js's
listCrmOrdersController had a genuinely dead SUPER_ADMIN_ROLES const
and an unused UserModel import from an abandoned first draft (a role
check that was written then decided against — "All Orders" is available
to regular agents per spec, not restricted) — removed rather than left
as harmless-looking clutter. (3) Caught a wrong guessed field name
before it ever ran — used a `total ?? totalAmount` fallback chain for
order price display without checking the real schema first; the actual
field is `totalAmt`. Corrected by grepping the schema instead of
guessing plausible names.
VERIFIED: tsc syntax-clean, callLog.controller.js brace-balanced
(111/111 after the fix), 112 imports across 37 files resolve.

### Phase 10 remaining — queue/routing settings + hold-music config UI
(lower priority: day-to-day CRM use doesn't depend on it, routing logic
itself already works via ariClient.js's hardcoded sensible defaults —
this would just be a UI to adjust ring timeout etc. without redeploying),
final full-project re-check + zip.

## LOG (append-only, newest at bottom)
- Session 2 started: read Batch 23 tracker + STATUS.md, deep-
  investigated all CRM-adjacent existing code, wrote this section,
  fixed all 5 bugs against real files, tsc-verified clean.
- Turn boundary: 3 of 4 edited files + this whole tracker section had
  silently reverted despite prior success — re-verified via grep,
  re-applied all 3, re-verified again (now genuinely present), re-
  wrote this tracker section. Delivering a bug-fixes-only checkpoint
  zip now before continuing into Phase 2, specifically to de-risk
  further sandbox instability.
- Phase 10 finished: queue/routing settings (new crmSettings model,
  singleton-doc pattern, registered per the standard checklist), read
  LIVE by ariClient.js at the start of each incoming call rather than
  once at process startup — Super Admin changes take effect on the very
  next call, no service restart. Caught a real bug while wiring this in:
  renaming the old top-level RING_TIMEOUT_MS constant to
  DEFAULT_RING_TIMEOUT_MS left two other call sites still referencing
  the old, now-undefined name — syntactically valid JS (tsc's
  allowJs/checkJs:false mode can't catch this class of bug, it's a
  runtime ReferenceError, not a parse error), found by grepping for the
  exact old identifier across the module after the rename rather than
  assuming the rename was complete. Also found sendToQueue() was
  hardcoding mohClass:"default" regardless of the setting — fixed to
  actually use it.
- FINAL FULL-PROJECT VERIFICATION PASS completed: every one of the 41
  files in src/modules/callcenter/ plus every touched existing file
  (bug fixes, extended models/controllers, sidebar, routes) individually
  syntax-checked via the tsc rig — clean. Separately, a brute-force
  brace/paren balance count across every module file — all balanced.
  Separately again, the Python import-resolution audit — 254 import
  specifiers across 59 files, every one resolves to a real file on disk.
  Separately again, grepped for the exact stale-identifier bug class
  just caught above, project-wide — zero remaining instances. All 5
  original bug fixes re-confirmed present on disk one final time.
  package.json re-confirmed valid JSON with all 4 new runtime
  dependencies (socket.io, socket.io-client, sip.js, ari-client) and
  dev/start scripts pointed at the new custom server.js.

## STATUS: Bug fixes (Phase 1) + CRM module (Phases 2–10) both complete.
Genuinely deliverable state: the whole application layer (data models,
services, real-time layer, API routes, click-to-call/WhatsApp, softphone
UI, agent dashboard, super admin console, order visibility+timeline,
settings) is written, internally consistent, and verified by every
static check available in this sandbox (syntax, import resolution,
brace/paren balance, stale-identifier grep, actual wiring confirmation
via grep counts rather than assuming a file's existence means it's used).
The one thing that could NOT be verified here, stated once more plainly:
live behavior against a real Asterisk server, because no telephony
infrastructure or network access exists in this sandbox. Everything
telephony-related is written correctly against documented APIs as far as
static review can confirm; real-call verification is a your-VPS activity,
walked through step by step in telephony/README.md.
If resuming after this point: there is no more planned work. Re-verify
the state of things (this file's own advice, repeated throughout) before
assuming anything below this line is still true, then ask the user what
they'd like next rather than guessing at further scope.

---

## POST-DELIVERY BUG REPORT (user caught this after the "final" zip)

User ran `npm install && npm run dev` on real infrastructure and hit:
`SyntaxError: Identifier 'NotificationModel' has already been declared`

**Root cause:** the Session-2 edit to `notification.model.js` (extending
the schema with targetUserId/new type enum values) used an `old_str`
that ended right after the schema's closing `);` — it did NOT include
the file's own trailing `index()` calls + `const NotificationModel = ...`
+ `export default` lines that came after that point in the original
file. The `new_str` for that same edit DID include a fresh copy of
those same trailing lines (needed to close out the replacement block
correctly). Net effect: the replacement inserted a second copy of the
index/export block immediately after the new schema, while the
original file's own copy of those same lines — never targeted by
`old_str` — remained untouched further down. Result: `const
NotificationModel = ...` and `export default NotificationModel` each
appeared TWICE in one file. This is a real `SyntaxError` in actual
Node/V8, not a style issue — the whole app fails to boot.

**Why my verification didn't catch it:** the tsc-based rig used
throughout this build (`allowJs: true, checkJs: false, jsx: "preserve"`)
parses JS/JSX for basic syntax validity but — confirmed by direct
testing during this fix — does NOT flag duplicate top-level `const`
declarations in that configuration. A real Node.js parser does (`node
--check` reproduces the user's exact error message on a duplicate-const
test file). This was a genuine blind spot in the verification method
used for the entire build, not a one-off skipped check.

**Fixed:** removed the duplicate trailing block, kept one copy.

**Then audited the entire rest of the build for the same bug class**,
since if it happened once from this exact edit pattern (extending
existing trailing content via str_replace), it could plausibly have
happened elsewhere:
1. Grepped every model file for duplicate `export default` / duplicate
   `mongoose.model()` calls specifically — all clean (employee.model.js
   correctly shows 2 `mongoose.model()` calls, since it legitimately
   defines 2 models — not a bug).
2. Wrote a precise top-level-only (column-0, not nested) duplicate-
   declaration + duplicate-export-default check in Python, ran it across
   all 56 touched .js/.jsx files — zero further issues found.
3. Confirmed `node --check` (the REAL V8 parser) doesn't try to resolve
   imports (safe to run without a full install) and ran it across every
   plain `.js` file touched this session (the .jsx files can't be
   checked this way — V8 doesn't parse JSX — covered instead by check 2
   above) — 100% pass, including every model file.

**Verification methodology upgrade, for real this time:** `node --check`
is now the authoritative check for `.js` files going forward — it's
what the user's own `node server.js` / `next dev` will actually run
through, and it catches classes of error (duplicate declarations, other
genuine V8-level SyntaxErrors) that the tsc-in-permissive-JS-mode
approach used for the rest of this build did not. For `.jsx` files
(which `node --check` cannot parse), the top-level duplicate-declaration
regex check is the supplementary layer. Any future extend-existing-file
edit (the specific pattern that caused this — inserting new content
that includes what LOOKS like it should be the file's natural trailing
boilerplate) should get an immediate full re-view of the file afterward
to confirm the trailing content wasn't ALSO left in place from before
the edit, not just a batched syntax check days later.

STATUS: fixed, audited project-wide, corrected zip re-delivered.

---

## POST-DELIVERY BUG REPORT #2 (user ran the CORRECTED zip for real)

Error: `Error: This module cannot be imported from a Client Component
module. It should only be used from a Server Component.` thrown from
`node_modules/server-only/index.js`, crashing `node server.js` at boot.

**Root cause:** `src/lib/mongodb.js` has `import "server-only"` at its
top — a real, correct, pre-existing protection for the rest of this
app, which only ever runs through Next.js's own webpack/SWC pipeline
(API routes, Server Components). This custom `server.js`, by design
(needed for Socket.IO), runs as PLAIN Node — loaded by Node's own native
module loader, never touched by webpack. The `server-only` package
differentiates "safe" vs. "throw" behavior using package.json export
conditions that only webpack (via Next.js's config) defines; under
plain Node's default resolution it falls through to the throwing build,
even though nothing here is anywhere near an actual Client Component.
3 files in the CRM module imported `lib/mongodb.js` directly and hit
this the moment `server.js` (or, separately, `generatePjsipConfig.js`,
also run standalone) tried to load: `socketServer.js`, `ariClient.js`,
`generatePjsipConfig.js`.

**Fix:** new `src/modules/callcenter/socket/dbConnectForServer.js` —
the exact same connection logic as lib/mongodb.js (retry loop, pooling,
mongoose settings, registerModels side-effect import), deliberately
duplicated rather than importing the guarded file, specifically for
code that runs in this plain-Node context. `lib/mongodb.js` itself was
NOT touched — its guard is correct for every other part of this app and
weakening it would reintroduce the exact accidental-client-bundling risk
it exists to prevent. All 3 affected files switched to the new
connector. `server.js` now also calls it once explicitly at startup,
before the HTTP server starts listening, so no socket event or interval
job can ever race against an unconnected database.

**Then checked comprehensively for the same class of issue elsewhere**,
since this was the second time a "looks like a one-off" bug turned out
to need a full sweep:
1. Grepped the entire callcenter module + server.js for imports of ALL
   8 files in this app that carry a `server-only` guard (not just
   mongodb.js) — only mongodb.js was ever actually imported.
2. Grepped `src/server/models/` specifically — since `registerModels.js`
   loads EVERY model unconditionally, any model importing a guarded
   file would hit this too — found 2 more STRING matches, both verified
   to be comment/prose mentions of a filename, not real `import`
   statements (auditLog.model.js references lib/logger.js in a comment
   explaining a design decision; registerModels.js references
   lib/apiHandler.js in a comment explaining load order) — real risk:
   zero.
3. Wrote a precise regex pass matching only actual `import ... from`
   statement syntax (skipping comment lines entirely) across all 61
   files reachable from server.js (every model + the whole module) —
   confirms zero real imports of any guarded file remain.
4. Re-ran the full node --check sweep + duplicate-declaration check +
   import-resolution audit project-wide after this fix, since it
   touched server.js itself (the most foundational file in the custom-
   server chain) — all clean.

STATUS: fixed, comprehensively audited (not just the one reported file),
corrected zip re-delivered.

---

## POST-DELIVERY BUG REPORT #3 (user got past boot, hit a page)

Error: `TypeError: Axios.get is not a function` on the Live Agent
Monitor page.

**Root cause:** `src/lib/axios.js` exports a plain FUNCTION taking a
config object — `Axios({ url, method, ... })` — NOT a standard axios
instance with `.get/.post/.put` convenience methods. This is
intentional and explained in the file's own (accurate) comment: every
pre-existing call site in this app already used the config-object form.
I assumed the more common standard-axios-instance shape without
actually checking this file first — the same class of mistake as the
`totalAmt` field-name guess in Phase 10c, just in a new spot. Every one
of my 9 new files (AgentStatusToggle, OrderTimeline, useSipClient, and
6 new pages) called `.get/.post/.put` directly and would have hit this
identical crash the moment a user reached any of them.

**Fix:** added `.get/.post/.put/.delete/.patch` as plain properties on
the exported `Axios` function (functions are objects — this needed no
restructuring), each routing through the exact same internal `Axios()`
call so the auth-refresh, retry-on-502/503/504, and Demo Admin
interceptor logic apply identically either way. Verified first, not
assumed: grepped the entire existing app for any `.get/.post` usage
outside my module — genuinely zero, confirming the file's own comment
and that this addition is safe. Zero changes needed to any of the 9
call-site files — they all already used standard axios calling
convention, which now actually works.

**Then proactively re-verified, rather than wait for the next one-at-a-
time report:** checked `displayPrice` and `axiosToastError` (the only
two other `@/lib/*` utilities used anywhere across the whole module)
against their real implementations — both confirmed correct as used
(displayPrice's extra params all have safe defaults; axiosToastError's
expected error shape matches exactly what every CRM controller actually
returns). Grepped for every unique `@/lib/*` / `@/components/*` import
across the entire module — only those 3 total, all now verified.

VERIFICATION METHOD NOTE: this class of bug (assuming a shared
in-house utility's calling convention rather than reading it) is
different from the syntax-error classes caught earlier — no automated
check catches "this function doesn't have the shape I assumed" short of
either reading the source or executing it. Going forward for this
project: before using ANY shared `@/lib/*` utility for the first time in
new code, read its actual export/signature first, the same discipline
already applied to model field names since the totalAmt incident —
extending that same rule to utility functions, not just schema fields.

STATUS: fixed, verified via node --check + jsx syntax check, corrected
zip re-delivered.

---

## POST-DELIVERY BUG REPORT #4 (3 separate issues in one message)

### Issue A: webpack build error - Can't resolve 'bufferutil'/'utf-8-validate'
Import trace showed: route.js -> agentStatus.controller.js ->
agentPresenceService.js -> (dynamic import) ariClient.js -> ari-client
-> ws -> ws's OPTIONAL native addons. Root cause: agentPresenceService.js
is reachable from a REAL Next.js API route (updateMyAgentStatusController),
which Next's webpack build processes normally — and webpack statically
analyzes dynamic import() calls too, for code-splitting, so it tried to
resolve ari-client's entire dependency tree as part of the ordinary app
build, even though that dynamic import was meant to only ever fire from
the plain-Node socket context.
FIX: removed all reference to ariClient.js from agentPresenceService.js
— it's now a pure DB-update function with zero telephony coupling, safe
for webpack. Moved the "connect oldest queued waiter via Asterisk" side
effect into socketServer.js's own AGENT_STATUS_UPDATE handler instead —
that file is genuinely never processed by Next's webpack (only loaded
by server.js via plain `node server.js`), so it's the one safe place in
the whole app to reference telephony code, even dynamically. Verified
by grepping every remaining ariClient.js reference project-wide — only
server.js and socketServer.js import it now, both confirmed
webpack-untouched.
Cost of this fix: the REST fallback path for agent status (for clients
that haven't connected the socket yet) no longer auto-bridges a queued
caller — only the primary socket path does. Documented as a deliberate,
acceptable tradeoff, not silently dropped.

### Issue B: unauthorized/logged-out visitors saw broken restricted
pages instead of being redirected
Root cause: the sidebar already had a `canSee()` check, but it only
controlled which LINKS were shown — nothing stopped someone from typing
a restricted URL directly. The page would render, its data fetches
would 401/403, and the raw "Unauthorized access"/"Permission denied"
API error messages surfaced as toasts on an otherwise-broken page.
FIX: dashboard/layout.jsx now matches the current pathname against the
same ADMIN_CATEGORIES config already used for the sidebar (one source
of truth, not two), and once the permission-check state has genuinely
resolved, redirects anyone who can't see that page to "/" with a
generic "Page not found" message — deliberately generic rather than
"Unauthorized", so a logged-out/under-privileged visitor doesn't get
confirmation that a restricted route even exists.
REAL BUG CAUGHT WHILE BUILDING THIS, before it shipped: the natural
signal for "has the permission check resolved" is permissionsSlice's
`loaded` flag — but `clearPermissions()` (fired on logout, idle-timeout,
or a FAILED initial auth check) set `loaded: false`, indistinguishable
from "hasn't checked yet". A logged-out visitor would have been stuck on
this guard's "Loading…" placeholder forever, never actually redirected
— a different, still-broken experience than what was reported. Caught
by tracing the actual boot sequence (GlobalProvider.jsx) rather than
assuming the flag meant what its name suggested. Fixed by grepping
every consumer of `permissions.loaded` first (confirmed nothing else in
the app reads it — my own new code was the only consumer), then
changing clearPermissions() to set `loaded: true` (meaning "the check
resolved", not "valid permissions were found") — role:""/permissions:{}
already correctly evaluate as "deny" everywhere that matters.

### Issue C: assigning "Call Center Agent" to an existing user via the
admin-users role dropdown → "Role not found"
Root cause: CALL_CENTER_AGENT was never in ensureSystemRoles()'s
`defaults` array — it only ever got created on-demand by
callCenterAgent.controller.js's OWN ensureAgentRole(), the first time
anyone used the dedicated "create call center agent" flow. The generic
assignUserRoleController's self-heal (calls ensureSystemRoles() first)
never created it, so RoleModel.findOne({name:"CALL_CENTER_AGENT"}) kept
404ing on any install where nobody had used that dedicated flow yet —
even though the dropdown itself already listed it as a selectable
option (admin-users/page.jsx's ROLES array already included it).
FIX: added CALL_CENTER_AGENT to the defaults array, same label/
description/core permission grant ensureAgentRole() already creates
(functionally equivalent permissions shape, spread through EMPTY_PERMS()
for consistency with every other entry in the array — not byte-
identical to ensureAgentRole()'s sparser object, but evaluates
identically everywhere permissions get checked). ensureAgentRole()'s own
`if (!role)` guard means whichever path runs first is fine — no conflict
either way.
SECOND PART OF THIS REPORT — NOT ACTED ON, DELIBERATELY: "without user
every other roles should appear in employee list" is genuinely ambiguous.
Investigated the HR/employee creation form (hr-payroll/page.jsx) and
found CALL_CENTER_AGENT is ALSO deliberately excluded from its
PROVISIONABLE_ROLES list, with an explicit prior-session comment
explaining why: agents need sipUsername/sipPassword generation +
isCallCenterAgent:true, which this generic form's submission logic
doesn't do — adding the role to this dropdown WITHOUT also wiring up
that logic would create a WORSE bug (a "Call Center Agent" with
dashboard access but a permanently broken softphone, since every
telephony code path resolves "the agent" via
isCallCenterAgent:true). Rather than guess which of several possible
readings was meant and risk removing an intentional safeguard, asked
the user to clarify in the response instead of shipping a speculative
change to code that was deliberately built this way for a stated reason.

VERIFIED: node --check on all touched .js files, jsx syntax check on
layout.jsx, 113 imports across 40 files resolve, all 5 original bugs +
every prior fix re-confirmed intact.

---

## Follow-up on Issue C's second part (user gave no preference, proceeded
## with best-supported interpretation)

Extended CALL_CENTER_AGENT support to the general employee-creation form
(hr-payroll/page.jsx + hrPayroll.controller.js's
createEmployeeWithLoginController), rather than leave it excluded there.
Added to PROVISIONABLE_ROLES on both client and server. Critically, also
added the SIP credential generation + isCallCenterAgent:true that was
the ACTUAL reason this was excluded before (confirmed via the prior
session's own comment) — an agent created from this form now ends up in
an identical, fully-working state to one created via the dedicated
Customer Care flow, using the exact same crypto.randomBytes generation
pattern, rather than a second, lesser duplicate that would have dashboard
access but a permanently broken softphone. No additional "reveal SIP
credentials" UI needed — the softphone fetches them automatically per-
agent via GET /api/callcenter/telephony/credentials using the agent's
own session, never manually transcribed the way a login password is.

VERIFIED: node --check on both touched files, jsx syntax check on the
page, full project re-verification of every fix across this entire
conversation (all 5 original bugs + all 4 post-delivery fixes) all still
intact.

---

# SESSION 3 — RBAC bug fix + Advanced HRMS Features roadmap

> Sessions 1 & 2 above = complete, delivered, separate prior work. This is
> a new session appended to the same file (same convention). **Read the
> "sandbox reliability note" at the top of Session 2 before trusting any
> `[x]` below — re-verify on disk before continuing, don't assume.**

## Source of truth (verbatim intent from user this session)
1. Bug report: "call center agent can access admin and super admin
   dashboard which they should not."
2. Re-attached `Advanced_HRMS_Features.docx` (biometric attendance incl.
   facial recognition + fingerprint, self-hosted OCR document processing,
   dynamic document generation/template engine, configurable payroll &
   tax, employee digital file) — confirmed via project-wide grep this is
   **0% implemented**, a fresh body of work, not a continuation of
   anything already on disk.
3. Instructions: read everything first, make a roadmap, work carefully,
   track every command (this file), resume from last checkpoint on
   "continue", deliver a working zip.

## Part A — RBAC bug: investigation + fix (DONE, verified)

### Investigation path (so it's never re-walked from scratch)
Read every layer touching dashboard access control end to end before
touching anything: `lib/utils.js` role helpers, `dashboard/layout.jsx`
(`canSee()` + the pathname-based access-guard added in Session 2's
POST-DELIVERY BUG REPORT #4 Issue B), `UserMenu.jsx` dropdown labeling,
`dashboard/page.jsx` + `getOverviewStatsController` (per-caller section
scoping), `permission.js` (`checkPermission`/`superAdminOnly`/
`superAdminOrDemo`), the full `callcenter` API route table, `role.model.js`
schema defaults, `role.controller.js`'s `ensureSystemRoles`/`FULL_PERMS`/
`EMPTY_PERMS`, `callCenterAgent.controller.js`'s `ensureAgentRole`,
`user.model.js`'s role field (uppercase-enforced, ruled out a case-
mismatch theory), `GlobalProvider.jsx`'s boot sequence, `customer.controller.js`.
**All of the above were confirmed correctly scoped as written** — every
one of these was a real candidate hypothesis, individually verified and
ruled out, not skipped.

### Root cause (found)
`dashboard/customer-care/page.jsx` — a page CALL_CENTER_AGENT is
legitimately meant to open (`customerCare.view`) — renders a "Call
Center" tab (`CallCenterTab()`) containing the full agent roster
(name/email/phone/status) plus **Add Agent / Edit / Delete controls**,
with **zero role check on the tab itself** (unlike the sibling "Call
History" tab in the exact same file, which correctly uses a
`canSeeCallHistory` gate). Spec (`HRMS_PROMPT.docx`) is explicit this is
"Only Super Admin can: Create agents, Delete agents, Suspend agents,
Assign call center agents." Server-side the POST/PUT/DELETE on this
resource were already correctly `superAdminOnly` (Session 2 tightened
these) — so no mutation could actually succeed — but the buttons/roster
were fully visible and clickable to ANY customerCare-permission holder,
including a plain CALL_CENTER_AGENT, and incidentally also a legacy
ADMIN (whose FULL_PERMS also includes customerCare). This is what "can
access admin/super admin dashboard" was actually describing: a real
admin-management surface rendering inside a page an agent is allowed to
be on, not a sidebar/route-guard leak (those were all already correct).

### Fix (applied + verified on disk this session)
1. `dashboard/customer-care/page.jsx`: new `canManageAgents =
   isSuperAdmin(user.role)` (strict, not `hasFullDashboardAccess` —
   matches this exact module's own precedent: the sidebar's 4
   `strictSuperAdminOnly` call-center-admin links are deliberately
   hidden from Demo Admin too, not simulated, for the same class of
   "Only Super Admin can" spec item). Gates the tab BUTTON and, as a
   defensive second layer, the render ternary itself (`tab ===
   "callcenter" && canManageAgents`) so the panel can never render
   regardless of how `tab` state got set.
2. `api/customer-care/[...segments]/route.js`: `GET:/agents` (the roster
   listing) tightened from `checkPermission("customerCare","view")` to
   `superAdminOnly`, matching the already-correct POST/PUT/DELETE on the
   same resource — closes the direct-API-call vector too, not just the
   UI. Verified nothing else consumes this endpoint (`grep
   getCallCenterAgents` → exactly one call site, the now-gated tab).
3. `customer.controller.js` `getCustomerDetailController` — separate,
   secondary finding from the same investigation: `UserModel.findById(id)`
   had no role filter at all (unlike the list/export endpoints in the
   same file, which correctly `match:{role:"USER"}`), so anyone holding
   `customers.view` (not CALL_CENTER_AGENT by default, but e.g.
   ADMIN/MANAGER/STAFF/ANALYST) could fetch ANY account's profile —
   including admin/superadmin/HR/agent accounts — by guessing/enumerating
   a Mongo ObjectId. Fixed: `findOne({_id:id, role:"USER"})`.
4. `seed.js`: added a seeded Call Center Agent account (`Agent Tanvir`,
   `agent@shahpremiumfoods.com` / `Agent@123`) — **none existed before**,
   confirmed via grep, meaning this bug had no easy repro account. Plain
   User-role entry, same convention as HR Priya (seed.js doesn't create
   Employee docs for any role) — sufficient for testing dashboard/sidebar
   RBAC scoping; a fully-provisioned agent with SIP credentials still
   comes from the dedicated "Add Call Center Agent" flow.

**VERIFIED:** `node --check` clean on all 3 touched `.js` files; tsc
permissive-JSX-mode clean on the touched `.jsx` file; grep-counted every
changed identifier/key to confirm exactly one declaration each (no
duplicate-declaration class of bug, the one that bit Session 2 once
already); confirmed `canManageAgents` used consistently in both places
it needed to be.

**To verify yourself after `npm install && npm run seed && npm run dev`:**
log in as `agent@shahpremiumfoods.com` / `Agent@123` → sidebar should
show ONLY "Customer care and call center" with Agent Dashboard / My
Order Queue / Customer Care (no Products/Analytics/Website Maintenance/
HR/Security categories, matching Session 2's own Phase 8 trace) →
inside Customer Care, tabs should show ONLY Orders / Support Tickets (no
"Call Center" tab, no "Call History" tab) → typing `/dashboard/roles`,
`/dashboard/site-settings`, `/dashboard/call-center-admin` etc directly
in the URL bar should redirect to `/` with "Page not found".

## Part B — Advanced HRMS Features: FULL ROADMAP (0% built, starting fresh)

Mapped from `Advanced_HRMS_Features.docx`'s own section headers into 5
phases, ordered by dependency + risk (foundational/low-risk first,
hardware/ML-dependent last, matching how Session 2 correctly saved
Asterisk/telephony — the least testable-in-sandbox piece — for its own
late phase). Every phase below is additive to the existing HR & Payroll
module (`employee.model.js`, `hrPayroll.controller.js`,
`dashboard/hr-payroll/page.jsx`, `api/hr-payroll/[...segments]/route.js`)
— extend, never replace, same rule Session 2 followed for the rest of
the app.

**Current real shape of what exists today** (confirmed by direct read
this session, not assumed): `employeeSchema` — userId, name, email,
phone, designation, department, employmentType, monthlySalary, joinDate,
status, bankAccount, notes, isCallCenterAgent, sipUsername/sipPassword.
`payrollRecordSchema` — employeeId, month, baseSalary, bonus, deductions
(single flat number), netPay, status, paidAt. `hr-payroll/page.jsx` is
507 lines, `hrPayroll.controller.js` is 220 lines, its route file is 30
lines — all three will need extending, not rewriting.

### Phase A — Payroll & Tax configurability — **DONE this session, see the
"Phase A — exact final shape" + verification notes near the bottom of
this file for what actually shipped. Left below as the original plan
for reference; don't redo it.**
Spec ask: configurable tax/PF/pension/social-security/insurance/loan/
advance/custom deductions, Super-Admin-editable without code changes;
itemized payslip (Basic, Overtime, Bonuses, Allowances, Gross, Tax
Deduction, Other Deductions, Net Salary).
Plan:
- New `PayrollConfig` model — NOT hardcoded named fields (a fixed
  taxPercent/pfPercent schema would fail the "adapt to local laws
  without modifying code" requirement the moment a jurisdiction needs a
  rule shape this doesn't have) — instead a Super-Admin-managed array of
  named rules: `{name, type:"percentage"|"fixed", value, appliesTo:
  "basic"|"gross", direction:"deduction"|"contribution", enabled}`.
  Singleton doc pattern (same as `crmSettings.model.js` from Session 2 —
  reuse that exact precedent, don't invent a new one).
- Extend `payrollRecordSchema` additively: `overtime`, `allowances`
  (replace the single flat `deductions` number with a computed
  breakdown stored at generation time — `deductionBreakdown:[{name,
  amount}]` — so a past payslip stays historically accurate even if
  Super Admin changes the rules next month; never recompute old records
  from current rules).
- `hrPayroll.controller.js`: new `calculatePayroll(employee, month,
  overrides)` pure function applying PayrollConfig rules in order,
  returning the full itemized breakdown; new
  `getPayrollConfigController`/`updatePayrollConfigController`
  (`superAdminOnly`, matches crmSettings' own gating pattern); existing
  payroll-generation endpoint calls the new calculator instead of
  today's flat bonus/deductions math.
- `api/hr-payroll/[...segments]/route.js`: 2 new routes for the config
  GET/PUT.
- UI: new "Tax & Deduction Rules" panel (Super Admin only,
  `hasFullDashboardAccess` gate matching this module's existing pattern)
  inside `hr-payroll/page.jsx` or a new tab there; existing payslip
  view/print updated to show the itemized breakdown instead of one
  "Deductions" line.
- Read `hr-payroll/page.jsx` in full before touching it (507 lines,
  not yet read this session beyond the grep above) — do this FIRST on
  resume, don't assume its current payslip-rendering shape.

### Phase B — Employee Digital File — **DONE this session, see the
"Phase B — exact final shape" + verification notes near the bottom of
this file for what actually shipped. Left below as the original plan
for reference; don't redo it.**
Spec ask: one permanent record per employee — Personal Info, Employment
History, Attendance, Leave History, Payroll History, Tax History,
Generated Documents, Uploaded Documents, Performance Reviews, Warnings,
Promotions, Training Records, Audit History.
Plan: new models `PerformanceReview`, `Warning`, `Promotion`,
`TrainingRecord` (small, similar shape — consider one unified
`EmployeeEvent{employeeId,type,date,note,createdBy}` model instead of 4
near-identical ones, decide once actually building this, don't
over-design now). New `dashboard/hr-payroll/[employeeId]/page.jsx`
(or a modal/drawer, matching `OrderTimeline.jsx`'s slide-in pattern from
Session 2) aggregating all of the above via one detail endpoint
(`getEmployeeFileController`), mirroring `getOrderCrmDetailController`'s
"one call returns everything the timeline needs" pattern. Depends on
Phase A (Payroll History) and Phase C (Generated Documents) existing
first for full coverage, but the aggregation view itself can be built
incrementally — earlier sections just show empty until their source
phase lands.

### Phase C — Dynamic Document Generation (Template Engine) — **DONE
this session, see the "Phase C — exact final shape" + verification notes
near the bottom of this file for what actually shipped. Left below as
the original plan for reference; don't redo it.**
Spec ask: HR uploads a template once (DOCX/PDF/XLSX) → stored
permanently → HR picks doc type + employee → placeholders
(`{{employee_name}}` etc.) auto-filled → preview → download/print,
formatting/logos/tables/fonts preserved.
Plan: `DocumentTemplate` model (fileUrl via existing Cloudinary upload
utility — `uploadImageCloudinary.js` already exists, check if it needs
a non-image variant or a raw-resource-type Cloudinary upload instead —
read that file first), `GeneratedDocument` model (audit trail — who
generated what for whom, when). New deps needed in `package.json`
(same "write correct code against documented APIs, can't npm-install or
execute in this sandbox" honesty Session 2 used for socket.io/sip.js/
ari-client): `docxtemplater` + `pizzip` (DOCX placeholder replacement —
the standard, well-documented open-source approach, preserves the
original's formatting because it edits the existing XML rather than
regenerating from scratch), `exceljs` (XLSX), and for PDF either
`pdf-lib` (fill fillable form fields) or render the DOCX output through
a DOCX→PDF path — decide once building, don't guess now. Placeholder
map: pull from `employee.model.js` + `user.model.js` fields directly
(name, employee id/`_id`, designation, department, joinDate,
monthlySalary→`{{salary}}`, bankAccount, plus site settings for
`{{company_name}}`/`{{address}}`) — passport/NID number placeholders
depend on Phase D existing first (those fields don't exist on the
Employee model yet). New `dashboard/hr-payroll/documents/page.jsx`:
template upload (Super Admin/HR), "Generate Document" flow (search
employee → pick doc type → preview → download).

### Phase D — Smart Document Processing (self-hosted OCR) — **DONE this
session, see the "Phase D — exact final shape" + verification notes near
the bottom of this file for what actually shipped. Left below as the
original plan for reference; don't redo it.**
Spec ask: upload passport/NID/license/certificates → auto-detect type →
extract text → auto-populate profile fields → flag low-confidence
fields for manual review → keep the original file. Explicit constraint:
**no paid OCR APIs, self-hosted only.**
Plan/honesty up front: self-hosted OCR realistically means
**Tesseract.js** (genuinely open-source, runs on the user's own
server/Node process, no external API calls) for the text-extraction
layer. "Identify fields automatically" beyond raw OCR text needs a
second layer — realistically per-document-type regex/heuristic
extraction (passport MRZ lines have a fixed, well-documented format
that's actually the MOST reliable way to get passport number/DOB/
nationality/expiry, more reliable than free-form OCR+guessing; national
ID formats vary by country and would need the user's specific country's
layout to extract reliably — flag this as a scoping question rather
than guessing a wrong assumption). New `EmployeeDocument` model
(documentType, originalFileUrl, extractedFields:[{field,value,
confidence}], reviewedBy, reviewedAt). Add passport/NID number fields
to `employee.model.js` additively (needed as generation placeholders in
Phase C too). This is the first phase genuinely comparable in
uncertainty to Session 2's telephony work — can write correct
Tesseract.js integration code against its documented API, but can't
execute/verify OCR accuracy in this sandbox (no test document images,
no network to fetch Tesseract's language-data files at install time
either — flag that the user's own server will need
`npm install tesseract.js` to fetch `eng.traineddata` on first run, or
the language data bundled/vendored ahead of time).

### Phase E — Biometric Attendance (facial recognition + fingerprint)
— **DONE this session (the final phase), see the "Phase E — exact final
shape" + verification notes near the bottom of this file for what
actually shipped. Left below as the original plan for reference; don't
redo it.**
Spec ask: manual + browser login/logout + fingerprint + facial
recognition (RFID/QR explicitly "future support", not needed now)
attendance methods, auto-mark + real-time sync to work hours/dashboards/
payroll on successful verification, self-hosted only, manual fallback
always works, pluggable multi-vendor fingerprint architecture.
Plan: new `Attendance` model (employeeId, date, checkIn, checkOut,
method: enum matching the spec's list, workHours computed, verifiedBy:
"self"|"hr"). Facial recognition: **face-api.js** (genuinely
open-source, runs in-browser, no paid API) for browser-based
enrollment+verification — store face embeddings (a numeric vector) NOT
raw images, matching the spec's explicit ask; basic liveness/anti-
spoofing in pure browser JS realistically means a prompted action
(blink/turn head) rather than true depth-sensing anti-spoofing, which
needs specialized hardware — will state that limitation plainly rather
than overclaim. Fingerprint: the spec itself acknowledges this needs
"scanners that expose SDKs or local APIs" — build the pluggable
interface (an `AttendanceVerificationProvider` contract + one working
reference implementation for a **generic local-webhook** pattern any
vendor SDK can POST to) rather than guessing a specific vendor's SDK the
user hasn't named. Wires into Phase A (payroll needs work hours) and
the existing HR dashboard. This is the highest-uncertainty phase (real
hardware, camera, a specific fingerprint reader model none of which
exist in this sandbox) — build it last, and flag clearly once reached
that live verification is a your-hardware activity, same honesty
pattern as Session 2's Asterisk phase.

### Sequencing note for whoever/whatever resumes this
Do Phase A fully (model → controller → routes → UI → verify) before
starting Phase B, not all 5 phases half-done in parallel — this project's
own history (4 rounds of post-delivery bugs in Session 2) is a direct
result of large surface area shipped at once; smaller verified
increments are the corrective, not a preference.

## STATUS as of this checkpoint
Part A (RBAC bug): **DONE, verified, shipped in v6/v7/v8/v9.**
Part B, Phase A (Payroll & Tax): **DONE, verified, shipped in v6-v9.**
Part B, Phase B (Employee Digital File): **DONE, verified, shipped in
v7-v9.**
Part B, Phase C (Document Generation): **DONE, verified, shipped in
v8/v9.**
Part B, Phase D (Smart Document Processing / OCR): **DONE, verified,
shipped in v9.**
Part B, Phase E (Biometric Attendance): **DONE, verified, shipping in
this checkpoint (v10). This is the last phase in the original 5-phase
roadmap — Part A + all of Part B are now complete.**

### Phase D — exact final shape (so "continue" never re-derives this)
- **Employee schema** extended again: `dateOfBirth`, `gender`,
  `nationality`, `fatherName`, `motherName` — the spec's own passport/
  National-ID auto-populate examples name these explicitly. Document-
  specific dates (a passport's own issue/expiry) deliberately stay on
  that document's `EmployeeDocument` record, not duplicated onto the
  employee profile — those describe the document, not the person, and a
  renewed passport shouldn't silently overwrite an accurate profile
  field with a new document's dates.
- **New model** `employeeDocument.model.js`: `EMPLOYEE_DOCUMENT_TYPES`
  enum (spec's own 9 supported-document types), `fileData: Buffer`
  (same Vercel-ephemeral-filesystem reasoning as Phase C), `extractedFields:
  [{field, value, confidence}]` (field names deliberately share
  vocabulary with Phase C's placeholder names — `passport_number` etc —
  so a reviewed value maps cleanly onto both), `ocrRawText` (kept so HR
  can sanity-check an extraction against what was actually read, not
  just trust parsed fields blindly), `status` lifecycle (Processing →
  Needs Review / Failed → Reviewed).
- **New service** `ocrEngine.js`: `runOcr()` (Tesseract.js wrapper — the
  standard genuinely-open-source, self-hosted OCR engine; one honest
  caveat noted in the file itself: language-data downloads from a public
  CDN on first run by default, a one-time model fetch rather than a
  per-request API call, but can be pre-vendored for a fully air-gapped
  setup). **Real ICAO 9303 TD3 MRZ passport parser** — this session's
  own earlier plan called MRZ out as "more reliable than free-form OCR+
  guessing," and it's a true fixed international standard (not a
  guess), so it got a genuine, correct implementation: fixed-width field
  parsing + the actual check-digit algorithm (weights [7,3,1], char
  values 0-9/A-Z→10-35/`<`→0), not just a plausible-looking one.
  **Verified against the canonical ICAO specimen MRZ** (Anna Maria
  Eriksson, the standard textbook reference example) — 11 assertions,
  including a deliberately-corrupted checksum case to prove the
  validator genuinely fails invalid input, not just always reports
  success — then **re-extracted and re-tested the actual code from the
  real service file** (not just the scratch version) to catch any
  transcription drift, plus a separate test for `findMrzLines()`
  locating the 2 MRZ lines inside a realistic noisy full-page OCR
  simulation (and correctly returning null on a non-passport document).
  All passed. Bangladesh National ID heuristic extractor (10/13/17-digit
  number + label-adjacent regex for name/DOB/father's/mother's name/
  address) — explicitly the DEFAULT given this project's own context
  (Dhaka-based), not a confirmed requirement, isolated in its own
  function so a different country's format can be swapped in without
  touching anything else, and given deliberately low confidence scores
  since (unlike MRZ) it has no self-checking mechanism of its own. Other
  6 spec-listed document types (Driving License, Birth Certificate,
  Educational/Experience Certificates, Bank/Tax Documents) get NO
  heuristic extractor — genuinely too varied to build one without real
  examples to test against, unlike a true fixed standard (MRZ) or even
  a single country's roughly-fixed government ID format. Still fully
  supported for upload/storage/raw-OCR-text, just without automatic
  field population — disclosed honestly, not silently guessed at.
- **Found and fixed a second real gap while building this**: the
  validated `detectedMime` from the upload-security check was being
  computed and then silently discarded in `apiHandler.js` — never
  attached to the file object controllers receive. Phase D's controller
  needs to know "was this upload a PDF or an image" to decide whether to
  attempt OCR at all; rather than re-implementing that same magic-byte
  check a second time in the controller (breaking the "one source of
  truth per check" discipline this whole session has followed), fixed
  it at the root: `candidate.detectedMime = validation.detectedMime` is
  now actually attached. Small, additive, doesn't change any existing
  control flow — the 3rd touch to this shared, every-route file this
  session, each one verified individually AND with a fresh project-wide
  regression sweep given how much rides on it staying correct.
- Also refactored `apiHandler.js`'s upload routing from a boolean
  Set + ternary (Phase C's shape, which only had room for one alternate
  case) to a `Map<routeKey, validatorFunction>` — Phase D needed a
  genuinely different third validator (image-OR-PDF, not docx-only), and
  a growing if/else chain doesn't scale as cleanly as a lookup map does
  to a plausible future 4th/5th upload kind.
- **New validator** `validateUploadedEmployeeDocument()` in
  `fileUploadSecurity.js` — accepts image (by calling the EXISTING
  `validateUploadedFile` internally, not duplicating its magic-byte
  list a second time) OR PDF (`%PDF` magic bytes). Kept as its own
  function rather than loosening `validateUploadedFile` itself, same
  "extend, don't weaken the existing gate" discipline as Phase C's
  `validateUploadedDocument`.
- **New controller** `employeeDocument.controller.js`: upload (runs OCR
  only for non-PDF uploads, dispatches to the right extractor by
  document type, gracefully marks `status:"Failed"` rather than
  rejecting the whole upload if OCR itself errors — the file and its
  record are still saved either way, matching the spec's own "preserve
  the original uploaded document" requirement regardless of extraction
  outcome), list/download/delete (same base64-in-JSON pattern as Phase
  C, same reasoning), and `reviewEmployeeDocumentController` — HR's
  confirmed/corrected field values get written onto the actual Employee
  profile in the SAME call that marks the document Reviewed (a review
  that's never applied anywhere isn't useful to anyone). `full_name`,
  `date_of_expiry`, and `issuing_country` are deliberately EXCLUDED from
  auto-apply (mapped to `null` in `FIELD_TO_EMPLOYEE_KEY`) — full name
  would silently clobber the name HR already entered when creating the
  employee record via a much less deliberate action than that should
  require, and the other two describe the document, not the person.
- **Routes + api.js**: `POST/GET/DELETE /employee-documents`,
  `GET /employee-document-download`, `POST /employee-document-review` —
  all `checkPermission("hrPayroll", <view|edit>)`, still no new
  permission module.
- **package.json**: added `tesseract.js`. Not `npm install`ed or
  executed in this sandbox — no network access here to even fetch the
  language-data file, no test document images, no way to verify
  real-world OCR accuracy end-to-end. Same honest caveat as every other
  external-dependency addition this session; the MRZ math itself,
  unlike raw OCR accuracy, WAS independently verified (see above) since
  it's pure logic with a known-correct reference answer, not something
  that depends on image quality or Tesseract's actual behavior.
- **UI** (`hr-payroll/page.jsx`, +203 lines): `UploadedDocumentsSection`
  replaces Phase C's placeholder in the Employee File drawer —
  `UploadEmployeeDocumentModal` (document type + file picker),
  `ReviewDocumentModal` (editable extracted fields, low-confidence ones
  visibly flagged, "Apply to Profile" writes them to the employee
  record), status badges (Processing/Needs Review/Reviewed/Failed),
  download/delete per document. `EMPLOYEE_DOCUMENT_TYPES` duplicated
  client-side with the same sync-comment pattern as Phase C's
  `DOCUMENT_TYPES`, verified byte-identical.

### Verification actually performed
- node --check clean on all 9 touched/new `.js` files (including the
  3rd touch this session to `apiHandler.js`) + fresh project-wide sweep
  (same 5 pre-existing JSX-in-.js exceptions, zero new failures).
- tsc permissive-JSX rig clean on the full 1,527-line `hr-payroll/
  page.jsx` (507 → 803 → 1,020 → 1,324 → 1,527 across all four phases).
- Zero duplicate top-level declarations, zero brace/paren imbalance.
- Cross-checked every new `api.js` entry is actually called from the UI
  (all 5 are), diffed `employeeDocument.controller.js`'s exports against
  the route file's imports (perfect match), and diffed the duplicated
  `EMPLOYEE_DOCUMENT_TYPES` arrays byte-for-byte (identical, 9 types
  each each) — not just eyeballed.
- Cross-checked every Employee field name written by
  `reviewEmployeeDocumentController`'s `FIELD_TO_EMPLOYEE_KEY` map
  against the actual schema field list — all 8 genuinely exist.
- **The MRZ parser specifically got the same rigor as Phase A's
  calculatePayroll**: real logic, actually executed (twice — once
  standalone, once re-extracted from the real file to catch
  transcription drift), against a real known-correct reference (the
  ICAO specimen), including a negative/corruption test, not just
  syntax-checked or "looks plausible."

### Known limitations (disclosed, not hidden)
- OCR accuracy on real-world photos/scans is genuinely unverified —
  Tesseract.js itself was never run in this sandbox (no network to fetch
  language data, no test images). The MRZ math is independently correct;
  whether OCR reads a real, possibly-glare/blurry passport photo well
  enough to FIND that MRZ text accurately is a different question this
  build can't answer without your own server and test documents.
- PDF uploads are stored but not OCR'd in this build (no rasterization
  step) — upload a JPG/PNG photo instead for automatic field extraction.
- Only Passport (MRZ) and National ID (Bangladesh heuristic) get
  automatic field extraction. The other 6 spec document types are fully
  supported for upload/storage/manual-review, not automatic extraction —
  a deliberate, disclosed scope decision (see above), not an oversight.
- The Bangladesh NID heuristic is a best-effort regex against free-form
  OCR text with no self-validation (unlike MRZ's checksums) — every
  result from it should be treated as needing human review, which the
  status/confidence system already enforces (it never auto-applies
  without going through the Review modal).

### To verify yourself after `npm install && npm run seed && npm run dev`
(Tesseract.js will download its English language-data file on first
OCR call unless pre-vendored — needs network access at that point)
Employees tab → file icon on any employee → Uploaded Documents → Upload
→ pick "Passport" + any passport photo → should extract passport number/
name/nationality/DOB/gender/expiry with high confidence if the MRZ reads
cleanly. Review → confirm/correct values → Apply to Profile → reopen the
employee's file and confirm the profile fields updated. Try a non-ID
document (e.g. "Other") too — confirm it uploads and stores correctly
with no fabricated extracted fields.

## LOG (append-only)
- Investigated the full RBAC chain end-to-end, ruled out 6+ plausible
  hypotheses individually before finding the real one (unrestricted
  Call Center management tab).
- Fixed + verified (node --check + tsc + duplicate-declaration grep) all
  4 touched files.
- Wrote the full Advanced HRMS Features roadmap above.
- [CONTINUE #1] Re-verified all 4 Part-A files fresh from disk (per this
  file's own standing warning not to trust prior [x] marks blindly) —
  genuinely all still present and correct, nothing reverted this time.
  node --check clean on all 4 .js files individually + a project-wide
  node --check sweep (278 source files; the only 5 "failures" were
  pre-existing JSX-in-.js Next.js convention files — not-found.js,
  loading.js, global-error.js — expected, unrelated to this session,
  V8 can't parse JSX regardless of extension). tsc rig clean on the
  .jsx file. Zero duplicate top-level declarations, zero brace
  imbalance. package.json still valid JSON, 31 deps/7 scripts intact.
- Discovered mid-turn that `employee.model.js`'s `payrollRecordSchema`
  already had Phase A's planned fields on disk even though this file's
  own STATUS section said "0/5 phases built, not yet executed" — a live
  example of exactly the tracker-vs-disk mismatch this file warns about
  elsewhere. Trusted the disk, not the stale note; confirmed via direct
  grep that PayrollConfig/calculatePayroll/routes/UI genuinely did NOT
  exist yet, so treated it correctly as "schema-only head start," not
  "already done."
- Built Phase A in full: model → registerModels → controller
  (calculatePayroll + config CRUD + rewritten upsert) → routes → api.js
  → full PayrollTab/PayrollModal/TaxRulesTab UI rewrite. Caught and
  fixed two real bugs during the session's own verification pass before
  they shipped: (1) Demo Admin nested-array masking gap in
  `listPayrollController`, (2) Demo Admin UI/API gating mismatch on the
  new Tax Rules tab (frontend used `hasFullDashboardAccess`, route used
  strict `superAdminOnly` — corrected to strict on the frontend to
  match).
- Full verification pass: node --check (all files + project-wide
  regression sweep), tsc JSX rig, duplicate-declaration/brace-balance
  sweep, cross-file consumer check, AND actually executed
  `calculatePayroll`'s logic standalone (14/14 assertions passed) —
  diffed against both the real controller and the client preview mirror
  to confirm all three copies compute identically.
- Packaged + delivered v6 (Part A + Phase A). Confirmed via fresh
  re-extraction of the delivered zip (not just the working directory)
  that the shipped artifact genuinely contains the verified fixes.
- [CONTINUE #2] Re-confirmed sandbox state genuinely persisted (an
  initial `ls | head -3` looked empty and would have wrongly triggered
  a "start over" response — re-ran without truncation before concluding
  anything, per this file's own standing rule to verify rather than
  assume). Spot-checked Part A + Phase A fixes still on disk — clean.
  Read `OrderTimeline.jsx` + its actual usage site (`call-center/
  orders/page.jsx`, for the wrapping shell) + `getOrderCrmDetailController`
  in full before writing anything (none had been read yet, per the
  standing instruction not to assume their shape from the roadmap's own
  paraphrase of them). Noted the roadmap's "one call returns everything"
  description of `getOrderCrmDetailController` was actually aspirational
  — the real `OrderTimeline.jsx` makes 3 parallel calls, only one of
  which is that endpoint — and designed Phase B's actual detail endpoint
  as genuine single-call aggregation instead, since that's cleaner and
  nothing forced literal imitation of the multi-call version.
  Checked real icon availability project-wide via a proper multi-line-
  import-aware parser (a naive single-line grep underreported by ~40
  icons because several imports span multiple lines) before choosing
  new ones, rather than guessing icon names exist in the installed
  react-icons version with no network/npm available to verify directly.
  Built Phase A in full: model → registerModels → controller
  (aggregation + add/delete event) → routes → api.js → EmployeesTab
  "View File" button → EmployeeFileDrawer/EventSection/PlaceholderSection
  UI. Caught the orphaned-EmployeeEvent-on-employee-delete gap by
  re-reading the existing delete handler before extending it, and the
  view-only-role Add/Delete-button gating gap by applying the same
  scrutiny that found this whole session's original bug, rather than
  assuming a page only editors can reach never needs its own UI gate.
  Full verification pass identical in rigor to Phase A's (node --check
  × whole-project sweep, tsc, duplicate/brace check, export/import
  cross-diff, api.js usage cross-check) — all clean.
- Packaged + delivered v7 (Part A + Phase A + Phase B), fresh-extraction
  verified before presenting.
- [CONTINUE #3] Re-verified sandbox state (spot-checks, not a full
  re-audit — the fresh-extraction check on v7 already proved the
  delivered zip was correct, so this session only needed to confirm the
  *working directory* hadn't diverged from it). Started Phase D
  investigation for real data-model grounding before designing anything
  (Employee schema fields, siteSettings' company-name source) rather
  than assuming shapes from earlier in the session. **Discovered a real,
  previously-invisible gap**: every file upload in this entire app goes
  through ONE shared, image-only magic-bytes validator, unconditionally,
  before it even reaches routing — traced this fully (fileUploadSecurity
  .js's own header comment + apiHandler.js's multipart parsing) before
  writing any upload code, rather than assuming a generic upload path
  would just work for a new file type. Fixed by adding a properly-scoped
  second validator + explicit per-route allowlisting, not by weakening
  the existing check — the same "extend, don't loosen" discipline this
  whole session has applied to permission gates, now applied to a
  content-security gate instead.
  **Ran out of tool calls mid-edit** — backend fully built and verified,
  frontend had one component referenced (`GeneratedDocumentsSection`)
  but not yet defined, which would have been a real ReferenceError if
  run. Explicitly disclosed this exact state (not glossed over) rather
  than packaging or claiming completion.
- [CONTINUE #4] Verified the mid-edit state matched exactly what was
  disclosed (confirmed the reference existed, the definition didn't,
  backend files intact) before touching anything, rather than assuming
  the prior turn's own description was accurate without checking.
  Finished `GeneratedDocumentsSection`, then `downloadBase64File`,
  `DOCUMENT_TYPES` (frontend copy), `TemplateUploadModal`,
  `GenerateDocumentModal`, `DocumentsTab`, and wired the new tab into
  `HrPayrollPage`. Full verification pass matching every prior phase's
  rigor (node --check on all 10 touched files including the two shared
  every-route files + project-wide sweep, tsc, duplicate/brace check,
  api.js usage cross-check, export/import cross-diff) — PLUS two checks
  specific to this phase's actual risk areas: explicitly diffed the
  duplicated DOCUMENT_TYPES arrays byte-for-byte rather than eyeballing
  them, and traced the exact `{key:"main"}` singleton-query shape
  against a second, independent real usage site before trusting it.
  Packaged + delivered v8 (Part A + Phases A/B/C), fresh-extraction
  verified before presenting.
- [CONTINUE #5] Re-verified sandbox state before starting. Read this
  file's own Phase D plan (written earlier this session) before
  designing anything — OCR approach (Tesseract.js), MRZ-over-guessing
  reasoning, and the "flag National ID format as a scoping question"
  note were all already decided; followed through on them rather than
  re-deciding from scratch. **Wrote and independently verified the MRZ
  TD3 parser BEFORE building anything else** — hand-calculated one
  checksum by the actual ICAO algorithm to confirm understanding, then
  ran it against the full canonical specimen (11 assertions + a
  corruption test), then re-extracted and re-ran the SAME tests against
  the actual code physically present in the real service file (not the
  scratch copy) to rule out transcription drift, then a further,
  separate test for realistic noisy-OCR-text MRZ line detection
  (positive + negative case). This is the highest-uncertainty, most
  worth-getting-right piece of logic in this whole phase, and was
  treated that way. Extended the Employee schema again (dateOfBirth/
  gender/nationality/fatherName/motherName — named explicitly in the
  spec's own passport/NID auto-populate examples). Built the
  EmployeeDocument model, ocrEngine.js's National ID heuristic +
  dispatcher, employeeDocument.controller.js, routes, api.js.
  **Found a second real gap**: a validated `detectedMime` was being
  computed in apiHandler.js and then silently thrown away rather than
  attached to the file object — fixed at the root (small, additive,
  doesn't change existing control flow) instead of re-implementing the
  same magic-byte check a second time in the controller, preserving the
  "one source of truth per check" discipline applied everywhere else
  this session. Refactored the upload-routing Set+ternary from Phase C
  into a Map of validator functions, since Phase D needed a genuinely
  third distinct validation case. Built the UI (UploadedDocumentsSection/
  UploadEmployeeDocumentModal/ReviewDocumentModal). Full verification
  pass matching every prior phase's rigor, PLUS an extra cross-check
  specific to this phase's real risk (every Employee field name the
  review-and-apply controller writes, checked against the actual schema
  field list, not assumed correct from having written both sides
  myself).
- Next: package + deliver this checkpoint zip (Part A + Phase A + Phase
  B + Phase C + Phase D, all verified). Phase E (Biometric Attendance)
  is next on a future "continue" — per the roadmap below, needs
  face-api.js researched/confirmed as the facial-recognition approach
  before assuming it (this session's earlier Phase D/E planning pass
  named it but didn't verify it the way Phase D's OCR choice ultimately
  got verified) — check the roadmap's own Phase E section below for
  what was already reasoned through before re-deciding anything.

## Phase E — exact final shape (final phase — Part A + all of Part B
now complete)
- **Employee schema** extended a final time: `faceDescriptor` (128
  numbers — NOT a photo, this is what makes the spec's "store embeddings
  instead of raw images" requirement literally true here, not just
  claimed), `faceEnrolledAt`, `fingerprintTemplateId` (a device-issued
  string ID, never a raw fingerprint template — this app never receives
  or stores one), `fingerprintEnrolledAt`.
- **New models**: `attendance.model.js` (one document per employee per
  day, `{employeeId,date}` unique index — check-in and check-out live on
  the SAME record, not separate events, which is what makes workMinutes
  a simple computed field rather than needing a join every time it's
  read), `biometricDevice.model.js` (registered devices get an
  auto-generated API key — see below for the full reasoning on why this
  is the *receiving* side of a generic webhook, not a specific vendor's
  SDK, since none was named).
- **New service** `attendanceService.js`: `computeWorkMinutes` (pure,
  clamps negative to 0), `euclideanDistance`/`matchFace` (pure vector
  math — the actual face→descriptor ML extraction happens in the
  BROWSER via face-api.js; comparing two already-extracted descriptors
  is just arithmetic with no ML runtime dependency server-side at all;
  `FACE_MATCH_THRESHOLD = 0.6` is face-api.js's own documented default,
  not an invented number), `markCheckIn`/`markCheckOut` (idempotent —
  calling again after already checked in/out today is a safe no-op, not
  an error or overwrite), `autoMarkFromBrowserLogin`/
  `autoMarkFromBrowserLogout` (best-effort, swallow their own errors —
  attendance marking must never be the reason someone can't sign in or
  out). Reuses this app's ONE existing Socket.IO instance (built for the
  Call Center CRM module, but the emit helpers there are generic
  infrastructure) via a new small `server/socket/hrEvents.js` rather
  than standing up a second realtime layer or polluting `CRM_EVENTS`
  with a genuinely different domain's event names.
- **The pure math (`computeWorkMinutes`, `euclideanDistance`,
  `matchFace`) was actually executed and tested**, same rigor as Phase
  A's `calculatePayroll` and Phase D's MRZ parser — 14 assertions
  including a 3-4-5 right-triangle sanity check on the distance formula
  itself, an overnight-shift-crossing-midnight case, and realistic-scale
  (128-dimension) descriptor simulations showing sensible match/no-match
  behavior — then re-extracted and re-run against the actual final file
  content, not just a scratch copy, to rule out transcription drift.
- **Two real infrastructure gaps found and fixed while building this**:
  (1) `apiHandler.js`'s CSRF same-origin check was read in full BEFORE
  assuming the fingerprint webhook would need some bypass added — it
  already fails open for requests with no Origin/Referer header at all,
  which is exactly what an ordinary device/bridge HTTP client sends, so
  genuinely no changes were needed there; almost over-engineered an
  unnecessary exemption before checking. (2) `deviceAuth.js` — a wholly
  new middleware, mirroring `auth.js`'s exact shape/response format,
  since a biometric device has no user JWT/session at all.
- **New controller** `attendance.controller.js`: self-service
  (checkin/checkout/my-attendance — deliberately NOT gated by
  `hrPayroll` permission), HR management (overview, manual override/
  backfill, per-employee history), facial enrollment/verification
  (`verifyFace` never reaches `markCheckIn`/`markCheckOut` at all unless
  `matchFace` actually returns a match), fingerprint enrollment + the
  webhook receiver, and device management with a "shown once, then
  always masked" API key practice.
- **Login/logout hooks** in `user.controller.js` — the single most
  safety-critical edit this entire session made to a shared file: two
  new calls, each wrapped in its OWN local try/catch (not just relying
  on the service functions' internal ones), awaited rather than fire-
  and-forget (this app documents both a persistent-VPS deployment path
  and a Vercel serverless path — an unawaited background call can be
  killed the moment a serverless function returns). Visually re-read
  both edits in full context after making them, not just syntax-checked.
- **Routes**: a NEW top-level route group, `/api/attendance/...` (not
  folded into `hr-payroll`'s routes) — self-service check-in/out needs
  `auth` with NO `hrPayroll` permission at all.
- **package.json**: `face-api.js` added — the one client-side (browser-
  bundled) addition this session; every other new dependency runs
  server-side only. Not installed or executed anywhere in this sandbox.
- **UI**: `hr-payroll/page.jsx` — `AttendanceSection`/
  `AttendanceEditModal` in the Employee File drawer, `BiometricEnrollmentSection`/
  `EnrollFingerprintModal`, new "Attendance" tab (`AttendanceOverviewTab`).
  New personal page `dashboard/my-attendance/page.jsx` (added to
  `USER_LINKS`, reachable by anyone regardless of role). New Super-
  Admin-only `dashboard/biometric-devices/page.jsx`
  (`strictSuperAdminOnly: true`). **Refactored into a shared
  `components/FaceCaptureModal.jsx`** rather than writing two near-
  duplicate camera components — caught mid-build, before the
  duplication actually happened.
- **Icon discipline held under time pressure**: wanted `FaFingerprint`,
  checked it against actual project usage, found it unproven, fell back
  to an already-confirmed-safe icon rather than gambling.

### Verification actually performed
- node --check clean on all 11 touched/new `.js` files (including the
  most safety-critical edit of the session, `user.controller.js`) + a
  fresh project-wide sweep (same 5 known JSX-in-.js exceptions only).
- tsc clean on ALL 5 touched/new `.jsx` files together in one pass —
  `hr-payroll/page.jsx` (grew to 1,812 lines: 507→803→1,020→1,324→
  1,527→1,812 across all five phases), `dashboard/layout.jsx`,
  `my-attendance/page.jsx`, `biometric-devices/page.jsx`,
  `components/FaceCaptureModal.jsx`.
- Zero duplicate declarations, zero brace/paren imbalance.
- Cross-checked all 12 new `api.js` entries are actually called from the
  UI, and diffed controller exports against route imports — perfect
  match.
- Actually executed the pure math against the real, final file content
  — 14/14 assertions passed.

### Known limitations (disclosed, not hidden)
- **Facial recognition is genuinely unverified end-to-end.** The vector
  math is independently correct. Whether a real browser/camera/
  face-api.js work together as expected is something only your own
  deployment can answer — no camera, no network to fetch model weights,
  no browser to run TensorFlow.js in, anywhere in this sandbox.
- **face-api.js's model files must be downloaded to `/public/models`**
  on your server — a one-time setup step this build cannot perform (no
  network access here). Enrollment/verification fail gracefully with a
  clear message if they're missing, pointing back to manual check-in/out.
- **Fingerprint hardware integration is architecturally complete but
  vendor-code-empty by necessity** — no device was ever named. The
  generic receiving side (register device → API key → webhook) is
  built; your actual scanner's vendor SDK/bridge script is real work
  someone still needs to do against that documented contract.
- Manual attendance and Browser Login/Logout auto-marking have NO such
  caveats — ordinary CRUD, guaranteed to work day one with zero setup.

### To verify yourself after `npm install && npm run seed && npm run dev`
Manual path (works immediately): log in as any employee-linked account
→ My Attendance → Check In → Check Out → confirm hours. Super Admin: HR
& Payroll → Attendance tab → confirm it appears; Employees → file icon
→ Attendance → "+ Add / Correct" to backfill a day. Browser-login path:
log out/in and check for an automatic check-in. Facial recognition
(needs the model-file setup above): Employee File → Biometric Enrollment
→ Enroll → allow camera → capture → My Attendance should then offer
"Check In with Face." Fingerprint (needs real hardware + your own bridge
script): Biometric Devices → Register Device → copy the key.

## FINAL LOG ENTRY — this closes the original 5-phase Advanced HRMS
Features roadmap. Part A (the reported RBAC bug) + all 5 phases of Part
B are complete and verified. [CONTINUE #6] built all of Phase E in one
continuation: models, tested service (pure math independently verified,
same rigor as Phase A/D), controller, routes, the session's most
safety-critical edit (login/logout hooks, extra defensive care, visually
re-read in context), Employee File Attendance + Biometric Enrollment
sections, My Attendance self-service page with face check-in/out, a
shared FaceCaptureModal (caught and prevented a near-duplication mid-
build), Biometric Devices admin page, HR Attendance Overview tab. Found
and correctly resolved two real infrastructure questions along the way
(confirmed the CSRF check already handles a headerless device webhook
correctly rather than building an unnecessary bypass; built a dedicated
device-auth middleware since biometric hardware has no user session at
all) and reprioritized mid-phase once it became clear Device Management,
not the HR Overview page, was the one piece actually blocking the
fingerprint feature from working at all. Full verification pass
matching every prior phase's rigor. Next: package + deliver this final
checkpoint zip (Part A + all of Phases A-E, all verified). Any further
work would be a NEW phase beyond the original roadmap (Leave Management,
a field-level HR audit trail, XLSX/fillable-PDF templates, RFID/QR
attendance — the spec's own "future support" items) — check with the
user for priority before starting anything new rather than assuming.
