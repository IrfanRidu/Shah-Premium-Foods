"use client";
import { useState, useEffect, useCallback } from "react";
import { useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { FaThumbsUp, FaCheckCircle, FaStar } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError, timeAgo } from "@/lib/utils";
import StarRating from "./StarRating";
import SafeImage from "./SafeImage";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";

// Session 4 (Rating + Review system). Client-fetched, same reasoning as
// ProductSuggestions.jsx: not needed for SEO/LCP, and this keeps the PDP
// itself a fast server-rendered shell. No Redux — reviews are scoped to
// one product page at a time, unlike wishlist (needed globally, header
// count etc.), so local component state is the right amount of
// machinery here, matching ProductSuggestions' own precedent.
export default function ReviewsSection({ productId }) {
  const router = useRouter();
  const userId = useSelector((s) => s.user._id);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // Phase 5 note (design-system gap fill): added alongside EmptyState/
  // ErrorState — a failed fetch previously left `data` as null/reviews
  // as [], which rendered IDENTICALLY to a genuinely empty review list
  // ("No reviews yet"), silently telling the person something false
  // ("nobody's reviewed this") when the real story was "this failed to
  // load." Tracked separately now so the two render differently.
  const [fetchError, setFetchError] = useState(false);
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const r = await Axios({ ...api.getReviews, params: { productId, sort, page, limit: 6 } });
      if (r.data?.success) { setData(r.data.data); setFetchError(false); }
    } catch (err) {
      axiosToastError(err);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [productId, sort, page]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleWriteReviewClick = () => {
    if (!userId) {
      toast("Please log in to write a review");
      router.push("/login");
      return;
    }
    setShowForm((s) => !s);
  };

  const handleToggleHelpful = async (reviewId) => {
    if (!userId) {
      toast("Please log in to vote");
      router.push("/login");
      return;
    }
    try {
      const r = await Axios({ ...api.toggleReviewHelpful, data: { reviewId } });
      // Re-fetch rather than optimistically patch local state — this is
      // a small, already-paginated page (max 6 rows) so the round-trip
      // cost is negligible, and it keeps the helpful-count + voted-state
      // guaranteed consistent with the server rather than hand-rolling a
      // second copy of that logic client-side.
      if (r.data?.success) fetchReviews();
    } catch (err) {
      axiosToastError(err);
    }
  };

  if (loading && !data) return <ReviewsSkeleton />;

  const summary = data?.summary || { avgRating: 0, numReviews: 0, distribution: {} };
  const reviews = data?.reviews || [];

  return (
    <section id="reviews" className="scroll-mt-20">
      <h2 className="section-heading text-xl sm:text-2xl mb-5">Ratings &amp; Reviews</h2>

      {/* Summary: big average + distribution bars */}
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6 sm:gap-10 items-start mb-6 pb-6 border-b border-theme">
        <div className="flex sm:flex-col items-center sm:items-start gap-3 sm:gap-1.5">
          <span className="text-4xl sm:text-5xl font-bold font-display text-theme leading-none">
            {summary.avgRating.toFixed(1)}
          </span>
          <div>
            <StarRating value={summary.avgRating} size={18} />
            <p className="text-xs text-theme-muted mt-1">
              {summary.numReviews} review{summary.numReviews !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="space-y-1.5 w-full max-w-sm">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = summary.distribution?.[star] || 0;
            const pct = summary.numReviews ? Math.round((count / summary.numReviews) * 100) : 0;
            return (
              <div key={star} className="flex items-center gap-2 text-xs">
                <span className="w-8 text-theme-muted shrink-0">{star}★</span>
                <span className="flex-1 h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
                  <span
                    className="block h-full bg-amber-400 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="w-6 text-right text-theme-muted shrink-0">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <button onClick={handleWriteReviewClick} className="btn-primary text-sm px-5">
          {data?.myReview ? "Edit Your Review" : "Write a Review"}
        </button>

        {reviews.length > 0 && (
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            className="input-field !w-auto text-sm py-1.5 pr-8"
            aria-label="Sort reviews"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="highest">Highest Rated</option>
            <option value="lowest">Lowest Rated</option>
            <option value="helpful">Most Helpful</option>
          </select>
        )}
      </div>

      {showForm && (
        <ReviewForm
          productId={productId}
          existing={data?.myReview}
          onDone={() => {
            setShowForm(false);
            fetchReviews();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {fetchError ? (
        <ErrorState description="Couldn't load reviews right now." onRetry={fetchReviews} />
      ) : reviews.length === 0 ? (
        <EmptyState
          icon={FaStar}
          title="No reviews yet"
          description="Be the first to share your experience with this product."
        />
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {reviews.map((rev) => (
            <ReviewRow
              key={rev._id}
              review={rev}
              isMine={!!userId && rev.userId?._id === userId}
              voted={data.votedReviewIds?.includes(rev._id)}
              onToggleHelpful={() => handleToggleHelpful(rev._id)}
              onEdit={() => setShowForm(true)}
              onDeleted={fetchReviews}
            />
          ))}
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn-outline text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-xs text-theme-muted">
            Page {data.page} of {data.totalPages}
          </span>
          <button
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-outline text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

function ReviewForm({ productId, existing, onDone, onCancel }) {
  const [rating, setRating] = useState(existing?.rating || 0);
  const [title, setTitle] = useState(existing?.title || "");
  const [body, setBody] = useState(existing?.body || "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rating) {
      toast.error("Please select a star rating");
      return;
    }
    if (!body.trim()) {
      toast.error("Please write a few words about your experience");
      return;
    }
    setSubmitting(true);
    try {
      const r = await Axios({ ...api.submitReview, data: { productId, rating, title, body } });
      if (r.data?.success) {
        toast.success("Thanks for your review!");
        onDone();
      }
    } catch (err) {
      axiosToastError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mb-6 p-4 sm:p-5 rounded-2xl border border-theme bg-theme-surface space-y-3.5 animate-fade-in">
      <div>
        <label className="text-sm font-semibold block mb-1.5">Your Rating</label>
        <StarRating value={rating} onChange={setRating} interactive size={26} />
      </div>
      <div>
        <label className="text-sm font-semibold block mb-1.5">
          Title <span className="text-theme-muted font-normal">(optional)</span>
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Sum up your experience"
          className="input-field"
        />
      </div>
      <div>
        <label className="text-sm font-semibold block mb-1.5">Your Review</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={3000}
          rows={4}
          placeholder="What did you like or dislike? How did you use this product?"
          className="input-field resize-none"
          required
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={submitting} className="btn-primary text-sm disabled:opacity-60">
          {submitting ? "Submitting…" : existing ? "Update Review" : "Submit Review"}
        </button>
        <button type="button" onClick={onCancel} className="btn-outline text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

function ReviewRow({ review, isMine, voted, onToggleHelpful, onEdit, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const author = review.userId;

  const handleDelete = async () => {
    if (!confirm("Delete your review? This can't be undone.")) return;
    setDeleting(true);
    try {
      const r = await Axios({ ...api.deleteOwnReview, data: { reviewId: review._id } });
      if (r.data?.success) {
        toast.success("Review deleted");
        onDeleted();
      }
    } catch (err) {
      axiosToastError(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="py-5 first:pt-0">
      <div className="flex items-start gap-3">
        <div className="relative h-9 w-9 rounded-full bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)] flex items-center justify-center text-theme-primary font-bold text-sm shrink-0 overflow-hidden">
          {author?.avatar ? (
            <SafeImage src={author.avatar} alt="" fill sizes="36px" className="object-cover" />
          ) : (
            author?.name?.[0]?.toUpperCase() || "?"
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm">{author?.name || "Anonymous"}</span>
            {review.verifiedPurchase && (
              <span className="badge-success inline-flex items-center gap-1 !text-[10px]">
                <FaCheckCircle size={9} /> Verified Purchase
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <StarRating value={review.rating} size={13} />
            <span className="text-xs text-theme-muted">{timeAgo(review.createdAt)}</span>
          </div>
          {review.title && <h4 className="font-semibold text-sm mt-2">{review.title}</h4>}
          <p className="text-sm text-theme-muted mt-1 leading-relaxed whitespace-pre-line">{review.body}</p>

          {review.images?.length > 0 && (
            <div className="flex gap-2 mt-2.5 overflow-x-auto pb-1">
              {review.images.map((img, i) => (
                <div key={i} className="relative h-16 w-16 rounded-lg overflow-hidden shrink-0 border border-theme">
                  <SafeImage src={img} alt="" fill sizes="64px" className="object-cover" />
                </div>
              ))}
            </div>
          )}

          {review.adminReply?.text && (
            <div className="mt-3 pl-3 border-l-2 border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)] bg-theme-surface rounded-r-lg py-2 pr-3">
              <p className="text-xs font-semibold text-theme-primary">Store Response</p>
              <p className="text-sm text-theme-muted mt-0.5">{review.adminReply.text}</p>
            </div>
          )}

          <div className="flex items-center gap-4 mt-3">
            <button
              onClick={onToggleHelpful}
              className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${
                voted ? "text-theme-primary" : "text-theme-muted hover:text-theme-primary"
              }`}
            >
              <FaThumbsUp size={11} />
              Helpful{review.helpfulVotes?.length > 0 ? ` (${review.helpfulVotes.length})` : ""}
            </button>
            {isMine && (
              <>
                <button onClick={onEdit} className="text-xs font-medium text-theme-muted hover:text-theme-primary">
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs font-medium text-theme-muted hover:text-red-500 disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewsSkeleton() {
  return (
    <section className="animate-pulse">
      <div className="skeleton h-7 w-48 mb-5" />
      <div className="flex gap-10 mb-6 pb-6 border-b border-theme">
        <div className="skeleton h-14 w-20" />
        <div className="flex-1 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-3 w-full max-w-sm" />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="skeleton h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3 w-32" />
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
