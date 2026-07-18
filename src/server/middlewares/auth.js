import jwt from "jsonwebtoken";

const auth = async (req, res, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req?.headers?.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        message: "Unauthorized access. Please log in.",
        error: true,
        success: false,
      });
    }

    if (!process.env.JWT_SECRET_ACCESS) {
      // Server misconfiguration, not an invalid session — surfacing this
      // distinctly (500, not 401) avoids the confusing "please log in
      // again" loop this would otherwise cause for every single request.
      console.error("JWT_SECRET_ACCESS is not set in environment variables.");
      return res.status(500).json({
        message: "Server misconfiguration: JWT_SECRET_ACCESS is not set. Add it to your environment variables and restart the server.",
        error: true,
        success: false,
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET_ACCESS);

    if (!decoded) {
      return res.status(401).json({
        message: "Unauthorized access. Invalid token.",
        error: true,
        success: false,
      });
    }

    req.userId = decoded.id;

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Unauthorized. " + (error.message || ""),
      error: true,
      success: false,
    });
  }
};

export default auth;
