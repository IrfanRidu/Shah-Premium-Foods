// Shared coupon math — product-scoping, eligible subtotal, per-user usage,
// and discount calculation. Used by BOTH:
//   - coupon.controller.js  validateCouponController (the live "Apply" button
//     preview on the Cart page)
//   - order.controller.js   resolveCoupon (the authoritative check that runs
//     again at real order-placement time)
// Keeping this logic in one place means those two can never compute a
// different discount for the same coupon + cart — a bug in one is a bug in
// both, a fix here fixes both.

// `items` — any list of { productId, price, quantity }. `productId` may be a
// populated object ({_id, ...}) or a plain id/string. `price` should already
// be the per-unit charged price (after product-level discount, before the
// coupon). The order-placement path passes DB-authoritative items; the live
// preview passes client cart data — safe, since it only affects what's
// *shown* to the shopper, never what's actually charged (order placement
// always re-resolves independently from the database).
const idStr = (v) => (v && typeof v === "object" ? v._id || v : v)?.toString?.() || "";

export function getEligibleItems(coupon, items = []) {
  const restrict = Array.isArray(coupon.applicableProducts) && coupon.applicableProducts.length > 0;
  if (!restrict) return items; // no restriction set on the coupon = every product qualifies
  const allowed = new Set(coupon.applicableProducts.map(idStr));
  return items.filter((i) => allowed.has(idStr(i.productId)));
}

export function getEligibleSubtotal(coupon, items = []) {
  const eligible = getEligibleItems(coupon, items);
  const sum = eligible.reduce((acc, i) => acc + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);
  return Math.round(sum * 100) / 100;
}

// How many times this particular user has already used the coupon.
export function getUserUsageCount(coupon, userId) {
  if (!userId) return 0;
  return (coupon.usedBy || []).filter((u) => u.userId?.toString() === userId.toString()).length;
}

// Runs every check (dates, overall usage limit, per-user limit, product
// scope, minimum order amount) and returns the computed discount, or throws
// an Error with a user-facing message if the coupon can't be applied.
export function evaluateCoupon(coupon, items, userId) {
  const now = new Date();
  if (now < new Date(coupon.validFrom) || now > new Date(coupon.validTo)) {
    throw new Error("Coupon is not valid at this time");
  }
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    throw new Error("Coupon usage limit reached");
  }
  if (userId) {
    const used = getUserUsageCount(coupon, userId);
    if (coupon.perUserLimit > 0 && used >= coupon.perUserLimit) {
      throw new Error(
        coupon.perUserLimit === 1
          ? "You have already used this coupon"
          : `You've already used this coupon the maximum ${coupon.perUserLimit} time(s) allowed`
      );
    }
  }

  const restrictToProducts = Array.isArray(coupon.applicableProducts) && coupon.applicableProducts.length > 0;
  const eligibleSubtotal = getEligibleSubtotal(coupon, items);
  if (restrictToProducts && eligibleSubtotal <= 0) {
    throw new Error("This coupon isn't valid for any of the items in your cart");
  }
  if (coupon.minOrderAmount > 0 && eligibleSubtotal < coupon.minOrderAmount) {
    throw new Error(`Minimum order amount is ${coupon.minOrderAmount}`);
  }

  let discount = coupon.type === "percentage" ? (eligibleSubtotal * coupon.value) / 100 : coupon.value;
  if (coupon.type === "percentage" && coupon.maxDiscount > 0) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.round(Math.min(discount, eligibleSubtotal) * 100) / 100;

  return { discount, eligibleSubtotal };
}
