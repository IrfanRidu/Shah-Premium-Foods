import UserModel from "../models/user.model.js";
import OrderModel from "../models/order.model.js";
import mongoose from "mongoose";

// GET all customers with order stats, filter, sort (admin)
export const getCustomersController = async (req, res) => {
  try {
    const {
      search = "", status = "", sortBy = "createdAt", sortDir = "desc",
      minOrders = "", minSpent = "", page = 1, limit = 50,
    } = req.query;

    const match = { role: "USER" };
    if (search) {
      match.$or = [
        { name:   { $regex: search, $options: "i" } },
        { email:  { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
      ];
    }
    if (status) match.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "userId",
          as: "orders",
        },
      },
      {
        $addFields: {
          totalOrders: { $size: "$orders" },
          totalSpent: { $sum: "$orders.totalAmt" },
          lastOrderDate: { $max: "$orders.createdAt" },
        },
      },
      { $project: { password: 0, refresh_token: 0, forgot_password_otp: 0, forgot_password_expiry: 0, orders: 0 } },
    ];

    if (minOrders) pipeline.push({ $match: { totalOrders: { $gte: parseInt(minOrders) } } });
    if (minSpent)  pipeline.push({ $match: { totalSpent:  { $gte: parseFloat(minSpent) } } });

    const sortField = ["totalOrders", "totalSpent", "lastOrderDate", "createdAt", "name"].includes(sortBy) ? sortBy : "createdAt";
    pipeline.push({ $sort: { [sortField]: sortDir === "asc" ? 1 : -1 } });

    const countPipeline = [...pipeline, { $count: "total" }];
    pipeline.push({ $skip: skip }, { $limit: parseInt(limit) });

    const [customers, countResult] = await Promise.all([
      UserModel.aggregate(pipeline),
      UserModel.aggregate(countPipeline),
    ]);

    const total = countResult[0]?.total || 0;

    return res.json({
      success: true, error: false,
      data: { customers, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// GET single customer full profile + order history (admin)
export const getCustomerDetailController = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await UserModel.findById(id).select("-password -refresh_token -forgot_password_otp -forgot_password_expiry").populate("address_details");
    if (!customer) return res.status(404).json({ success: false, error: true, message: "Customer not found" });

    const orders = await OrderModel.find({ userId: id }).sort({ createdAt: -1 });
    const totalSpent = orders.filter((o) => o.order_status !== "Cancelled").reduce((s, o) => s + (o.totalAmt || 0), 0);

    return res.json({
      success: true, error: false,
      data: { customer, orders, stats: { totalOrders: orders.length, totalSpent, avgOrderValue: orders.length ? totalSpent / orders.length : 0 } },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};

// GET all customers flat (for export — no pagination, capped at 5000)
export const exportCustomersController = async (req, res) => {
  try {
    const customers = await UserModel.aggregate([
      { $match: { role: "USER" } },
      { $lookup: { from: "orders", localField: "_id", foreignField: "userId", as: "orders" } },
      { $addFields: { totalOrders: { $size: "$orders" }, totalSpent: { $sum: "$orders.totalAmt" }, lastOrderDate: { $max: "$orders.createdAt" } } },
      { $project: { name: 1, email: 1, mobile: 1, status: 1, createdAt: 1, totalOrders: 1, totalSpent: 1, lastOrderDate: 1 } },
      { $sort: { createdAt: -1 } },
      { $limit: 5000 },
    ]);
    return res.json({ success: true, error: false, data: customers });
  } catch (err) {
    return res.status(500).json({ success: false, error: true, message: err.message });
  }
};
