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

### Phase 2 — CRM data layer (models) — [ ] NOT STARTED
- [ ] models/agentStatus.model.js, assignment.model.js,
      callRecording.model.js, callback.model.js, queueEntry.model.js,
      crmChangeLog.model.js
- [ ] Extend callLog.model.js / notification.model.js / order.model.js
      (additive only, see design decisions)
- [ ] Add every new model to registerModels.js
- [ ] tsc-check all, verify on disk

### Phase 3 — Services — [ ] assignmentService, crmChangeLogService,
notificationService (targetUserId wrapper), queueService,
callStatsService
### Phase 4 — Socket.IO — [ ] server.js, socketServer.js, events.js,
useSocket.js hook, package.json deps+scripts
### Phase 5 — Core API routes — [ ] controllers/*, callcenter
[...segments]/route.js, tighten agent CRUD to superAdminOnly
### Phase 6 — Click-to-call+WhatsApp — [ ] phoneUtils, ClickToCallButton,
WhatsAppButton, wire into admin-orders/admin-users/customer-care pages
### Phase 7 — WebRTC/SIP client — [ ] sipClient.js, useSipClient,
Softphone, IncomingCallModal, AgentStatusToggle
### Phase 8 — Asterisk config + ARI service — [ ] config templates,
ariClient.js, telephony README (honest: cannot live-test from sandbox)
### Phase 9 — Agent dashboard baseline — [ ] stats cards + recent calls
### Phase 10 — DEFERRED — Super Admin CRM console (live monitor, queue/
routing settings, hold-music, reports+charts, undo viewer UI), full
Order Visibility tabs+timeline, abandoned-order reassignment cron,
final full-project re-check + zip

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
