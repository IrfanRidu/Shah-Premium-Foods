import QuestionModel from "../models/question.model.js";
import ProductModel from "../models/product.model.js";
import UserModel from "../models/user.model.js";

// Session 4 (Reviews & Q&A). Same conventions as review.controller.js
// and every other controller in this app: `{ message, error, success,
// data }`, try/catch, 400/403/404/500 as appropriate. Lesson applied
// from review.controller.js's own first draft (caught before shipping,
// see PROGRESS_TRACKER.md log): self-service vs. admin actions are
// always separate, explicitly-named controller functions — never one
// function branching on a request-set flag nothing actually sets.

// Literal role check, same shorthand permission.js's own ADMIN_ROLES
// set already uses elsewhere in this app — appropriate here because
// this is a purely cosmetic display badge ("Store Answer"), not a
// security gate, so it doesn't need a full RoleModel permission lookup.
const STAFF_ROLES = new Set(["SUPERADMIN", "ADMIN", "DEMO_ADMIN"]);

// GET /list — public (route uses optionalAuth).
export const getQuestionsController = async (req, res) => {
  try {
    const { productId, sort = "newest", page = 1, limit = 10 } = req.query;
    if (!productId) {
      return res.status(400).json({ message: "Product id is required", error: true, success: false });
    }
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const baseMatch = { productId, status: "published" };

    const [questions, total] = await Promise.all([
      QuestionModel.find(baseMatch)
        .sort(sort === "helpful" ? {} : { createdAt: -1 }) // helpful sort applied below (array length, not sortable via query API)
        .populate("userId", "name avatar")
        .populate("answers.answeredBy", "name avatar")
        .lean(),
      QuestionModel.countDocuments(baseMatch),
    ]);

    let ordered = questions;
    if (sort === "helpful") {
      ordered = [...questions].sort((a, b) => (b.helpfulVotes?.length || 0) - (a.helpfulVotes?.length || 0));
    }
    const paged = ordered.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    const product = await ProductModel.findById(productId).select("_id");
    if (!product) {
      return res.status(404).json({ message: "Product not found", error: true, success: false });
    }

    return res.json({
      message: "Questions fetched successfully",
      error: false,
      success: true,
      data: {
        questions: paged,
        page: pageNum,
        totalPages: Math.max(1, Math.ceil(total / limitNum)),
        total,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// POST /ask — auth required.
export const askQuestionController = async (req, res) => {
  try {
    const userId = req.userId;
    const { productId, questionText } = req.body;
    if (!productId || !questionText || !questionText.trim()) {
      return res.status(400).json({ message: "Product and question text are required", error: true, success: false });
    }
    const product = await ProductModel.findById(productId).select("_id");
    if (!product) {
      return res.status(404).json({ message: "Product not found", error: true, success: false });
    }
    const question = await QuestionModel.create({
      productId,
      userId,
      questionText: questionText.trim().slice(0, 500),
    });
    await question.populate("userId", "name avatar");

    return res.status(201).json({ message: "Question submitted", error: false, success: true, data: question });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// POST /answer — auth required, any logged-in user may answer (a real
// community Q&A pattern, not seller-only) — isStaffAnswer is computed
// here from the answerer's actual current role, never client-supplied.
export const answerQuestionController = async (req, res) => {
  try {
    const userId = req.userId;
    const { questionId, text } = req.body;
    if (!questionId || !text || !text.trim()) {
      return res.status(400).json({ message: "Question id and answer text are required", error: true, success: false });
    }
    const question = await QuestionModel.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: "Question not found", error: true, success: false });
    }
    const user = await UserModel.findById(userId).select("role");
    const isStaffAnswer = STAFF_ROLES.has(user?.role);

    question.answers.push({
      text: text.trim().slice(0, 2000),
      answeredBy: userId,
      isStaffAnswer,
    });
    await question.save();
    await question.populate("answers.answeredBy", "name avatar");

    return res.status(201).json({
      message: "Answer posted",
      error: false,
      success: true,
      data: question.answers[question.answers.length - 1],
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// POST /toggle-helpful — auth required. Body: { questionId, answerId? }
// — omit answerId to vote the QUESTION itself helpful, include it to
// vote a specific ANSWER helpful (embedded sub-document toggle).
export const toggleQuestionHelpfulController = async (req, res) => {
  try {
    const userId = req.userId;
    const { questionId, answerId } = req.body;
    if (!questionId) {
      return res.status(400).json({ message: "Question id is required", error: true, success: false });
    }
    const question = await QuestionModel.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: "Question not found", error: true, success: false });
    }

    const target = answerId ? question.answers.id(answerId) : question;
    if (answerId && !target) {
      return res.status(404).json({ message: "Answer not found", error: true, success: false });
    }

    const already = target.helpfulVotes.some((id) => id.toString() === userId.toString());
    if (already) {
      target.helpfulVotes = target.helpfulVotes.filter((id) => id.toString() !== userId.toString());
    } else {
      target.helpfulVotes.push(userId);
    }
    await question.save();

    return res.json({
      message: already ? "Removed helpful vote" : "Marked as helpful",
      error: false,
      success: true,
      data: { helpfulCount: target.helpfulVotes.length, voted: !already },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// DELETE /delete — own question only, ownership always checked here.
export const deleteOwnQuestionController = async (req, res) => {
  try {
    const { questionId } = req.body;
    if (!questionId) {
      return res.status(400).json({ message: "Question id is required", error: true, success: false });
    }
    const question = await QuestionModel.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: "Question not found", error: true, success: false });
    }
    if (question.userId.toString() !== req.userId?.toString()) {
      return res.status(403).json({ message: "You can only delete your own question", error: true, success: false });
    }
    await QuestionModel.deleteOne({ _id: questionId });
    return res.json({ message: "Question deleted", error: false, success: true });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// DELETE /admin/delete — checkPermission("products","delete") applied
// at the route level. No ownership check by design (see
// review.controller.js's adminDeleteReviewController for the same
// reasoning).
export const adminDeleteQuestionController = async (req, res) => {
  try {
    const { questionId } = req.body;
    if (!questionId) {
      return res.status(400).json({ message: "Question id is required", error: true, success: false });
    }
    const deleted = await QuestionModel.findByIdAndDelete(questionId);
    if (!deleted) {
      return res.status(404).json({ message: "Question not found", error: true, success: false });
    }
    return res.json({ message: "Question deleted", error: false, success: true });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// PUT /admin/moderate — checkPermission("products","edit"). Hide/unhide.
export const adminModerateQuestionController = async (req, res) => {
  try {
    const { questionId, status } = req.body;
    if (!questionId || !["published", "hidden"].includes(status)) {
      return res.status(400).json({ message: "Question id and a valid status are required", error: true, success: false });
    }
    const question = await QuestionModel.findByIdAndUpdate(questionId, { status }, { new: true });
    if (!question) {
      return res.status(404).json({ message: "Question not found", error: true, success: false });
    }
    return res.json({ message: `Question ${status}`, error: false, success: true, data: question });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};
