import Link from "next/link";

// Session 4 (Luxury redesign — design-system gap fill). The brief's
// design-system list calls for a documented "Empty states" piece —
// until now every empty case in this session's own new work
// (ReviewsSection's "No reviews yet", QASection's "No questions yet",
// the /compare page's "Nothing to compare yet") was a one-off bit of
// plain text, each slightly differently structured. This consolidates
// them into one flexible, reusable shape rather than a fourth
// near-duplicate. Deliberately NOT used for RecentlyViewed/
// FrequentlyBoughtTogether's empty case — those two intentionally
// render nothing at all when empty (see their own comments): they're
// supplementary discovery rows with no useful action to prompt
// ("browse more" is already what the person is doing), so an empty
// -state message there would add clutter, not help.
export default function EmptyState({ icon: Icon, title, description, actionLabel, onAction, actionHref, className = "" }) {
  return (
    <div className={`text-center py-10 px-4 ${className}`}>
      {Icon && (
        <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-theme-surface flex items-center justify-center text-theme-muted">
          <Icon size={20} />
        </div>
      )}
      {title && <h3 className="font-semibold text-theme mb-1">{title}</h3>}
      {description && <p className="text-sm text-theme-muted max-w-sm mx-auto">{description}</p>}
      {actionLabel && (
        actionHref ? (
          <Link href={actionHref} className="btn-primary inline-block mt-4 px-6 py-2.5 text-sm">
            {actionLabel}
          </Link>
        ) : (
          <button onClick={onAction} className="btn-primary mt-4 px-6 py-2.5 text-sm">
            {actionLabel}
          </button>
        )
      )}
    </div>
  );
}
