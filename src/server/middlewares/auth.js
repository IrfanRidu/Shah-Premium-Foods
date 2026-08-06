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

// Same identification as `auth` above, but never blocks the request — if
// no token is present, or it's invalid/expired, this just proceeds as an
// anonymous request instead of rejecting it. Used on the small number of
// routes that are intentionally open to anyone (e.g. submitting a support
// ticket without being logged in) but still need to know WHO the caller
// is when they happen to already be logged in — most importantly so a
// Demo Admin's identity reaches the interception check in
// src/lib/apiHandler.js even on a route that doesn't otherwise require
// auth at all. Without this, a Demo Admin could submit things through a
// no-auth route and have it actually written for real, since apiHandler.js
// can only intercept a request it can attribute to a specific user.
export const optionalAuth = async (req, res, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req?.headers?.authorization?.split(" ")[1];

    if (token && process.env.JWT_SECRET_ACCESS) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET_ACCESS);
      if (decoded?.id) req.userId = decoded.id;
    }
  } catch {
    // Invalid/expired token on an optional-auth route — treat exactly
    // like "not logged in" rather than rejecting, unlike `auth` above.
  }
  next();
};
