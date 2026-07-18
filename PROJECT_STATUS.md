# Shah Premium Foods — Build Status & Roadmap

> ## ⚠️ This file is archived / historical — see [STATUS.md](./STATUS.md) instead
> Everything below describes an **earlier phase of this project that has
> since been replaced**: a custom `server.js` (Express + Helmet + Socket.io
> wrapping Next.js). That architecture is gone. The current app is a plain
> Next.js 14 project (App Router) with no custom server — every page and
> every API route is a normal Next.js route, which is also what makes it
> deployable to Vercel as ordinary serverless functions (see
> [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)). Real-time-ish features
> (the admin live order feed, notifications, site-settings propagation) now
> use short polling intervals instead of Socket.io.
>
> **[STATUS.md](./STATUS.md) is the current, actively-maintained changelog** —
> read that first. This file is kept only for historical context on how the
> project got here; nothing below reflects the current codebase.

---

This is a multi-phase build. Each phase is delivered as a complete, runnable zip.
**To continue building, just say "continue" and the next phase will pick up exactly where this left off.**

---

## 🩹 PHASE 2.3 — HOTFIX (this delivery) — the actual root cause

### 🐛 The real bug behind "nothing on the page is interactive"

The previous hotfix (a real but minor `key`-spread warning on the homepage) didn't resolve it, which was the right signal to keep digging rather than assume it was fixed. The actual cause: **`server.js` mounts Helmet with its default Content-Security-Policy active.** Helmet's default CSP sets `script-src 'self'` — which does **not** include `'unsafe-eval'`. Next.js's **development mode** wraps every module in `eval()` (that's how Fast Refresh and accurate dev stack traces work). With that CSP in place, the browser silently *refuses to execute* every one of those eval-wrapped chunks.

That single misconfiguration explains every symptom at once:
- The page still renders — HTML/CSS aren't affected by a script-src violation — so it *looks* fine
- Nothing is interactive anywhere on any page — React never runs, so no click handler, no form `onSubmit`, no password-toggle button ever attaches
- A `<form>` with a blocked `onSubmit` falls back to the browser's native default: submit via GET to the current URL with every field appended as a query string — exactly the `GET /register?name=...&password=...` behavior reported
- No error overlay, no toast, nothing — Next.js's dev error overlay is itself a React component; if React can't execute, it can't show its own error either
- It's invisible from the Node terminal — a CSP violation is logged only in the *browser's* console, never the server's, which is exactly why server-side logs looked clean throughout

**Fixed:** Helmet's CSP is now disabled specifically in development (`contentSecurityPolicy: dev ? false : undefined`), where Next.js genuinely needs `eval()` to function. Production builds don't use `eval()`, so Helmet's full secure defaults — CSP included — are kept there, with no change in production security posture.

If you pulled this zip on top of an existing project folder: stop the dev server, delete `.next/` (stale dev-mode cache can hold old bundles), and run `npm run dev` again, then hard-refresh the browser tab.

---

## 🩹 PHASE 2.2 — HOTFIX (this delivery)

### 🐛 Bug Fixed: nothing on the page was interactive (forms submitted as a native page reload, password toggle did nothing)

