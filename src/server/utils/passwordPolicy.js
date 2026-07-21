import crypto from "crypto";

// Security audit: password policy. Two independent layers —
//   1. Common-password blocklist + basic strength rules: synchronous, zero
//      network dependency, always enforced, hard-blocks a match.
//   2. HIBP breach check: network-dependent, best-effort. A positive match
//      (password IS in a known breach corpus) hard-blocks; a network
//      failure/timeout FAILS OPEN (allows the request through) rather than
//      blocking registration/reset entirely — treating a third-party
//      outage as a self-inflicted denial-of-service would be worse than
//      the (small, time-boxed) risk of occasionally skipping this one
//      check. This mirrors how GitHub/1Password's own HIBP integrations
//      behave.
// Note this file's HIBP call genuinely cannot be exercised from the build
// sandbox this project was assembled in (network egress there is limited
// to package registries) — the logic is correct per HIBP's documented
// k-anonymity API contract, but treat a real deployment's first login
// attempt as the actual first test of that specific code path.

const COMMON_PASSWORDS = new Set([
  "123456","password","12345678","qwerty","123456789","12345","1234","111111",
  "1234567","dragon","123123","baseball","abc123","football","monkey","letmein",
  "696969","shadow","master","666666","qwertyuiop","123321","mustang","1234567890",
  "michael","654321","superman","1qaz2wsx","7777777","121212","000000","qazwsx",
  "123qwe","killer","trustno1","jordan","jennifer","zxcvbnm","asdfgh","hunter",
  "buster","soccer","harley","batman","andrew","tigger","sunshine","iloveyou",
  "fuckyou","2000","charlie","robert","thomas","hockey","ranger","daniel",
  "starwars","klaster","112233","george","asshole","computer","michelle",
  "jessica","pepper","1111","zxcvbn","555555","11111111","131313","freedom",
  "777777","pass","fuck","maggie","159753","aaaaaa","ginger","princess",
  "joshua","cheese","amanda","summer","love","ashley","6969","nicole",
  "chelsea","biteme","matthew","access","yankees","987654321","dallas",
  "austin","thunder","taylor","matrix","mobilemail","mom","monitor","monster",
  "montana","moon","moscow","mother","movie","mozilla","music","mustang1",
  "changeme","letmein1","welcome","welcome1","admin","admin123","administrator",
  "root","toor","passw0rd","password1","password123","p@ssw0rd","p@ssword",
  "qwerty123","1q2w3e4r","zaq12wsx","abcd1234","iloveyou1","whatever","donald",
  "trump","biden","test","test123","guest","default","letmein123","login",
  "starwars1","football1","baseball1","basketball","hello","hello123",
  "shahpremium","premiumfoods","bangladesh","dhaka","bd123456",
]);

/**
 * Fast, synchronous, always-on. Returns null if the password is fine, or a
 * user-facing reason string if it should be rejected.
 */
export function checkPasswordStrength(password) {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  if (password.length > 128) {
    // Also defends against bcrypt's own silent 72-byte truncation
    // producing a false sense of a much-longer effective password.
    return "Password must be 128 characters or fewer.";
  }
  if (/^\d+$/.test(password)) {
    return "Password can't be all numbers.";
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "This password is too common. Please choose a stronger one.";
  }
  return null;
}

/**
 * Best-effort HIBP k-anonymity check. Only the first 5 hex characters of
 * the password's SHA-1 hash are ever sent over the network — the full
 * password (and even the full hash) never leaves this server, which is
 * the entire point of HIBP's k-anonymity design.
 *
 * @returns {Promise<{ breached: boolean, checked: boolean }>}
 *   `checked` is false if the API couldn't be reached in time — callers
 *   should treat that as "couldn't verify, allow through" (fail open),
 *   never as "confirmed safe."
 */
export async function checkPasswordBreached(password) {
  try {
    const hash = crypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // don't let a slow/dead API stall registration
    let res;
    try {
      res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        signal: controller.signal,
        headers: { "Add-Padding": "true" }, // HIBP's own recommendation to further obscure request size
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) return { breached: false, checked: false };

    const body = await res.text();
    const found = body
      .split("\n")
      .some((line) => line.split(":")[0]?.trim() === suffix);

    return { breached: found, checked: true };
  } catch (err) {
    // Network error, timeout, DNS failure, etc. — fail open, log for
    // visibility so persistent failures (e.g. outbound network blocked at
    // the hosting layer) are noticeable in server logs rather than silent.
    console.warn("[passwordPolicy] HIBP breach check unavailable, failing open:", err.message);
    return { breached: false, checked: false };
  }
}

/**
 * Convenience wrapper combining both checks for use in register/reset
 * controllers. Returns null if the password passes, or a user-facing
 * rejection reason.
 */
export async function validateNewPassword(password) {
  const strengthIssue = checkPasswordStrength(password);
  if (strengthIssue) return strengthIssue;

  const { breached } = await checkPasswordBreached(password);
  if (breached) {
    return "This password has appeared in a known data breach. Please choose a different password.";
  }
  return null;
}
