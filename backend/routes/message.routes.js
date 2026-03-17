import express from "express";
// import { aiChat, getChatHistory } from "../controllers/chat.controller.js";
import { sendMessage, getChatHistory } from "../controllers/message.controller.js";
import protect from "../middlewares/authMiddleware.js";
import { aiChatLimiter } from "../middlewares/rateLimiter.middleware.js";
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/chat", protect, aiChatLimiter, upload.array('files'), sendMessage);
router.get("/history/:chatId", protect, getChatHistory);

export default router;
