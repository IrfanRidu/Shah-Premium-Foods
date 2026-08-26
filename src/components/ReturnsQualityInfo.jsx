import { FaUndo, FaShieldAlt } from "react-icons/fa";

// Session 5 — extracted out of DeliveryInfo.jsx so this exact copy can be
// reused as-is inside QuickView.jsx too (the user asked Quick View to show
// everything the full PDP shows except Delivery — Returns + Quality
// Assurance are both in scope). One shared source instead of two
// hand-duplicated copies that could drift out of sync with each other.
//
// Same reasoning as DeliveryInfo.jsx's own original comment: these stay
// deliberately truthful and non-committal (a support-contact prompt, and a
// general quality-assurance statement) rather than fabricated specifics —
// there's no policy page or siteSettings field anywhere in this codebase
// to source real, binding return-policy terms from, and inventing day
// counts/conditions neither of us can verify would be a real business/
// legal liability if a customer relied on it.
//
// `variant`: "card" renders each block with its own padding, matching
// DeliveryInfo's existing divide-y rows (default). "compact" trims the
// padding for use inside the already-padded QuickView modal, where an
// extra full card padding on top of the modal's own would be too much.
export default function ReturnsQualityInfo({ variant = "card" }) {
  const pad = variant === "compact" ? "py-2.5" : "p-3.5";
  // `flex-1` is harmless where the parent isn't `display:flex` (flex
  // properties are no-ops on a non-flex-item) — included unconditionally
  // so that wherever a caller's parent IS a flex column (DeliveryInfo.jsx,
  // stretched to match the Purchase panel's height), these two rows sit
  // as true flex siblings of whatever comes before them (Fragments
  // dissolve into their parent, so there's no extra wrapping div breaking
  // that sibling relationship) and share the extra height equally rather
  // than being nested inside their own sub-share of it.
  return (
    <>
      <div className={`flex items-start gap-3 ${pad} flex-1`}>
        <FaUndo className="text-theme-primary shrink-0 mt-0.5" size={15} aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">Returns</p>
          <p className="text-xs text-theme-muted mt-0.5">
            Something wrong with your order? Contact our support team and we&apos;ll help make it right.
          </p>
        </div>
      </div>
      <div className={`flex items-start gap-3 ${pad} flex-1`}>
        <FaShieldAlt className="text-theme-primary shrink-0 mt-0.5" size={15} aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">Quality Assurance</p>
          <p className="text-xs text-theme-muted mt-0.5">Every order is checked for freshness and quality before it ships.</p>
        </div>
      </div>
    </>
  );
}
