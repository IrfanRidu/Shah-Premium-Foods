# Shah Premium Foods — Quick Setup Guide

*This guide is for running the project **locally**. Deploying it to
production? See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) instead.*

## What was fixed
All 15 Mongoose model files were patched with the Next.js-safe caching pattern:
```js
// Before (caused OverwriteModelError on every API request):
const UserModel = mongoose.model("user", userSchema);

// After (fixed — checks if model is already registered):
const UserModel = mongoose.models.user || mongoose.model("user", userSchema);
```
This fixes 100% of the 500 errors shown in the logs.

## Setup Steps

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
**This project already includes a working `.env.local`** with real MongoDB,
Cloudinary, and Resend credentials filled in — Next.js loads this
automatically, so if it's present you can often skip straight to step 3.

If you're setting up fresh (or `.env.local` got lost/excluded somewhere
along the way — e.g. some zip/archive tools hide files that start with a
dot, and `.env.local` is also commonly listed in `.gitignore`, so it won't
come along if you push this project to GitHub and deploy from there):
```bash
cp .env.example .env
```
Edit `.env` and fill in:
- `MONGODB_URI` — your MongoDB Atlas connection string (required)
- `JWT_SECRET_ACCESS` / `JWT_SECRET_REFRESH` — **required, cannot be left blank.**
  These just need to be two different long, random, secret strings — not
  anything you need to remember or look up anywhere. Generate them with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
  Run that command twice (once per secret) and paste each result in directly, e.g.:
  ```
  JWT_SECRET_ACCESS=434e63e24b8477cc597a28d12067f1189880d73b28b850a88db011f6e9725f5708194c4ca08a318744a44b9ad3d7f3d7
  JWT_SECRET_REFRESH=febc68b27d9aad4f105ea87196bf44d29b76572062dc5d7b2f601936f9e96a02cdd927bb6265fbec49fea2c84b10ac78
  ```
  (Use freshly-generated ones, not those exact values — anyone who read this
  file could otherwise forge a valid login.)
- `CLOUDINARY_*` — for image uploads (required for product/avatar images)
- `RESEND_API_KEY` — for email OTPs (optional in dev, registration works without it)
- `STRIPE_*` — only needed for online card payments (optional)

**After editing any `.env`/`.env.local` file, you must restart the server**
(`Ctrl+C` then `npm run dev` again) — Next.js only reads these files at
startup, so changes never take effect on a server that's already running.

### 3. Seed the database (optional but recommended)
```bash
npm run seed
```
This creates 5 categories, 20 subcategories, 100 sample products, campaigns, coupons, delivery zones, and a superadmin account:
- **Email:** `admin@shahpremiumfoods.com`
- **Password:** `Admin@123`

### 4. Run the development server
```bash
npm run dev
```
Open http://localhost:3000

## Troubleshooting

**Login fails with a 500 error / "secretOrPrivateKey must have a value"**
`JWT_SECRET_ACCESS` (or `JWT_SECRET_REFRESH`) isn't set in whatever
environment file the server is actually reading. As of this version the
server now says so directly instead of showing that raw error — but if
you're on an older copy or still seeing it:
1. Confirm a `.env.local` or `.env` file exists in the project root (same
   folder as `package.json`) and actually contains non-empty
   `JWT_SECRET_ACCESS=` / `JWT_SECRET_REFRESH=` lines (see step 2 above for
   how to generate values).
2. Restart the server after any change — see the note above.
3. If deploying to a host (Vercel, Railway, Render, etc.) rather than
   running locally: `.env`/`.env.local` files are typically **not**
   deployed (they're excluded from git by design, since they hold
   secrets). You need to add each variable through that platform's own
   Environment Variables dashboard instead.

**Any other 500 error mentioning a specific env var name**
Same fix — that variable is missing from whichever env file the running
server actually has access to. Add it and restart.

## Architecture
- **Frontend + API:** Single Next.js app (App Router)
- **Database:** MongoDB via Mongoose
- **State:** Redux Toolkit
- **Auth:** JWT (access + refresh tokens)
- **Images:** Cloudinary
- **Email:** Resend
- **Payments:** Stripe (optional)

## Key Routes
| Path | Description |
|------|-------------|
| `/` | Storefront homepage |
| `/category` | All categories |
| `/product/[slug]` | Product detail |
| `/cart` | Shopping cart |
| `/checkout` | Checkout |
| `/dashboard/profile` | User profile |
| `/dashboard/analytics` | Admin analytics |
| `/dashboard/product` | Manage products |
| `/dashboard/site-settings` | Site customisation |
