import { User } from "../models/user.model.js";
import redisClient from "../config/redis.js";
import { generateTokenAndSetCookie } from "../utils/jwt.js";

// Helper: safe user object to cache/return (no password)
const sanitizeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  status: user.status,
  lastSeen: user.lastSeen,
  createdAt: user.createdAt,
});

/* ===========================
   REGISTER
=========================== */
export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    const user = await User.create({ name, email, password });

    const token = generateTokenAndSetCookie(res, user._id);

    // Cache user in Redis (1 hour)
    await redisClient.set(
      `user:${user._id}`,
      JSON.stringify(sanitizeUser(user)),
      "EX",
      60 * 60
    );

    return res.status(201).json({
      success: true,
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    next(err);
  }
};

/* ===========================
   LOGIN
=========================== */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    let user;

    /* ===============================
       ⚡ REDIS CHECK
    =============================== */

    const cached = await redisClient.get(`user:${email}`);

    if (cached) {
      console.log("⚡ From Redis");

      user = JSON.parse(cached);

      // ❗ password verify karne ke liye DB se lena padega
      const dbUser = await User.findById(user._id).select("+password");

      if (!dbUser || !(await dbUser.matchPassword(password))) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      user = dbUser;

    } else {
      console.log("🗄️ From DB");

      user = await User.findByEmailWithPassword(email);

      if (!user || !(await user.matchPassword(password))) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      // ✅ cache user (without password)
      await redisClient.set(
        `user:${email}`,
        JSON.stringify({
          _id: user._id,
          email: user.email,
          name: user.name
        }),
        "EX",
        60 * 10
      );
    }

    /* ===============================
       ✅ LOGIN SUCCESS
    =============================== */

    user.status = "online";
    await user.save({ validateBeforeSave: false });

    const token = generateTokenAndSetCookie(res, user._id);

    return res.json({
      success: true,
      token,
      user: sanitizeUser(user),
      message: "Logged in successfully",
    });

  } catch (err) {
    next(err);
  }
};

/* ===========================
   LOGOUT
=========================== */
export const logout = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const token = req.token; // set by authMiddleware

    // Mark user offline in DB
    await User.findByIdAndUpdate(userId, {
      status: "offline",
      lastSeen: new Date(),
    });

    // Blacklist token in Redis until its natural expiry (7 days)
    if (token) {
      await redisClient.set(
        `blacklist:${token}`,
        "1",
        "EX",
        60 * 60 * 24 * 7
      );
    }

    // Remove user cache
    await redisClient.del(`user:${userId}`);

    // Clear cookie
    res.cookie("jwt", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 0,
    });

    return res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (err) {
    next(err);
  }
};

/* ===========================
   GET ME
=========================== */
export const getMe = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Try Redis first
    const cached = await redisClient.get(`user:${userId}`);
    if (cached) {
      return res.json({
        success: true,
        user: JSON.parse(cached),
        source: "cache",
      });
    }

    // Fallback to DB
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const safeUser = sanitizeUser(user);

    // Re-populate cache
    await redisClient.set(
      `user:${userId}`,
      JSON.stringify(safeUser),
      "EX",
      60 * 60
    );

    return res.json({
      success: true,
      user: safeUser,
      source: "database",
    });
  } catch (err) {
    next(err);
  }
};

