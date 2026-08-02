# Shah Premium Foods — Production Readiness Report

**Batch 20 · Generated August 2, 2026**

This report covers the work done in this pass only. For the full project
history (19 prior batches covering RBAC, 2FA, audit logs, rate limiting,
CSRF, structured logging, monitoring, performance, and SEO), see
`STATUS.md`, which this report doesn't repeat.

**How to read the scores below**: this sandbox has no network access, so
nothing here was verified with a live `npm install`, a real `next build`,
a running dev server, or an actual Lighthouse/browser audit — the same
constraint every batch before this one has had. Scores are static-analysis
and code-review based, cross-checked against real, current vulnerability
data via web search where noted. They're an honest, best-effort estimate,
not a substitute for actually running these tools in a real environment
before shipping. Anywhere a number looks precise, treat the *reasoning
behind it* as the real deliverable, not the number itself.

---

## 1. Security score: B+ (was likely B before this batch)

**What's genuinely strong** (from this batch's own verification, not just
taking prior batches' word for it): RBAC + permission-based route
protection wired into every dashboard route (confirmed: `permission.js`
imported by 20+ route handlers); NoSQL-injection/XSS/mass-assignment
sanitization centralized in `apiHandler.js`, applied uniformly rather than
per-route; `server-only` guards on every high-leverage shared module,
confirmed on all 6 (not just the ones that happened to have a duplicate
import bug); zero server secrets reachable from any client component
(checked every single `"use client"` file, not a sample); a genuine,
deliberate, documented mass-assignment defense in the HR employee
whitelist (`EMPLOYEE_EDITABLE_FIELDS`) that specifically excludes
`userId`/`isCallCenterAgent` to prevent privilege escalation.

