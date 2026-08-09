// Default country code for numbers that don't already look
// international — configurable per deployment, not hardcoded, since
// this module could be reused by a store outside Bangladesh.
const DEFAULT_COUNTRY_CODE = process.env.NEXT_PUBLIC_DEFAULT_COUNTRY_CODE || "880";

// Normalizes a locally-formatted number ("01712345678") or an
// already-international one ("+8801712345678", "008801712345678") down
// to a consistent E.164-style "+<countrycode><number>" string.
export function toE164(rawNumber) {
  if (!rawNumber) return "";
  const digits = String(rawNumber).replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0")) return `+${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  if (digits.startsWith(DEFAULT_COUNTRY_CODE)) return `+${digits}`;
  return `+${DEFAULT_COUNTRY_CODE}${digits}`;
}

// wa.me deep links want the number WITHOUT the leading "+".
export function buildWhatsAppLink(rawNumber, message = "") {
  const digitsOnly = toE164(rawNumber).replace("+", "");
  if (!digitsOnly) return null;
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digitsOnly}${query}`;
}

export function formatCallDuration(totalSeconds = 0) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
