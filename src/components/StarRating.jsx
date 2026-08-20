"use client";

// Session 4 (Rating system) — single shared star-rating implementation
// for the whole app, used by: ProductCard.jsx's rating stub (updated
// alongside this file to consume it, replacing its own inline unicode-
// star markup so there's exactly one star-rendering implementation, not
// two divergent ones), the PDP rating summary, ReviewsSection's list
// rows, and the interactive star-picker in the write-a-review form.
// `text-amber-400` matches the exact color ProductCard.jsx's own
// pre-existing (pre-Session-4) rating stub already used — carried
// forward deliberately, not a new color choice.
//
// Two modes:
// - display (default): read-only, supports fractional values (4.3
//   renders visibly between 4 and 5 stars via a clipped overlay, not
//   just rounded to the nearest whole star).
// - interactive: click/keyboard-selectable 1-5 input for submitting a
//   rating.
export default function StarRating({
  value = 0,
  onChange,
  size = 16,
  interactive = false,
  showValue = false,
  className = "",
}) {
  const stars = [1, 2, 3, 4, 5];

  if (interactive) {
    return (
      <div className={`inline-flex items-center gap-1 ${className}`} role="radiogroup" aria-label="Rating">
        {stars.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => onChange?.(n)}
            className="p-0.5 transition-transform hover:scale-110 active:scale-95 rounded"
          >
            <StarIcon filled={n <= value} size={size} className={n <= value ? "text-amber-400" : "text-[var(--color-border)]"} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} aria-label={`Rated ${value} out of 5`}>
      <span className="inline-flex items-center">
        {stars.map((n) => {
          const fillFraction = Math.max(0, Math.min(1, value - (n - 1)));
          return (
            <span key={n} className="relative inline-block shrink-0" style={{ width: size, height: size }}>
              <StarIcon filled={false} size={size} className="absolute inset-0 text-[var(--color-border)]" />
              {fillFraction > 0 && (
                <span className="absolute inset-0 overflow-hidden" style={{ width: `${fillFraction * 100}%` }}>
                  <StarIcon filled size={size} className="text-amber-400" />
                </span>
              )}
            </span>
          );
        })}
      </span>
      {showValue && <span className="text-sm font-semibold text-theme">{value.toFixed(1)}</span>}
    </span>
  );
}

function StarIcon({ filled, size, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5}
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2.5l2.9 6.6 7.1.7-5.4 4.8 1.6 7-6.2-3.7-6.2 3.7 1.6-7-5.4-4.8 7.1-.7z" strokeLinejoin="round" />
    </svg>
  );
}