The terminal log was the key clue: `GET /register?name=...&password=123456...` — a **native browser form submission** (the browser's own default GET-with-query-string behavior), not a JavaScript-driven POST. Combined with every page navigation re-fetching the entire `webpack.js`/`main-app.js`/`layout.js` bundle from scratch instead of Next.js's normal lightweight client-side routing, this pointed to React never successfully taking over (hydrating) the page — leaving every click behaving like plain HTML with no JavaScript at all.

**Root cause, found via the dev-mode warning in the same log:**
```
Warning: A props object containing a "key" prop is being spread into JSX:
  <ProductRow {...props} />
```
The homepage's row data (`{ key: "trending", title: ..., ... }`) was both given an explicit `key={block.row.key}` *and* spread onto the same element via `{...block.row}` — and since that spread object itself carried a field literally named `key`, React's newer JSX transform flags this as invalid (key must arrive as its own dedicated argument, never smuggled in through a spread). **Fixed** by renaming that data field to `id` and explicitly destructuring it out of the spread (`const { id, ...rowProps } = block.row`) before rendering, so the spread object can never carry a `key` field again. Swept the rest of the codebase for the same pattern — every other `key={x.something}` + `{...x}` combination was checked and confirmed not to carry a literal `key` field, so this was the only real instance.

**If the problem persists after this update:** a custom Next.js server restarted via `nodemon` (which is what `npm run dev` does here) kills and restarts the *entire* Node process on every `server/` file change — unlike Next.js's own Fast Refresh, this drops the browser's existing dev-mode connection to the old process. An already-open browser tab can be left holding a stale reference. **Hard-refresh the page (Ctrl+Shift+R) or open a fresh tab after any server restart** before concluding something is still broken. If it's still not interactive after a true hard refresh, open the browser's DevTools Console (F12 → Console) and check for a red error message — that's the one piece of diagnostic information that never appears in the terminal, only in the browser itself, and would confirm definitively whether anything else is amiss client-side.

---

## 🩹 PHASE 2.1 — HOTFIX (this delivery)

### 🐛 Bugs Fixed

- **"Failed to load next.config.js" / `ReferenceError: module is not defined in ES module scope"`** → The unified `package.json` declares `"type": "module"` (needed for the `import`/`export` syntax throughout `server/`), but `next.config.js`, `tailwind.config.js`, and `postcss.config.js` were still written in old-style CommonJS (`module.exports = ...`). Once `"type": "module"` is set, *every* `.js` file in the project is parsed as an ES module unless told otherwise. **Fixed:** `next.config.js` → renamed to `next.config.mjs` with `export default` (Next.js's documented path for ESM projects); `tailwind.config.js` and `postcss.config.js` converted to `export default {...}`. Verified by actually importing all three as real ES modules, not just a syntax check.

- **"Users can't log in or register"** → Three compounding bugs, all fixed:
  1. **Email case-sensitivity** — `UserModel.findOne({ email })` was a case-sensitive exact match everywhere (login, register's duplicate check, forgot-password, OTP verification, reset-password), but the schema lowercases email *on save* only, not on query. A user registering as `John@Gmail.com` gets stored as `john@gmail.com`; logging back in with `John@Gmail.com` would never match. **Fixed:** every email lookup now normalizes with `.trim().toLowerCase()` before querying, consistently across the whole auth flow.
  2. **Email verification was structurally broken** — the backend treated the verification `code` as the user's MongoDB `_id` (a link-based design: `/verify-email?code=<id>`), but the frontend's actual UI collects a typed 6-digit OTP and the app has no `/verify-email` route at all — so verification could never succeed for any new registration, regardless of email deliverability. **Fixed:** registration now generates and stores a real 6-digit OTP (with a 1-hour expiry) on the user document, emails *that code*, and `verify-email` validates `{email, otp}` against it — matching what the UI actually collects. Added a "Resend code" button (with cooldown) and a "log in now, verify later" link on the OTP screen, since login never required verification to begin with — so a slow/failed email never has to be a dead end.
  3. **Shared demo credentials** — `.env` shipped with real-looking (but shared-across-every-deployment) MongoDB/Cloudinary/Resend credentials left over from earlier phases. Many unrelated deployments pointed at the *same* free-tier database simultaneously is a real, silent failure mode (connection limits, write conflicts, a key getting rotated/revoked out from under you) that looks exactly like "nothing works, no clear error." **Fixed:** `.env`/`.env.example` now ship with obviously-fake placeholders (`<username>:<password>@<cluster-url>`) that fail loudly and immediately instead of half-working on a shared resource, plus a step-by-step "where to get your own free credentials" table in the README, plus a startup check in `connectDb.js` that prints an unmissable warning if it ever detects the old shared host string.

- **"Can't see hidden passwords"** → The custom eye-icon toggle on Login/Register/Reset-password had no `z-index`, so on browsers/extensions that render their own native password-reveal control in the same corner of the field, the native one could sit on top and silently swallow clicks meant for ours. **Fixed:** extracted a `.password-toggle-btn` class with an explicit `z-index`, `pointer-events: auto`, and `tabIndex={-1}` (so it doesn't disrupt tab order) applied consistently across all three pages; also added CSS to suppress Edge/IE's native reveal-icon (`::-ms-reveal`) outright so there's never a second control competing for the same spot.

---

## ✅ PHASE 2 — COMPLETE (this delivery)

### 🏗️ Structural rebuild: single Next.js project
The biggest change in this phase: the separate `backend/` (Express) and `frontend/` (Next.js) folders have been merged into **one project folder**, run with **one `npm install`** and **one `npm run dev`**, on **one port**. A custom `server.js` creates a single HTTP server that:
- Hands `/api/**` requests to Express (using the exact same controllers/models the standalone backend used — no business logic was rewritten, just relocated)
- Hands everything else to Next.js's request handler
- Attaches Socket.io to that same server for real-time order updates

The frontend's API calls now default to same-origin (relative `/api/...` paths) instead of pointing at a separate `localhost:8080` — this also incidentally eliminates any CORS configuration burden going forward.

### 🐛 Bugs Fixed
- **Coupon input text rendering under the tag icon** → Root cause was actually systemic, not isolated to the coupon box: every custom CSS class in `globals.css` (`.input-field`, `.btn-primary`, etc.) was declared as a plain rule *after* `@tailwind utilities;`, so it won the cascade over utility classes like `pl-9`/`pr-10` used for icon spacing — on **any** input combining the two, not just the coupon field. (The password show/hide icon on Login/Register/Reset-password had the exact same bug, just less noticeable.) Fixed by moving all custom component classes into `@layer components`, which Tailwind always places before `@layer utilities` in the compiled stylesheet — the correct, idiomatic fix, not a one-off patch.

### 🎉 New Features

**Delivery Charges by Area**
- Admin defines named delivery zones (e.g. "Inside Dhaka", "Outside Dhaka"), each matched to a list of cities, with its own charge and an optional free-delivery threshold
- Resolved **server-side** at order placement from the address's city — never trusted from the client
- Stripe checkout gets a line item for the delivery charge too, so the customer is charged correctly either payment method

**Revenue Recognized on Delivery (CA-audit-correct)**
- Revenue and profit are now calculated **only from orders marked Delivered**, attributed to the date delivery was confirmed (not the order date) — standard revenue-recognition practice
- Orders that come back as a **Return** have their delivery charge booked as a pure loss (shipping was paid, the sale didn't stick) — shown as its own line item in Analytics
- COGS still uses real per-order cost-price snapshots where available

**Auto-Refreshing Orders**
- Placing a Cash-on-Delivery order refreshes "My Orders" *before* the redirect to the success page even completes
- The success page (which also covers the Stripe-redirect-back path) re-fetches orders and cart on mount
- "My Orders" itself always pulls fresh data on open, regardless of navigation path — no more manual refresh needed to see a just-placed order

**Campaigns** (renamed from "Flash Sales")
- Admin now names every promo section and picks a sign/icon (bolt, gift, fire, tag, star, percent) — leaving both blank falls back to the original "Flash Sale" ⚡ look, so nothing breaks for anyone who liked the default
- **Never back-to-back on the homepage** — campaigns are interleaved between the performance-based product rows, with the gap shrinking (down to a 1-row minimum) as more campaigns are running simultaneously, and growing when fewer are active
- The admin builder already supported searching-while-typing to add products — confirmed and carried over

**Dynamic Search Suggestions**
- Polished the existing live-search dropdown: shows price, highlights the matched substring as you type, and now feeds the recommendation engine (search activity is logged) — all on a snappier 250ms debounce

**Product Requests (Customer Shopping Lists)**
- Customers can type out their list or take/upload a photo of it (handwritten or printed), tag it as one-time/daily/weekly/monthly, and send it straight to the store from `/dashboard/submit-list`
- Admin reviews everything as a queue at `/dashboard/product-requests`, can change status (Pending → Processing → Fulfilled/Rejected), call the customer directly, and **download/print any request as a PDF** — typed lists render as text, photographed lists get embedded as a full-page image — so the format the customer used never matters to the admin

**Admin Panel Currency Is No Longer Hardcoded**
- Every admin-facing money figure (Orders, Inventory, Customers, Analytics, Products) now follows the admin's own currency selection from the same header dropdown shoppers use — previously these were locked to BDT
- The one deliberate exception: the customer CSV export stays in BDT, since exported accounting records benefit from a consistent base currency regardless of whatever the admin happened to have selected on screen at export time (documented in-code)

**Analytics Dashboard — Now Graphical**
- Replaced the old hand-rolled CSS bar chart with real charts (Recharts): an area chart for the revenue trend, a pie chart for orders-by-status, and a horizontal bar chart for top products by revenue
- Added Delivery Charges Collected, Delivery Loss (Returns), Returned Orders, and Orders Placed as their own metric cards

**Add to Cart — Hover Style**
- Hovering the button now flips to a solid black background with neon-green text, on every product card and the product detail page (one shared CSS class, so it's consistent everywhere)

**Invoices, Order IDs & Barcodes**
- Every order can be opened as a full invoice (customer/delivery details, line items, discounts, delivery charge, total) or a compact shipping-label view — both carry a real Code128 barcode of the order ID
- "Print" opens a print-ready window sized for either view; "Download PDF" generates the same as a PDF file
- Customers can view/download their own invoice from My Orders; admins get the same plus the shipping-label view, for sticking on the box at packing time

**Barcode-Integrated Inventory & Order Lookup**
- New "Scan" mode in Inventory: a focused input that works with any real USB/Bluetooth barcode scanner out of the box (they're just keyboard-emulation devices — no special hardware integration code needed) or manual typing
- Scanning a product's SKU shows its full details with one-click "Adjust Stock" or "Quick Sale (-1)" (logs a real inventory movement)
- Scanning an order's barcode (e.g. off a packed box label) instead pulls up that order's details — one input handles both cases automatically

### 🌱 Seed data updates
The seed script now creates two named campaigns ("Weekend Mega Sale" with the bolt icon, "Eid Special Offers" with the gift icon) instead of one generic flash sale, demonstrating the rename and the homepage stagger logic out of the box.

---

## 🔜 PHASE 3 — Next up when you say "continue"

**Employee / HR / Payroll / Biometric Attendance module** — deliberately deferred in full, because it's genuinely a separate application bolted onto an e-commerce admin panel, not a quick add-on. Planned scope:
- Full employee profiles: name, age, gender, nationality, joining/resignation dates, salary structure (monthly + hourly + overtime rate), bank details for salary transfer, leave balance, documents
- Attendance: clock-in/out with timestamps, daily hours worked computed automatically, overtime detection
- **Biometric fingerprint confirmation** — realistically, this means a WebAuthn-based "confirm with your device's fingerprint sensor" flow for browser/laptop/phone use, *plus* a documented webhook-style endpoint a dedicated USB/standalone fingerprint reader's vendor SDK can call to mark attendance — true cross-vendor fingerprint hardware integration depends on the specific reader model's SDK, which we'll account for once a target device is known
- Daily salary accrual based on actual hours + overtime, running totals per employee
- Salary PDF generation: a bank-letterhead salary-transfer application listing every current employee who hasn't been paid for the month and hasn't resigned/been terminated — ready to print or download and hand to the bank
- "Mark as paid" workflow once the bank application is submitted, moving records into a **Paid Salary Archive** for permanent record-keeping

Other smaller items still on the backlog:
- Bulk product actions (bulk publish/unpublish, bulk price update, CSV product import)
- Audit log of admin actions (who changed what, when) for the Super Admin
- Wishlist, product reviews & ratings, abandoned-cart recovery emails

---

## How to Run

```bash
npm install
# fill in .env with your own Mongo URI / Cloudinary / Resend / Stripe keys
npm run seed     # optional but recommended — see console for demo logins
npm run dev      # http://localhost:3000 — frontend + API + sockets, one process
```
