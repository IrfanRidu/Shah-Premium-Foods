import ActivityLogModel from "../models/activityLog.model.js";
import ProductModel from "../models/product.model.js";

// LOG activity
export const logActivityController = async (req, res) => {
  try {
    const { productId, categoryId, subCategoryId, actionType, searchQuery, sessionId, metadata } = req.body;
    const userId = req.userId || null;
    const log = new ActivityLogModel({ userId, sessionId: sessionId || "", productId: productId || null, categoryId: categoryId || null, subCategoryId: subCategoryId || null, actionType, searchQuery: searchQuery || "", metadata: metadata || {} });
    await log.save();
    return res.json({ success: true, error: false, data: log });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// GET suggestions based on user history (similar category products)
export const getSuggestionsController = async (req, res) => {
  try {
    const { productId, limit = 10 } = req.query;
    const userId = req.userId || null;

    // Get the current product's categories
    const product = await ProductModel.findById(productId).select("category subCategory");
    if (!product) return res.json({ success: true, error: false, data: [] });

    let suggestedIds = [];

    // If user logged in, use their activity
    if (userId) {
      const recentViewed = await ActivityLogModel.find({ userId, actionType: "view", productId: { $ne: null } })
        .sort({ createdAt: -1 }).limit(20).distinct("productId");

      if (recentViewed.length > 0) {
        const viewedProducts = await ProductModel.find({ _id: { $in: recentViewed } }).select("category");
        const catIds = [...new Set(viewedProducts.flatMap((p) => p.category.map((c) => c.toString())))];
        const similar = await ProductModel.find({ category: { $in: catIds }, _id: { $nin: [productId, ...recentViewed] }, publish: true, stock: { $gt: 0 } })
          .sort({ createdAt: -1 }).limit(parseInt(limit));
        if (similar.length >= 4) return res.json({ success: true, error: false, data: similar });
        suggestedIds = similar.map((p) => p._id);
      }
    }

    // Fallback: same category products
    const catBased = await ProductModel.find({
      category: { $in: product.category },
      _id: { $nin: [productId, ...suggestedIds] },
      publish: true, stock: { $gt: 0 },
    }).sort({ createdAt: -1 }).limit(parseInt(limit) - suggestedIds.length);

    const merged = [...(suggestedIds.length > 0 ? await ProductModel.find({ _id: { $in: suggestedIds } }) : []), ...catBased];
    return res.json({ success: true, error: false, data: merged });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// Fix 17: admin-facing summary of tracked activity — counts by action type
// over a date range, plus the most-searched terms and most-viewed products,
// so tracking is actually visible somewhere rather than just accumulating
// silently in the database.
export const getActivitySummaryController = async (req, res) => {
  try {
    const { from, to } = req.query;
    const start = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end   = to   ? new Date(to)   : new Date();
    end.setHours(23, 59, 59, 999);

    const [countsByType, topSearches, topViewedProducts, dailyActivity, recentLogs] = await Promise.all([
      ActivityLogModel.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: "$actionType", count: { $sum: 1 } } },
      ]),
      ActivityLogModel.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, actionType: "search", searchQuery: { $ne: "" } } },
        { $group: { _id: { $toLower: "$searchQuery" }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),
      ActivityLogModel.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, actionType: "view", productId: { $ne: null } } },
        { $group: { _id: "$productId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product" } },
        { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
        { $project: { count: 1, name: "$product.name", image: { $arrayElemAt: ["$product.image", 0] } } },
      ]),
      ActivityLogModel.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 }, sessions: { $addToSet: "$sessionId" } } },
        { $project: { _id: 1, count: 1, sessionCount: { $size: "$sessions" } } },
        { $sort: { _id: 1 } },
      ]),
      ActivityLogModel.find({ createdAt: { $gte: start, $lte: end } })
        .sort({ createdAt: -1 }).limit(50)
        .populate("userId", "name email").populate("productId", "name"),
    ]);

    const counts = countsByType.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {});
    const totalEvents = countsByType.reduce((s, c) => s + c.count, 0);
    const distinctSessions = await ActivityLogModel.distinct("sessionId", { createdAt: { $gte: start, $lte: end } });

    return res.json({
      success: true, error: false,
      data: {
        period: { from: start, to: end },
        totalEvents,
        totalSessions: distinctSessions.filter(Boolean).length,
        countsByType: counts,
        topSearches: topSearches.map((s) => ({ query: s._id, count: s.count })),
        topViewedProducts,
        dailyActivity,
        recentLogs,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// GET recently viewed by user
export const getRecentlyViewedController = async (req, res) => {
  try {
    const userId = req.userId;
    const { limit = 10 } = req.query;
    const logs = await ActivityLogModel.find({ userId, actionType: "view", productId: { $ne: null } })
      .sort({ createdAt: -1 }).limit(parseInt(limit) * 3); // get more for dedup

    // Deduplicate by productId
    const seen = new Set();
    const uniqueIds = [];
    for (const log of logs) {
      const id = log.productId?.toString();
      if (id && !seen.has(id)) { seen.add(id); uniqueIds.push(log.productId); }
      if (uniqueIds.length >= parseInt(limit)) break;
    }

    const products = await ProductModel.find({ _id: { $in: uniqueIds }, publish: true });
    const ordered  = uniqueIds.map((id) => products.find((p) => p._id.toString() === id.toString())).filter(Boolean);
    return res.json({ success: true, error: false, data: ordered });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
