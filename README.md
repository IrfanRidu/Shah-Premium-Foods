# Shah Premium Foods

A full-scale grocery e-commerce platform — a single Next.js 14 project (App
Router). The storefront pages and the API both live in the same app as
plain Next.js API routes; there's no separate backend process, custom
server, or extra port to run.

**📋 See [STATUS.md](./STATUS.md) for the full changelog and bug-fix
history** — it's also written to be read first by whoever (or whichever AI
session) picks this project up next; just say "continue."

**🚀 Deploying this to Vercel?** See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)
for a full walkthrough. **Setting it up locally?** See [SETUP.md](./SETUP.md).

---

## 🗂 Project Structure

```
shah-premium-foods/
├── package.json           ← single package.json for everything
├── next.config.mjs
├── tailwind.config.js
├── .env.example            ← copy to .env.local and fill in your own values
├── public/                 ← static assets
└── src/
    ├── app/                 ← every page + every API route (App Router)
    │   ├── api/              ← backend: one route.js per resource, e.g. api/product/
    │   ├── dashboard/         ← admin panel + customer account pages
    │   └── (storefront pages: /, /cart, /checkout, /product/[product], ...)
    ├── server/              ← backend logic used by the API routes
    │   ├── controllers/
    │   ├── models/            ← Mongoose schemas
    │   ├── middlewares/       ← auth, permissions, file upload
    │   └── utils/
    ├── components/          ← shared React components
    ├── store/               ← Redux Toolkit slices
    ├── lib/                  ← axios instance, API endpoint map, shared helpers
    └── providers/            ← app-wide context (boot-time data fetching)
```

How requests flow: every page and every `/api/...` route is handled by the
same Next.js server — in production that means Vercel's serverless
functions, one per API route, spun up on demand. There's no persistent
process to keep alive and nothing that needs a fixed port.

Admin pages and the live order feed refresh themselves every so often (a
short polling interval) rather than over a persistent WebSocket connection
— that trade-off is what makes the whole thing deployable as ordinary
serverless functions instead of needing a process that stays running.

---

## 🚀 Getting Started (local development)

### 1. Install
```bash
npm install
```

### 2. Configure environment
Copy `.env.example` to `.env.local` and fill in your own values — see
[SETUP.md](./SETUP.md) for exactly where to get each one (all free tiers).

### 3. Seed demo data (recommended for first run)
```bash
npm run seed
```
Populates categories, sub-categories, ~100 products, historical orders,
campaigns, coupons, and one demo account per role. The script prints every
demo login to the console when it finishes — look for the SUPERADMIN line
to access the full admin panel. **Change or remove these accounts before
using this anywhere real** — the passwords are in the source code
(`src/server/seed/seed.js`), so they're not a secret.

### 4. Run it
```bash
npm run dev      # development — http://localhost:3000
npm run build    # production build
npm start        # production server
```

---

## ✨ Features

- **Summer editorial UI** — Playfair Display headings, sage-green palette, 4 switchable themes
- **Multi-currency, everywhere** — admin sets a site-wide base currency (site settings) that drives the whole storefront and every admin report/analytics figure by default; any individual shopper can pick a different currency for their own view only, without affecting the site default or the admin panel
- **Campaigns** — admin names each promo section and picks its icon (bolt, gift, fire, tag, star, percent), scheduled with a start/end countdown; an uploaded image can be used as a full banner instead of the default color/icon look
- **Coupon system** — percentage/fixed discounts, optional scoping to specific products (search-and-select picker), a per-customer usage cap and a separate overall usage cap, min order amount, validity windows
- **Delivery Zones** — different delivery charges per city/area, with optional free-delivery thresholds, resolved server-side at checkout
- **Smart recommendations** — activity-tracked "You May Also Like" + dynamic search suggestions as you type
- **Performance-driven homepage** — Trending / Best-Selling / Clearance / New Arrivals / All-Time-Best, with Campaigns interleaved between them
- **Inventory management** — stock ledger, low-stock alerts, auto-restock on cancellation, and a **barcode scan mode** (works with any USB/Bluetooth scanner) to look up, adjust stock, or quick-sell a product by its SKU
- **Barcode-driven order ops** — every order gets a Code128 barcode; print a full invoice or a small shipping-label sticker straight from the admin orders list, or scan a packed box's barcode to pull the order back up
- **Product Requests** — customers can type out or photograph their regular shopping list and send it straight to the store; admin reviews it as a queue and can download/print it as a PDF
- **Financial analytics with real charts** — revenue/profit are recognized only once an order is **Delivered** (proper revenue-recognition practice), with delivery charges on **Returned** orders booked as a pure loss; visualized with area/pie/bar charts (Recharts), date-range filtering, COGS, AOV, and more
- **Guests can browse everything** — the full storefront (products, categories, search) is open without an account; logging in is only required to actually place an order
- **Full RBAC** — Super Admin can create custom staff roles with per-module permissions
- **Customer CRM** — searchable/sortable customer database, CSV export, one-click call
- **Auth, image upload (Cloudinary), Stripe + COD payments, live search, mega-menu** — all the e-commerce essentials

---

## 📄 Key Pages

| Route | Page |
|---|---|
| `/` | Home — banner, categories, campaigns, performance rows |
| `/product/[product]` | Product detail — Buy Now, campaign badge, suggestions |
| `/cart` | Cart — coupon entry, currency-aware totals |
| `/checkout` | Checkout — address, delivery charge, payment |
| `/dashboard/myorders` | Customer: order history, cancel, invoice download |
| `/dashboard/submit-list` | Customer: submit a shopping list (text or photo) |
| `/dashboard/campaigns` | Admin: Campaigns (CRUD, custom name/icon, countdown config) |
| `/dashboard/coupons` | Admin: Coupons (product scoping, usage limits) |
| `/dashboard/delivery-zones` | Admin: Delivery Zones (per-area charges) |
| `/dashboard/inventory` | Admin: Inventory (stock ledger + barcode scan mode) |
| `/dashboard/product-requests` | Admin: incoming customer shopping lists, PDF export |
| `/dashboard/admin-orders` | Admin: live order feed, invoice/label printing, call customer |
| `/dashboard/analytics` | Admin: financial dashboard with charts |
| `/dashboard/site-settings` | Admin: site customization, base currency |
| `/dashboard/roles` | Super Admin only: custom roles & permissions |

---

## 🔧 Notes

- Demo accounts (printed by `npm run seed`) cover every role: SUPERADMIN, ADMIN, MODERATOR, EMPLOYEE, ANALYST, USER.
- Barcode scanning works with real USB/Bluetooth scanners out of the box — they're keyboard-emulation devices, so the scan input just needs focus.
- Admin-facing financial figures (analytics, orders list, inventory) follow the site's base currency (Site Settings), independent of any individual shopper's own currency choice.
