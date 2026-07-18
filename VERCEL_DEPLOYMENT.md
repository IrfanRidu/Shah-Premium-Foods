# Deploying to Vercel

This app is a standard Next.js 14 project (App Router, API routes, MongoDB via
Mongoose) with no custom server — that's exactly the shape Vercel is built
for, so there's no special build configuration needed. This guide walks
through everything else: getting your data layer ready, getting the code
into a place Vercel can pull from, and the environment variables it needs.

## What you'll need before you start

- A **GitHub** (or GitLab/Bitbucket) account — Vercel deploys from a git
  repo, not by uploading a zip.
- A **Vercel** account (free tier is fine to start) — https://vercel.com/signup
- A **MongoDB Atlas** cluster — free M0 tier is enough to start:
  https://www.mongodb.com/cloud/atlas/register
- A **Cloudinary** account (image uploads — products, avatars, banners,
  payment logos): https://cloudinary.com/users/register/free
- A **Resend** account (transactional email — OTP codes, password reset):
  https://resend.com/signup
- Optional: a **Stripe** account if you want online card payments, not just
  cash-on-delivery.

Every one of these has a free tier that's enough to get a real deployment
running end to end.

## 1. Get the code into a git repository

Vercel needs this in a git repo it can pull from (GitHub is the easiest
path). From the project folder:

```bash
git init
git add .
git commit -m "Initial commit"
```

Then create a new empty repository on GitHub (no README/license — you
already have files) and push:

```bash
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

The `.gitignore` in this project already excludes `node_modules`, `.next`,
and — importantly — `.env.local`, so none of your real secrets end up in
the repo. Only `.env.example` (placeholders, no real values) is tracked.

## 2. Set up MongoDB Atlas for Vercel specifically

One thing that trips people up: **Vercel's serverless functions don't call
your database from a fixed IP address.** In Atlas, under
**Network Access**, you need to either:
- Add `0.0.0.0/0` (allow access from anywhere) — simplest, and the
  standard approach for serverless deployments, or
- Use Atlas's Vercel integration (Atlas → Integrations → Vercel) if you'd
  rather not open access that broadly.

Without this, every database call from your deployed app will fail — the
app's connection code already retries a few times with backoff (to ride out
Atlas's free-tier cluster "waking up" from being paused), but it can't work
around a firewall blocking it entirely.

Grab your connection string from Atlas → **Connect** → **Drivers**, and
you'll paste it in as `MONGODB_URI` in step 4.

## 3. Import the project into Vercel

From the Vercel dashboard: **Add New → Project**, then import the GitHub
repo you pushed in step 1. Vercel auto-detects Next.js — you shouldn't need
to change the build command (`next build`), output directory, or install
command. Don't click Deploy yet — add the environment variables first (next
step), since the first build will fail without `MONGODB_URI` and the JWT
secrets at minimum.

## 4. Environment variables

In the Vercel project → **Settings → Environment Variables**, add each of
these (see `.env.example` in the project root for what each one is for and
where to get it):

| Variable | Required? |
|---|---|
| `MONGODB_URI` | **Required** |
| `JWT_SECRET_ACCESS` | **Required** — any long random string |
| `JWT_SECRET_REFRESH` | **Required** — a *different* long random string |
| `ACCESS_TOKEN_EXPIRE` | Optional (defaults work) |
| `REFRESH_TOKEN_EXPIRE` | Optional (defaults work) |
| `CLOUDINARY_CLOUD_NAME` | **Required** for image uploads |
| `CLOUDINARY_API_KEY` | **Required** for image uploads |
| `CLOUDINARY_API_SECRET_KEY` | **Required** for image uploads |
| `RESEND_API_KEY` | **Required** for OTP/password-reset emails |
| `RESEND_FROM_EMAIL` | **Required** alongside it |
| `STRIPE_SECRET_KEY` | Optional — only for online card payments |
| `STRIPE_WEBHOOK_SECRET` | Optional — see step 6 below, this one you'll add *after* first deploy |
| `NEXT_PUBLIC_SITE_URL` | **Required** — see note below |
| `NEXT_PUBLIC_API_URL` | Leave empty (same-origin) |
| `NEXT_PUBLIC_CURRENCY_LOCALE` | Optional (defaults to `en-BD`) |
| `NODE_ENV` | Don't set this — Vercel sets it to `production` automatically |

Generate the two JWT secrets locally with:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Run it twice — access and refresh secrets must be different from each other.

**About `NEXT_PUBLIC_SITE_URL`:** this needs your real deployed URL (used to
build absolute links in `/sitemap.xml` — search engines reject relative
URLs there). You likely won't know your exact `*.vercel.app` URL until
after the first deploy. That's fine — deploy once with your best guess (or
leave it, the sitemap falls back to a placeholder), then come back and set
it precisely, which brings us to:

## 5. Deploy, then two follow-up steps

Click **Deploy**. Once it's live:

**a) Fix `NEXT_PUBLIC_SITE_URL` if needed.** Copy your actual Vercel URL (or
custom domain, if you attach one under Settings → Domains), update the env
var, and redeploy (Vercel → Deployments → ⋯ → Redeploy) so the build picks
up the new value — `NEXT_PUBLIC_*` vars are baked in at build time, so a
plain restart isn't enough, it needs a rebuild.

**b) Set up the Stripe webhook (only if you're using Stripe).** Stripe
needs to know where to send payment confirmation events, and that URL only
exists after you have a live domain:
- Stripe Dashboard → **Developers → Webhooks → Add endpoint**
- Endpoint URL: `https://<your-domain>/api/order/webhook`
- Event to send: `checkout.session.completed`
- Copy the **Signing secret** it gives you and add it as `STRIPE_WEBHOOK_SECRET`
  in Vercel, then redeploy.

