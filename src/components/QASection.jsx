"use client";
import { useState, useEffect, useCallback } from "react";
import { useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { FaThumbsUp, FaChevronDown, FaStore, FaInfoCircle } from "react-icons/fa";
import Axios from "@/lib/axios";
import api from "@/lib/api";
import { axiosToastError, timeAgo } from "@/lib/utils";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";

// Session 4 (Reviews & Q&A). Same conventions as ReviewsSection.jsx:
// client-fetched, no Redux (page-scoped data, matches ProductSuggestions'
// precedent), icons cross-checked against confirmed existing usage
// before writing (FaThumbsUp, FaChevronDown, FaStore all already
// appear elsewhere in this app).
export default function QASection({ productId }) {
  const router = useRouter();
  const userId = useSelector((s) => s.user._id);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false); // Phase 5: same reasoning as ReviewsSection — distinguish "failed to load" from "genuinely no questions"
  const [page, setPage] = useState(1);
  const [showAskForm, setShowAskForm] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [asking, setAsking] = useState(false);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const r = await Axios({ ...api.getQuestions, params: { productId, page, limit: 8 } });
      if (r.data?.success) { setData(r.data.data); setFetchError(false); }
    } catch (err) {
      axiosToastError(err);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [productId, page]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handleAskClick = () => {
    if (!userId) {
      toast("Please log in to ask a question");
      router.push("/login");
      return;
    }
    setShowAskForm((s) => !s);
  };

  const handleAskSubmit = async (e) => {
    e.preventDefault();
    if (!questionText.trim()) return;
    setAsking(true);
    try {
      const r = await Axios({ ...api.askQuestion, data: { productId, questionText } });
      if (r.data?.success) {
        toast.success("Question submitted");
        setQuestionText("");
        setShowAskForm(false);
        fetchQuestions();
      }
    } catch (err) {
      axiosToastError(err);
    } finally {
      setAsking(false);
    }
  };

  if (loading && !data) return <QASkeleton />;
  const questions = data?.questions || [];

  return (
    <section id="qa" className="scroll-mt-20">
      <h2 className="section-heading text-xl sm:text-2xl mb-5">Questions &amp; Answers</h2>

      <button onClick={handleAskClick} className="btn-primary text-sm px-5 mb-5">
        Ask a Question
      </button>

      {showAskForm && (
        <form onSubmit={handleAskSubmit} className="mb-6 p-4 sm:p-5 rounded-2xl border border-theme bg-theme-surface space-y-3 animate-fade-in">
          <label className="text-sm font-semibold block">Your Question</label>
          <textarea
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Ask about sizing, ingredients, usage…"
            className="input-field resize-none"
            required
          />
          <div className="flex gap-2">
            <button type="submit" disabled={asking} className="btn-primary text-sm disabled:opacity-60">
              {asking ? "Submitting…" : "Submit Question"}
            </button>
            <button type="button" onClick={() => setShowAskForm(false)} className="btn-outline text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {fetchError ? (
        <ErrorState description="Couldn't load questions right now." onRetry={fetchQuestions} />
      ) : questions.length === 0 ? (
        <EmptyState icon={FaInfoCircle} title="No questions yet" description="Ask the first one — the store or another shopper may know." />
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {questions.map((q) => (
            <QuestionRow key={q._id} question={q} userId={userId} onChanged={fetchQuestions} router={router} />
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

function QuestionRow({ question, userId, onChanged, router }) {
  const [expanded, setExpanded] = useState(false);
  const [answerText, setAnswerText] = useState("");
  const [answering, setAnswering] = useState(false);
  const [showAnswerForm, setShowAnswerForm] = useState(false);

  const handleToggleHelpful = async (answerId) => {
    if (!userId) {
      toast("Please log in to vote");
      router.push("/login");
      return;
    }
    try {
      await Axios({ ...api.toggleQuestionHelpful, data: { questionId: question._id, answerId } });
      onChanged();
    } catch (err) {
      axiosToastError(err);
    }
  };

  const handleAnswerSubmit = async (e) => {
    e.preventDefault();
    if (!answerText.trim()) return;
    if (!userId) {
      toast("Please log in to answer");
      router.push("/login");
      return;
    }
    setAnswering(true);
    try {
      const r = await Axios({ ...api.answerQuestion, data: { questionId: question._id, text: answerText } });
      if (r.data?.success) {
        setAnswerText("");
        setShowAnswerForm(false);
        setExpanded(true);
        onChanged();
      }
    } catch (err) {
      axiosToastError(err);
    } finally {
      setAnswering(false);
    }
  };

  const answerCount = question.answers?.length || 0;

  return (
    <div className="py-4 first:pt-0">
      <button onClick={() => setExpanded((e) => !e)} className="w-full flex items-start justify-between gap-3 text-left">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{question.questionText}</p>
          <p className="text-xs text-theme-muted mt-1">
            {question.userId?.name || "Anonymous"} · {timeAgo(question.createdAt)} · {answerCount} answer
            {answerCount !== 1 ? "s" : ""}
          </p>
        </div>
        <FaChevronDown
          size={12}
          className={`shrink-0 mt-1 text-theme-muted transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="mt-3 pl-4 border-l-2 border-theme space-y-3 animate-fade-in">
          {question.answers?.map((a) => (
            <div key={a._id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{a.answeredBy?.name || "Anonymous"}</span>
                {a.isStaffAnswer && (
                  <span className="badge-info inline-flex items-center gap-1 !text-[10px]">
                    <FaStore size={9} /> Store Answer
                  </span>
                )}
                <span className="text-xs text-theme-muted">{timeAgo(a.createdAt)}</span>
              </div>
              <p className="text-sm text-theme-muted mt-1">{a.text}</p>
              <button
                onClick={() => handleToggleHelpful(a._id)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-theme-muted hover:text-theme-primary mt-1"
              >
                <FaThumbsUp size={10} /> Helpful{a.helpfulVotes?.length > 0 ? ` (${a.helpfulVotes.length})` : ""}
              </button>
            </div>
          ))}

          {showAnswerForm ? (
            <form onSubmit={handleAnswerSubmit} className="space-y-2">
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                maxLength={2000}
                rows={2}
                placeholder="Write your answer…"
                className="input-field resize-none text-sm"
                required
              />
              <div className="flex gap-2">
                <button type="submit" disabled={answering} className="btn-primary text-xs px-4 py-1.5 disabled:opacity-60">
                  {answering ? "Posting…" : "Post Answer"}
                </button>
                <button type="button" onClick={() => setShowAnswerForm(false)} className="btn-outline text-xs px-4 py-1.5">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button onClick={() => setShowAnswerForm(true)} className="text-xs font-semibold text-theme-primary hover:underline">
              Answer this question
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function QASkeleton() {
  return (
    <section className="animate-pulse">
      <div className="skeleton h-7 w-56 mb-5" />
      <div className="skeleton h-10 w-36 mb-6 rounded-full" />
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="skeleton h-4 w-full max-w-md" />
            <div className="skeleton h-3 w-40" />
          </div>
        ))}
      </div>
    </section>
  );
}