**What this batch found and fixed**: a real stale-whitelist bug
(`deliveryZone` create endpoint silently ignoring an admin's "inactive"
choice — a functional bug, not itself a security hole, but the same bug
class as the mass-assignment issues elsewhere in this codebase's history);
an information-disclosure gap in email sending with no production guard
(sensitive content like password-reset links could log to server output
while reporting fake success); a CVSS 8.7 unauthenticated DoS sitting
unused-but-present via `multer` (removed entirely, not just patched).

**What holds this back from A-range**: running Next.js 14.2.35, which is
EOL and permanently unpatched against the May 2026 coordinated security
release (13 advisories). This app's own architecture means the specific
"middleware auth bypass" mechanism in those advisories doesn't directly
apply (verified: this app's middleware never gates access, all real
authorization happens server-side per-request in `apiHandler.js`) — but
running an unpatched framework version is a real, forward-looking risk
regardless, and `@sentry/nextjs` is two majors behind. Neither was
upgraded blindly in this pass (see §6) because both are breaking-change
migrations this sandbox cannot test — treat this as the honest reason the
score isn't higher, not a gap that got silently ignored.

## 2. Performance score: B+ / A- (uneven — strong where it's been touched, one real gap)

Batch 16's RSC conversion, caching, and image optimization work is real
and holds up on inspection: the 3 highest-traffic PDP/category pages
(`product/[product]`, `category/[slug]`, `[category]/[subCategory]`) are
genuine Server Components with server-side data fetching. Batch 18's
`serializeDoc()` fix for the RSC prop-serialization bug was itself
verified against 10 test cases including a real `JSON.stringify`
round-trip, not just claimed.

**The one significant gap**: the homepage (`app/page.jsx`) — the single
highest-traffic, most SEO-relevant page on the site — is entirely
client-rendered, with each product row (trending/bestselling/new-arrivals)
independently fetching its own data client-side after mount. That means
the initial HTML has no product content; a visitor (or crawler) sees
loading skeletons before real content appears. This was a deliberate
non-fix in this pass (see §9 Next.js Best Practices below for the specific
reasoning), not an oversight — but it's real, and it's the best-value
remaining move on the performance side of this codebase.

## 3. Lighthouse estimation (estimate — not a live run)

| Category | Estimate | Basis |
|---|---|---|
| Performance | ~75-85 (homepage) / ~90+ (PDP/category pages) | Homepage: client-side waterfall fetching, no streaming SSR content. RSC pages: server-rendered content, next/image optimization already in place per next.config.mjs. |
| Accessibility | ~90+ | No accessibility-specific audit was run this pass; based on semantic markup observed in spot-checked components. Not independently verified — recommend a real axe-core or Lighthouse a11y pass before trusting this number. |
| Best Practices | ~90 | Held back specifically by the EOL Next.js version and (until this pass) the unused vulnerable multer dependency — the latter is now fixed. |
| SEO | ~95+ | Batch 16's SEO section (structured data, meta tags, sitemap) plus middleware.js's X-Robots-Tag handling — the homepage's client-side rendering is the main thing keeping this below 100, since crawlers that don't execute JS see an empty shell. |

## 4. OWASP Top 10 (2021) checklist

| # | Category | Status | Note |
|---|---|---|---|
| A01 | Broken Access Control | GREEN | RBAC + permission checks on every admin route, confirmed this pass (not assumed) |
| A02 | Cryptographic Failures | GREEN | bcryptjs (cost 12), JWT properly signed/verified; confirmed no hardcoded secrets anywhere in src/ this pass |
| A03 | Injection | GREEN | Centralized sanitization in apiHandler.js; mongoose synced to a version confirmed clear of the $where-operator injection CVE |
| A04 | Insecure Design | YELLOW | Mostly strong (documented threat-modeling decisions throughout STATUS.md), but the homepage's fully-client data flow is a design gap, not just a perf one |
| A05 | Security Misconfiguration | GREEN | CSP with nonces, security headers in middleware.js/next.config.mjs; Dependabot config added this pass |
| A06 | Vulnerable/Outdated Components | YELLOW | Fixed the concrete ones found this pass (multer removed, mongoose confirmed safe); Next.js EOL and Sentry-2-majors-behind remain open, documented, not silently ignored |
| A07 | Identification & Auth Failures | GREEN | 2FA, RBAC, audit logs per prior batches |
| A08 | Software & Data Integrity Failures | GREEN | Deliberate mass-assignment whitelists (e.g. EMPLOYEE_EDITABLE_FIELDS) with documented reasoning, not just presence of *a* whitelist |
| A09 | Security Logging & Monitoring | GREEN | Winston + Sentry + audit logs (Batches 17/12), fixed a real gap in this pass (sendEmail production logging) |
| A10 | Server-Side Request Forgery | GREEN | No user-controlled URL fetching identified in this pass's review |

GREEN = addressed and spot-verified this pass or a prior one · YELLOW = partially addressed, specific gap documented above, not hidden

## 5. Files modified this batch

- `src/store/siteSettingsSlice.js` — the theme/language persistence bug fix
- `src/providers/GlobalProvider.jsx` — matching restore-logic fix
- `src/components/PreferenceSelector.jsx` — corrected a misleading comment
- `src/server/config/sendEmail.js` — production logging/fake-success guard
- `src/lib/logger.js`, `src/lib/cache.js`, `src/lib/apiHandler.js`, `src/lib/apiObservability.js` — removed duplicated server-only imports
- `src/server/controllers/deliveryZone.controller.js` — fixed the confirmed stale-whitelist bug (isActive on create)
- `package.json` — 19 package versions synced to match tested lockfile state; multer removed

## 6. Files added this batch

- `.github/dependabot.yml`
- `PRODUCTION_READINESS_REPORT.md` (this file)
- (Batch 20's own entry inside STATUS.md, following the project's existing convention rather than a separate change log)

## 7. Files removed this batch

- `src/server/middlewares/multer.js` — confirmed dead code, pulled in a CVSS 8.7 unauthenticated-DoS-vulnerable package for zero actual functionality
- `src/server/middlewares/admin.js` — confirmed dead code, pre-RBAC Express-era leftover fully superseded by permission.js

## 8. New packages installed

**None added.** One removed (multer — see above; removing an unused,
vulnerable dependency was judged safer and more complete than upgrading a
live one that turned out not to be live at all).

## 9. Next.js best practices (Section 16) — status

Verified rather than redone (Batch 19 already did substantial real work
here). Confirmed this pass: server-only on all 6 highest-leverage shared
modules; zero server-secret leakage into any client component (checked
exhaustively, not sampled); middleware.js correctly scoped to
header-injection only, no auth logic misplaced there. **Not done, and
deliberately not attempted blind**: converting the homepage to a Server
Component. It's a meaningfully more complex conversion than the 3 pages
already done (multiple independent product-row fetches, a carousel, a
campaign section), and this sandbox's inability to actually run next dev
means a mistake here — like the real ObjectId-serialization bug Batch 18
only caught by actually running the app — could easily go undetected until
it broke the storefront in production. The concrete recommendation: follow
the exact same pattern already proven correct in server/data/product.js /
category.js / subcategory.js (fetch server-side, run through
serializeDoc(), keep only the genuinely interactive pieces — like the
carousel and "load more" behavior — as small client components) and test
with a real npm run dev before trusting it, the same way Batch 18 did.

## 10. Commands to run (in order)

```
# 1. Install - MUST be `npm install`, not `npm ci`. package-lock.json
#    predates 7 dependencies (@sentry/nextjs, winston, @vercel/otel,
#    morgan, server-only, winston-daily-rotate-file, @next/bundle-analyzer)
#    that were added to package.json across later batches without ever
#    having network access to regenerate the lockfile. `npm ci` requires
#    an exact match and will fail; `npm install` reconciles it correctly.
npm install

# 2. Lint
npm run lint

# 3. Build (this is the first real, live check this project has had of
#    everything in this batch - treat any build error as higher-priority
#    than anything in this report, since static analysis can't catch
#    everything a real compiler does)
npm run build

# 4. Local smoke test
npm run dev
# - manually verify: pick a non-default theme AND language, hard-refresh
#   the page, confirm both persist (this is the bug this batch fixed -
#   the one thing most worth actually clicking through before trusting
#   the fix)
# - check the browser console for the ObjectId-serialization warning
#   class Batch 18 fixed, in case any newer page hits the same pattern
# - submit a test file upload and confirm it still works now that
#   middlewares/multer.js is gone (it shouldn't have been in the path at
#   all, but this is the one change this pass made that's worth a manual
#   click-through rather than trusting static analysis alone)

# 5. (Optional but recommended, not run this pass - no network here)
npm audit
npx next@latest info   # confirms environment before any future major-version upgrade attempt
```

## 11. Deployment steps (Vercel)

1. Push this project to a Git repository (GitHub/GitLab/Bitbucket).
2. In Vercel: New Project -> import the repository. Framework preset
   should auto-detect as Next.js.
3. Set environment variables (see .env.example for the full list) -
   at minimum: MongoDB connection string, RESEND_API_KEY (production
   email sending - see section 5's fix: without this set, production will now
   correctly *fail loudly* instead of silently doing nothing), Stripe
   keys, Cloudinary credentials, JWT_SECRET/refresh-token secret,
   Sentry DSN if monitoring is wanted.
4. Confirm the Node.js version in Vercel project settings is at least
   18 (this project's engines field) - and note that if/when the
   Next.js 15/16 upgrade recommended in section 1 happens, Next.js 16 raises the
   minimum to Node 20+.
5. Deploy. Vercel will run npm install (not npm ci) by default for a
   project without a perfectly-synced lockfile, which is what's needed
   here per section 10 - no special configuration needed for that specifically,
   but don't override the install command to force npm ci.
6. After the first deploy, run through the manual smoke-test list in section 10
   step 4 against the real production URL, not just locally.
7. If Dependabot is enabled on the repository (GitHub), the new
   .github/dependabot.yml in this batch will start opening PRs on the
   next scheduled run (Mondays) - review the first batch of PRs manually
   before assuming the grouping/ignore rules are tuned exactly right for
   this team's workflow.

## 12. Recommended next steps, in priority order

1. Actually run `npm install && npm run build && npm run dev` and work
   through the manual checklist in section 10 - everything in this report is
   static analysis; this is the first real-world check any of it gets.
2. Plan the Next.js 14 -> 15/16 migration deliberately (not urgently
   blind) - budget real testing time, use the official codemod
   (`npx @next/codemod@latest upgrade latest`) as a starting point, not a
   finish line.
3. Convert the homepage to a Server Component, following the pattern in
   section 9, with real npm run dev verification before trusting it.
4. Plan the @sentry/nextjs 8->10 migration using Sentry's own migration
   guides, same "budget real testing" reasoning as #2.
