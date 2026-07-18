import ProductRequestModel from "../models/productRequest.model.js";

// CUSTOMER: submit a shopping list — either typed text or an uploaded photo
// (the image itself is uploaded via the existing /api/file/upload endpoint
// first; this controller just records the resulting URL).
export const submitProductRequestController = async (req, res) => {
  try {
    const userId = req.userId;
    const { type, textContent, imageUrl, period, customerNote } = req.body;

    if (!type || !["text", "image"].includes(type)) {
      return res.status(400).json({ success: false, error: true, message: "type must be 'text' or 'image'" });
    }
    if (type === "text" && !textContent?.trim()) {
      return res.status(400).json({ success: false, error: true, message: "Please type your product list" });
    }
    if (type === "image" && !imageUrl) {
      return res.status(400).json({ success: false, error: true, message: "Please upload a photo of your list" });
    }

    const request = new ProductRequestModel({
      userId, type,
      textContent: type === "text" ? textContent.trim() : "",
      imageUrl: type === "image" ? imageUrl : "",
      period: period || "once",
      customerNote: customerNote || "",
    });
    await request.save();
    return res.status(201).json({ success: true, error: false, data: request, message: "Your product list has been sent to the store" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// CUSTOMER: view their own submitted requests
export const getMyProductRequestsController = async (req, res) => {
  try {
    const requests = await ProductRequestModel.find({ userId: req.userId }).sort({ createdAt: -1 });
    return res.json({ success: true, error: false, data: requests });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ADMIN: view all submitted requests, optional status filter
export const getAllProductRequestsController = async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const query = status && status !== "All" ? { status } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [requests, total, statusCounts] = await Promise.all([
      ProductRequestModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
        .populate("userId", "name email mobile"),
      ProductRequestModel.countDocuments(query),
      ProductRequestModel.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    const counts = statusCounts.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {});
    return res.json({ success: true, error: false, data: requests, total, statusCounts: counts });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// ADMIN: update status / add a note
export const updateProductRequestStatusController = async (req, res) => {
  try {
    const { _id, status, adminNote } = req.body;
    const updates = {};
    if (status) updates.status = status;
    if (adminNote !== undefined) updates.adminNote = adminNote;

    const request = await ProductRequestModel.findByIdAndUpdate(_id, updates, { new: true }).populate("userId", "name email mobile");
    if (!request) return res.status(404).json({ success: false, error: true, message: "Request not found" });
    return res.json({ success: true, error: false, data: request, message: "Updated" });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
