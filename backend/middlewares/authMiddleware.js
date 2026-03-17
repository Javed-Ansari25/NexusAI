import { verifyToken } from "../utils/jwt.js";
import { User } from "../models/user.model.js";
import redisClient from "../config/redis.js";

const protect = async (req, res, next) => {
  try {
    let token = null;

    // 1. Check cookie first
    if (req.cookies?.jwt) {
      token = req.cookies.jwt;
    }
    // 2. Fallback: Authorization header
    else if (
      req.headers.authorization?.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated. Please log in.",
      });
    }

    // Check Redis blacklist (logged-out tokens)
    const isBlacklisted = await redisClient.get(`blacklist:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again.",
      });
    }

    // Verify JWT
    const decoded = verifyToken(token);
    if (!decoded?.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid token.",
      });
    }

    // Attach user to request
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists.",
      });
    }

    req.user = user;
    req.token = token; // needed for logout blacklisting

    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token.",
      });
    }
    next(err);
  }
};

export default protect;