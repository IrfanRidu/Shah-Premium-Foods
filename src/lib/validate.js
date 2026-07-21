// Section 8 (API Security) audit — Validation. This codebase validates
// required-field PRESENCE consistently (`if (!email) return 400...`)
// across controllers, but not always FORMAT (e.g. `email` was never
// checked to actually look like an email address, just to be non-empty
// — "not-an-email" would previously sail through to a database query and
// fail later with a much less clear error, or in a few places, just
// silently not match anything).
//
// Deliberately hand-rolled rather than pulling in a schema-validation
// library (zod/yup/joi) for this: a handful of small, focused functions
// covers what this app's forms actually need without adding a new
// dependency and a larger refactor across all 23 controllers to adopt a
// schema-based pattern everywhere. Applied here to the highest-value,
// most attacker-facing endpoints (register/login/forgot-password/
// reset-password) as the concrete implementation — a full rollout across
// every controller is a larger, separate pass, not attempted in this one.

export function isValidEmail(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  // Deliberately simple — not attempting full RFC 5322 compliance (that
  // regex is notoriously complex and still imperfect). This is a sanity
  // check to catch obvious garbage before it reaches a database query,
  // not the sole gate on whether an email is deliverable — actually
  // verifying that already happens via the OTP-based email verification
  // flow, which is the real check that matters.
  return trimmed.length > 0 && trimmed.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function isValidMobile(value) {
  if (!value) return true; // optional in most places — presence is checked separately where required
  if (typeof value !== "string") return false;
  const digits = value.replace(/[^\d]/g, "");
  return digits.length >= 7 && digits.length <= 15; // E.164-ish bound, generous for intl formats
}

export function isNonEmptyString(value, maxLength = 500) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}
