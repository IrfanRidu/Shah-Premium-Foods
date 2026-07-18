// In-memory cache for exchange rates (resets on server restart)
let rateCache = {
  base: "USD",
  rates: null,
  fetchedAt: 0,
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Conservative fallback rates (approx, used only if live fetch fails)
const FALLBACK_RATES = {
  USD: 1,
  BDT: 122,
  EUR: 0.92,
  INR: 85.5,
  PKR: 278,
  GBP: 0.79,
};

const fetchLiveRates = async () => {
  // Free, no-API-key endpoint
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) throw new Error(`Rate provider responded ${res.status}`);
  const json = await res.json();
  if (!json?.rates) throw new Error("Malformed rate response");
  return json.rates;
};

export const getExchangeRatesController = async (req, res) => {
  try {
    const now = Date.now();
    let source = "cache";

    if (!rateCache.rates || now - rateCache.fetchedAt > CACHE_TTL_MS) {
      try {
        const liveRates = await fetchLiveRates();
        rateCache = { base: "USD", rates: liveRates, fetchedAt: now };
        source = "live";
      } catch (fetchErr) {
        if (!rateCache.rates) {
          rateCache = { base: "USD", rates: FALLBACK_RATES, fetchedAt: now };
          source = "fallback";
        } else {
          source = "stale-cache";
        }
      }
    }

    const wanted = ["USD", "BDT", "EUR", "INR", "PKR", "GBP"];
    const rates = {};
    wanted.forEach((c) => { rates[c] = rateCache.rates[c] || FALLBACK_RATES[c]; });

    return res.json({
      success: true, error: false,
      data: { base: "USD", rates, source, updatedAt: rateCache.fetchedAt },
    });
  } catch (err) {
    return res.json({
      success: true, error: false,
      data: { base: "USD", rates: FALLBACK_RATES, source: "fallback-error", updatedAt: Date.now() },
    });
  }
};
