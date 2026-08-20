import mongoose from "mongoose";
import ReviewModel from "../models/review.model.js";
import ProductModel from "../models/product.model.js";
import OrderModel from "../models/order.model.js";
import { recalcProductRating } from "../utils/reviewAggregation.js";

// Session 4 (Rating + Review system). Response shape/conventions match
// every other controller in this app exactly (see wishlist.controller.js,
// the closest simple analog): `{ message, error, success, data }`, try/
// catch around every export, 400 for missing input, 404 for not-found,
// 500 fallback. Sanitization of body/query input already happens
// centrally in apiHandler.js's buildMockRequest — not re-done here.

// GET /list — public (route uses optionalAuth, not auth, so this works
// for anonymous visitors AND tells a logged-in visitor about their own
// review/vote state in the same response, no second round-trip).
export const getReviewsController = async (req, res) => {
  try {
    const { productId, sort = "newest", page = 1, limit = 10 } = req.query;
    if (!productId) {
      return res.status(400).json({ message: "Product id is required", error: true, success: false });
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const objectId = new mongoose.Types.ObjectId(productId);

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      highest: { rating: -1, createdAt: -1 },
      lowest: { rating: 1, createdAt: -1 },
      // helpful sorts on a computed array length — done in an aggregation
      // stage below rather than a plain .find().sort(), since Mongoose
      // can't sort by array length directly through the query API.
      helpful: null,
    };

    const baseMatch = { productId: objectId, status: "published" };

    let reviews, total;
    if (sort === "helpful") {
      const pipeline = [
        { $match: baseMatch },
        { $addFields: { helpfulCount: { $size: { $ifNull: ["$helpfulVotes", []] } } } },
        { $sort: { helpfulCount: -1, createdAt: -1 } },
        { $skip: (pageNum - 1) * limitNum },
        { $limit: limitNum },
      ];
      reviews = await ReviewModel.aggregate(pipeline);
      // Re-populate userId after aggregation (aggregate() doesn't run
      // Mongoose populate) — one extra query, only for this sort mode.
      reviews = await ReviewModel.populate(reviews, { path: "userId", select: "name avatar" });
      total = await ReviewModel.countDocuments(baseMatch);
    } else {
      [reviews, total] = await Promise.all([
        ReviewModel.find(baseMatch)
          .sort(sortMap[sort] || sortMap.newest)
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .populate("userId", "name avatar")
          .lean(),
        ReviewModel.countDocuments(baseMatch),
      ]);
    }

    // Star distribution (1-5 counts) — the one number this endpoint
    // needs that isn't already denormalized on the Product doc. avg/
    // count themselves are read straight off Product (kept in sync by
    // recalcProductRating on every mutation) rather than recomputed
    // here a second time, so there's exactly one place that math lives.
    const distAgg = await ReviewModel.aggregate([
      { $match: baseMatch },
      { $group: { _id: "$rating", count: { $sum: 1 } } },
    ]);
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const row of distAgg) distribution[row._id] = row.count;

    const product = await ProductModel.findById(productId).select("rating numReviews");

    let myReview = null;
    let votedReviewIds = [];
    if (req.userId) {
      const mine = await ReviewModel.findOne({ productId, userId: req.userId }).lean();
      if (mine) myReview = mine;
      // Which of THIS PAGE's reviews has the caller already marked
      // helpful — lets the UI render the toggle's pressed state without
      // a separate call per review.
      votedReviewIds = reviews
        .filter((r) => (r.helpfulVotes || []).some((id) => id.toString() === req.userId.toString()))
        .map((r) => r._id.toString());
    }

    return res.json({
      message: "Reviews fetched successfully",
      error: false,
      success: true,
      data: {
        reviews,
        summary: {
          avgRating: product?.rating || 0,
          numReviews: product?.numReviews || 0,
          distribution,
        },
        page: pageNum,
        totalPages: Math.max(1, Math.ceil(total / limitNum)),
        total,
        myReview,
        votedReviewIds,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// POST /submit — auth required. Upsert: a user's SECOND submission for
// the same product updates their existing review in place rather than
// creating a duplicate (unique compound index on the model backs this
// up structurally too, not just this application-level upsert).
export const submitReviewController = async (req, res) => {
  try {
    const userId = req.userId;
    const { productId, rating, title = "", body, images = [] } = req.body;

    if (!productId || !body || !body.trim()) {
      return res.status(400).json({ message: "Product and review text are required", error: true, success: false });
    }
    const ratingNum = Number(rating);
    if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5", error: true, success: false });
    }

    const product = await ProductModel.findById(productId).select("_id");
    if (!product) {
      return res.status(404).json({ message: "Product not found", error: true, success: false });
    }

    // Verified Purchase: does this user have a Delivered order
    // containing this exact product? Stored at submit time (not
    // recomputed live on every read) — if they later place a NEW
    // qualifying order, editing/resubmitting their review picks it up
    // the same way, since this check reruns on every submit.
    const order = await OrderModel.findOne({
      userId,
      order_status: "Delivered",
      "productDetails.productId": productId,
    }).select("_id");

    const review = await ReviewModel.findOneAndUpdate(
      { productId, userId },
      {
        productId,
        userId,
        rating: ratingNum,
        title: title.trim().slice(0, 120),
        body: body.trim().slice(0, 3000),
        images: Array.isArray(images) ? images.slice(0, 6) : [],
        verifiedPurchase: !!order,
        orderId: order?._id || null,
        status: "published",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await recalcProductRating(productId);

    return res.status(201).json({
      message: "Review submitted",
      error: false,
      success: true,
      data: review,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// DELETE /delete — auth required, own review ONLY. Ownership is checked
// here unconditionally (not via a route-level flag) so there is no way
// to reach this function without the check actually running.
export const deleteOwnReviewController = async (req, res) => {
  try {
    const { reviewId } = req.body;
    if (!reviewId) {
      return res.status(400).json({ message: "Review id is required", error: true, success: false });
    }
    const review = await ReviewModel.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found", error: true, success: false });
    }
    if (review.userId.toString() !== req.userId?.toString()) {
      return res.status(403).json({ message: "You can only delete your own review", error: true, success: false });
    }
    const productId = review.productId;
    await ReviewModel.deleteOne({ _id: reviewId });
    await recalcProductRating(productId);

    return res.json({ message: "Review deleted", error: false, success: true });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// DELETE /admin/delete — checkPermission("products","delete") applied at
// the route level (see app/api/review/[...segments]/route.js). No
// ownership check here by design: the route itself is what restricts
// who can reach this function at all, so an admin can remove any
// review (e.g. abusive/spam content) regardless of author.
export const adminDeleteReviewController = async (req, res) => {
  try {
    const { reviewId } = req.body;
    if (!reviewId) {
      return res.status(400).json({ message: "Review id is required", error: true, success: false });
    }
    const review = await ReviewModel.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found", error: true, success: false });
    }
    const productId = review.productId;
    await ReviewModel.deleteOne({ _id: reviewId });
    await recalcProductRating(productId);

    return res.json({ message: "Review deleted", error: false, success: true });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// POST /toggle-helpful — auth required. Same toggle shape as
// wishlist.controller.js's toggleWishlistController: one call always
// flips to the opposite of the caller's current state.
export const toggleReviewHelpfulController = async (req, res) => {
  try {
    const userId = req.userId;
    const { reviewId } = req.body;
    if (!reviewId) {
      return res.status(400).json({ message: "Review id is required", error: true, success: false });
    }
    const review = await ReviewModel.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found", error: true, success: false });
    }
    const already = review.helpfulVotes.some((id) => id.toString() === userId.toString());
    if (already) {
      review.helpfulVotes = review.helpfulVotes.filter((id) => id.toString() !== userId.toString());
    } else {
      review.helpfulVotes.push(userId);
    }
    await review.save();

    return res.json({
      message: already ? "Removed helpful vote" : "Marked as helpful",
      error: false,
      success: true,
      data: { helpfulCount: review.helpfulVotes.length, voted: !already },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// PUT /admin/moderate — checkPermission("products","edit"). Hide/unhide
// only — a genuinely permanent removal still goes through
// deleteReviewController (also reachable by an admin, see route.js).
export const adminModerateReviewController = async (req, res) => {
  try {
    const { reviewId, status } = req.body;
    if (!reviewId || !["published", "hidden"].includes(status)) {
      return res.status(400).json({ message: "Review id and a valid status are required", error: true, success: false });
    }
    const review = await ReviewModel.findByIdAndUpdate(reviewId, { status }, { new: true });
    if (!review) {
      return res.status(404).json({ message: "Review not found", error: true, success: false });
    }
    // A hidden review must stop affecting the public average immediately.
    await recalcProductRating(review.productId);

    return res.json({ message: `Review ${status}`, error: false, success: true, data: review });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};

// POST /admin/reply — checkPermission("products","edit"). A seller/
// store reply to a review — standard, expected pattern, one reply per
// review (resubmitting overwrites the previous reply text).
export const adminReplyReviewController = async (req, res) => {
  try {
    const { reviewId, text } = req.body;
    if (!reviewId || !text || !text.trim()) {
      return res.status(400).json({ message: "Review id and reply text are required", error: true, success: false });
    }
    const review = await ReviewModel.findByIdAndUpdate(
      reviewId,
      {
        adminReply: {
          text: text.trim().slice(0, 2000),
          repliedAt: new Date(),
          repliedBy: req.userId,
        },
      },
      { new: true }
    );
    if (!review) {
      return res.status(404).json({ message: "Review not found", error: true, success: false });
    }
    return res.json({ message: "Reply posted", error: false, success: true, data: review });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Internal server error", error: true, success: false });
  }
};
