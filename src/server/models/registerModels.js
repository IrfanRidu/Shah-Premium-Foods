// Central model registry — imported once from src/lib/mongodb.js.
//
// WHY THIS FILE EXISTS (root cause of the Vercel "Schema hasn't been
// registered for model 'X'" crash):
//
// Vercel builds each src/app/api/**/route.js into its OWN, isolated
// serverless function with its OWN module graph. A Mongoose model is only
// registered — i.e. `mongoose.model("address", addressSchema)` actually
// runs — if some file that specific function imports (directly or
// transitively) happens to import that model file. `connectDb()` on its
// own only opens a DB connection; it does not register any schema.
//
// This project's controllers call `.populate("delivery_address")`,
// `.populate("address_details")`, etc. Those `ref: "address"` targets live
// on order.model.js / user.model.js, not on address.model.js itself — so
// importing OrderModel/UserModel does NOT register AddressModel. Any route
// whose controller queries `.populate(...)` on a ref without that ref's
// own model file being imported somewhere in the same bundle throws
// exactly this error at request time in production, even though it can
// look fine in local dev (a long-running dev server tends to have already
// loaded every model from earlier requests, which papers over the gap).
//
// Rather than hunting down every current populate() call's imports one at
// a time (fragile — the same crash comes back the moment anyone adds a new
// populate() without also remembering to add a matching import), every
// model is imported here, once, for its registration side effect. This
// file is then imported at the top of connectDb() (src/lib/mongodb.js),
// which every single API route already calls before its controller runs
// (see src/lib/apiHandler.js). That guarantees all models are registered
// for every request, regardless of which route/controller is executing —
// permanently closing this entire bug class, including for populate()
// calls not yet written.
//
// Each import below is side-effect-only (registers the schema via each
// model file's own `mongoose.models.x || mongoose.model("x", schema)`
// guard, which is also what makes this safe to import many times over
// across hot reloads in dev). Individual controllers still import the
// specific models they use directly, too — that's unchanged and is good
// practice for readability — this file is a second, unconditional layer
// underneath that, not a replacement for it.

import "./activityLog.model.js";
import "./address.model.js";
import "./analyticsSettings.model.js";
import "./callLog.model.js";
import "./campaign.model.js";
import "./cartProduct.model.js";
import "./category.model.js";
import "./coupon.model.js";
import "./deliveryZone.model.js";
import "./employee.model.js";
import "./inventoryLog.model.js";
import "./notification.model.js";
import "./order.model.js";
import "./product.model.js";
import "./productRequest.model.js";
import "./role.model.js";
import "./siteSettings.model.js";
import "./subcategory.model.js";
import "./supportTicket.model.js";
import "./user.model.js";
