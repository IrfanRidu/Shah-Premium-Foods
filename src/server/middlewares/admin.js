import UserModel from "../models/user.model.js";

const admin = async (req, res, next) => {
  try {
    const userId = req.userId;

    const user = await UserModel.findById(userId);

    if (!user || !["ADMIN", "SUPERADMIN"].includes(user.role)) {
      return res.status(403).json({
        message: "Permission denied. Admin access only.",
        error: true,
        success: false,
      });
    }

    req.userRole = user.role;
    next();
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Internal server error",
      error: true,
      success: false,
    });
  }
};

export default admin;
