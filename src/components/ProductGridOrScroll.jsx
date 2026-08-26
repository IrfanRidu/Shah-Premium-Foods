"use client";
import HorizontalScroll from "./HorizontalScroll";

// Session 5 — shared fix for "many sections don't display a full row of
// products" (real-testing report, with screenshots, on 3 homepage rows).
//
// Root cause this fixes: a FIXED column-count grid (the previous approach,
// `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5`) can only ever
// look "full" for item counts that happen to divide evenly into whichever
// breakpoint is active — 2 products in a 5-column row on a wide screen
// still leaves 3 empty cells, which is exactly what the screenshots showed.
//
// Fix: CSS Grid's `repeat(auto-fit, minmax(MIN, 1fr))`. `auto-fit` (unlike
// `auto-fill`) COLLAPSES any track that ends up with no item in it down to
// 0 width, and the tracks that DO have items stretch via `1fr` to absorb
// the freed space — so the row provably spans the full container width for
// ANY item count from 1 up to GRID_THRESHOLD, at ANY viewport width, not
// just breakpoints someone thought to hand-pick. Each card is additionally
// wrapped in a max-width + centered shell so 1-2 items don't balloon into
// oversized cards — the leftover space becomes centered breathing room
// around a normally-sized card instead, which still reads as an
// intentional, fully-composed row rather than a gap.
//
// Above GRID_THRESHOLD items, this keeps the existing horizontal-scroll
// pattern unchanged — scrolling is the correct, expected way to reach the
// rest of a genuinely long list, not a symptom of unfilled space.
//
// Session 6 added `src/app/page.jsx`'s `ROW_TARGET_MIN` here as an
// intentionally-matching product-count backfill target (a row backfilled
// up to exactly this many would render as one complete grid row with
// nothing left to scroll to). Session 7 removed that backfill entirely
// (user-reported: it was backfilling by reusing a product an earlier row
// had already claimed, i.e. showing the same product twice on one page —
// explicitly not acceptable, "no duplicate products in a single page" is
// the hard rule now, a full row is best-effort within that rule, not a
// reason to bend it). GRID_THRESHOLD itself is unchanged and still
// exactly 5 — still the right number for "how many columns fit before
// scrolling makes more sense than a grid" on its own layout merits, it
// just no longer has a same-number sibling constant in page.jsx to stay
// in sync with.
//
// One shared component instead of hand-copying this ternary into every
// "row" section (which is how the SAME bug ended up needing a second,
// separate fix on this exact issue: Session 4 fixed 4 components this way
// but a 5th, `ProductRow` in page.jsx, never got the memo because the fix
// wasn't centralized) — fixed once here, every consumer stays in sync.
const GRID_THRESHOLD = 5;
const MIN_CARD_PX = 150; // matches the 2-col mobile width this app already used elsewhere
const MAX_CARD_PX = 240;

const defaultGetKey = (item, i) =>
  item?._id || item?.productId?._id || item?.productId || i;

/**
 * @param {Array} items
 * @param {(item, index, isGridMode) => ReactNode} renderItem
 * @param {(item, index) => string} [getKey]
 * @param {boolean} [autoScroll] - passed through to HorizontalScroll for the >5 case
 * @param {number} [autoScrollSpeed]
 * @param {string} [gridClassName] - extra classes merged onto the grid wrapper
 */
export default function ProductGridOrScroll({
  items,
  renderItem,
  getKey = defaultGetKey,
  autoScroll = false,
  autoScrollSpeed = 40,
  gridClassName = "",
}) {
  if (!items || items.length === 0) return null;

  if (items.length <= GRID_THRESHOLD) {
    return (
      <div
        className={`grid gap-3 sm:gap-4 ${gridClassName}`}
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${MIN_CARD_PX}px, 100%), 1fr))` }}
      >
        {items.map((item, i) => (
          <div key={getKey(item, i)} className="w-full mx-auto" style={{ maxWidth: MAX_CARD_PX }}>
            {renderItem(item, i, true)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <HorizontalScroll autoScroll={autoScroll} autoScrollSpeed={autoScrollSpeed}>
      {items.map((item, i) => (
        <div key={getKey(item, i)} className="shrink-0 w-44 sm:w-52">
          {renderItem(item, i, false)}
        </div>
      ))}
    </HorizontalScroll>
  );
}
