import mongoose from "mongoose";

// Session 4 (Reviews & Q&A) — new model, project-wide grep confirmed
// nothing like this existed before.
//
// Answers are embedded, not a separate collection: every real read/write
// this feature needs is already scoped to "the answers for THIS
// question" — there's no case anywhere in this app of needing to query
// answers independently of their parent question (unlike, say, orders
// and their line items, which genuinely do get queried both ways
// elsewhere in this codebase). Embedding keeps a question+its answers a
// single atomic document and a single query.
const answerSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    answeredBy: { type: mongoose.Schema.ObjectId, ref: "user", required: true },
    // Computed server-side from the answerer's ACTUAL role at the moment
    // they answer (see qa.controller.js's answerQuestionController) —
    // never trust a client-supplied flag for something that changes how
    // an answer is visually badged ("Store Answer" vs. an ordinary
    // customer's answer).
    isStaffAnswer: { type: Boolean, default: false },
    helpfulVotes: { type: [mongoose.Schema.ObjectId], default: [] },
  },
  { timestamps: true }
);

const questionSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.ObjectId,
      ref: "product",
      required: true,
    },
    userId: {
      type: mongoose.Schema.ObjectId,
      ref: "user",
      required: true,
    },
    questionText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    // Soft-moderation, same reasoning as review.model.js's status field —
    // an admin can hide a question (e.g. off-topic/spam) without
    // permanently destroying it.
    status: {
      type: String,
      enum: ["published", "hidden"],
      default: "published",
    },
    helpfulVotes: {
      type: [mongoose.Schema.ObjectId],
      default: [],
    },
    answers: {
      type: [answerSchema],
      default: [],
    },
  },
  { timestamps: true }
);

// Primary list query: "published questions for this product, newest
// first" (or most-helpful — sorted in application code since helpful
// count needs a computed length, not a stored counter here).
questionSchema.index({ productId: 1, status: 1, createdAt: -1 });

const QuestionModel = mongoose.models.question || mongoose.model("question", questionSchema);

export default QuestionModel;
