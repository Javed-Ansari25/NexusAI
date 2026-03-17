import express from "express";
import {
  register,
  login,
  logout,
  getMe,
} from "../controllers/auth.controller.js";
import protect from "../middlewares/authMiddleware.js";
// import { authLimiter } from "../middlewares/rateLimiter.middleware.js";

const router = express.Router();

router.post("/register", register);   // POST /api/auth/register
router.post("/login", login);         // POST /api/auth/login
router.post("/logout", protect, logout);           // POST /api/auth/logout
router.get("/me", protect, getMe);                 // GET  /api/auth/me

export default router;