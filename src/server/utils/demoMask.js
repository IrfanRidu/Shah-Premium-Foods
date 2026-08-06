// Demo Admin — "hide every sensitive data or route from demo admin."
//
// This is the read-side counterpart to the write-side interception in
// src/lib/apiHandler.js: that file stops a Demo Admin from ever writing
// to the database; these helpers stop specific controllers from ever
// *sending* genuinely sensitive real data to one in the first place, so
// it never even reaches the browser's network tab. Demo Admin can still
// see the general shape/structure of every page (a real list, real
// counts, real UI) — only the handful of fields that would leak a real
// person's private information or business-sensitive figures get
// redacted, and only for this one role.
//
// Deliberately NOT used for the Audit Log — that route stays on the
// stricter `superAdminOnly` middleware (see permission.js) instead, so
// it's genuinely inaccessible rather than shown-but-redacted; a real
// trail of other people's activity isn't "functionality to demo" the
// same way a Customers list or a Payroll table is.
export const isDemoRole = (role) => role === "DEMO_ADMIN";

// "john.doe@example.com" -> "j***@example.com"
export function maskEmail(email) {
  if (!email || typeof email !== "string" || !email.includes("@")) return email;
  const [user, domain] = email.split("@");
  const visible = user.slice(0, 1) || "•";
  return `${visible}${"*".repeat(Math.max(3, user.length - 1))}@${domain}`;
}

// "+1 555-123-4567" -> "*******4567" (keeps just the last 2 digits)
export function maskPhone(phone) {
  if (!phone) return phone;
  const str = String(phone);
  const digits = str.replace(/\D/g, "");
  if (digits.length <= 2) return "*".repeat(str.length);
  return str.slice(0, -2).replace(/[0-9]/g, "*") + str.slice(-2);
}

// Bank account / IBAN / similar identifiers -> "••••1234"
export function maskAccountNumber(value) {
  if (!value) return value;
  const str = String(value);
  if (str.length <= 4) return "*".repeat(str.length);
  return `••••${str.slice(-4)}`;
}

// Salary / bonus / net-pay style figures: zeroed rather than string-masked
// so the field stays a Number (existing display/sum code — e.g. the
// "total monthly payroll" figure — keeps working without special-casing,
// just correctly reflects "hidden" as 0 for this role only).
export function maskAmount() {
  return 0;
}

// Recursively masks the given field names (dot-path not needed — this
// app's relevant documents are all flat) on a single plain object or
// array of objects. Safe to call unconditionally; only actually mutates
// anything when `role` is DEMO_ADMIN. Works on both real Mongoose
// documents (via toObject()) and already-plain objects/lean() results.
export function maskFieldsForDemo(role, data, maskers) {
  if (!isDemoRole(role) || !data) return data;

  const maskOne = (doc) => {
    const plain = typeof doc?.toObject === "function" ? doc.toObject() : doc;
    const out = { ...plain };
    for (const [field, maskFn] of Object.entries(maskers)) {
      if (out[field] !== undefined) out[field] = maskFn(out[field]);
    }
    return out;
  };

  return Array.isArray(data) ? data.map(maskOne) : maskOne(data);
}