Without this, Stripe payments will still redirect customers correctly, but
the app won't get notified when a payment actually succeeds.

## 6. Populate the database (optional but recommended for a first look)

The project includes a seed script that creates a full set of demo
accounts and sample data — useful for logging in as an admin on day one
instead of registering and manually promoting an account.

Run it **locally**, pointed at your **production** database — set
`MONGODB_URI` in your local `.env.local` to the same Atlas connection
string you gave Vercel, then:

```bash
npm run seed
```

This prints a list of demo accounts when it finishes. **Change these
passwords (or delete these accounts) before treating the deployment as
real** — they're hardcoded in `src/server/seed/seed.js`, which is source
code anyone with this codebase can read, so they're not a secret.

If you'd rather start from a genuinely empty store: skip this step, use
the app's normal **Register** flow, and promote that account to
`SUPERADMIN` directly in Atlas (Collections → `users` → edit the `role`
field), then manage everything else from the admin dashboard from there.

## Troubleshooting

- **Build fails immediately, before touching the database** — almost
  always a missing required env var (`MONGODB_URI`, `JWT_SECRET_ACCESS`,
  or `JWT_SECRET_REFRESH`). Check Settings → Environment Variables against
  the table in step 4.
- **Site loads but shows no products/categories, for anyone** — check
  Atlas Network Access (step 2) first; this is the #1 cause. Vercel's
  function logs (Project → Deployments → click a deployment → Functions)
  will show a MongoDB connection error if this is it.
- **Uploaded images don't appear** — double check all three Cloudinary
  variables are set and match your Cloudinary dashboard exactly.
- **OTP/reset emails don't arrive** — Resend's free/sandbox tier only
  sends to the email address you signed up with until you verify a
  sending domain. This is expected on a fresh account, not a bug — the
  OTP screen has a "log in now, verify later" option for exactly this
  situation while you're testing.
- **Stripe payments complete but orders don't update** — the webhook
  secret is missing or wrong, or the webhook endpoint URL doesn't match
  your actual domain. Re-check step 5b.
