import { Message } from "../models/message.model.js";
import { Chat } from "../models/chat.model.js";
import { getAIResponse } from "../services/ai.service.js";
import { getIO } from "../Socket/chat.socket.js";
import redisClient from "../config/redis.js";

const MESSAGES_TTL = 60 * 5; // 5 min

/* ===========================
   SEND MESSAGE + GET AI REPLY
=========================== */
export const sendMessage = async (req, res, next) => {
  try {
    const { chatId, message } = req.body;
    const userId = req.user._id;

    if (!message?.trim()) {
      return res.status(400).json({
        success: false,
        message: "message is required",
      });
    }

    let chat;

    /* ---------- GET OR CREATE CHAT ---------- */
    if (chatId) {
      chat = await Chat.findOne({ _id: chatId, userId });
      if (!chat) {
        return res.status(404).json({
          success: false,
          message: "Chat not found",
        });
      }
    } else {
      chat = await Chat.create({
        userId,
        title: message.trim().slice(0, 60),
      });

      await redisClient.del(`chats:user:${userId}`);
    }

    const currentChatId = chat._id; // ✅ FIX

    /* ---------- Save user message ---------- */
    const userMessage = await Message.create({
      chatId: currentChatId, // ✅ FIX
      sender: userId,
      role: "user",
      content: message.trim(),
    });

    /* ---------- Get AI response ---------- */
    let aiContent;
    let isError = false;

    try {
      aiContent = await getAIResponse(message.trim());
    } catch (aiErr) {
      console.error("AI Service Error:", aiErr.message);
      aiContent = "Sorry, I couldn't process your message. Please try again.";
      isError = true;
    }

    /* ---------- Save AI message ---------- */
    const aiMessage = await Message.create({
      chatId: currentChatId, // ✅ FIX
      sender: null,
      role: "assistant",
      content: aiContent,
      isError,
    });

    /* ---------- Update chat metadata ---------- */
    await Chat.findByIdAndUpdate(currentChatId, {
      lastMessageAt: new Date(),
      $inc: { messageCount: 2 },
      ...(chat.title === "New Chat" && {
        title: message.trim().slice(0, 60),
      }),
    });

    /* ---------- Invalidate caches ---------- */
    await Promise.all([
      redisClient.del(`messages:${currentChatId}`),
      redisClient.del(`chats:user:${userId}`),
    ]);

    /* ---------- Emit via Socket.IO ---------- */
    try {
      const io = getIO();
      io.to(currentChatId.toString()).emit("new_message", userMessage);
      io.to(currentChatId.toString()).emit("new_message", aiMessage);
    } catch (socketErr) {
      console.error("Socket emit error:", socketErr.message);
    }

    return res.status(201).json({
      success: true,
      chat,
      userMessage,
      aiMessage,
    });
  } catch (err) {
    next(err);
  }
};

/* ===========================
   GET CHAT HISTORY
=========================== */
export const getChatHistory = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;
    const cacheKey = `messages:${chatId}`;

    // Verify ownership
    const chat = await Chat.findOne({ _id: chatId, userId });
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    // Try Redis
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        messages: JSON.parse(cached),
        source: "cache",
      });
    }

    const messages = await Message.find({ chatId })
      .sort({ createdAt: 1 })
      .lean();

    await redisClient.set(cacheKey, JSON.stringify(messages), "EX", MESSAGES_TTL);

    return res.json({
      success: true,
      messages,
      source: "database",
    });
  } catch (err) {
    next(err);
  }
};

/* ===========================
   DELETE SINGLE MESSAGE
=========================== */
export const deleteMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Verify the message belongs to a chat owned by this user
    const chat = await Chat.findOne({ _id: message.chatId, userId });
    if (!chat) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    await Message.deleteOne({ _id: messageId });
    await redisClient.del(`messages:${message.chatId}`);

    return res.json({
      success: true,
      message: "Message deleted",
    });
  } catch (err) {
    next(err);
  }
};

/* ===========================
   CLEAR ALL MESSAGES IN CHAT
=========================== */
export const clearMessages = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    const chat = await Chat.findOne({ _id: chatId, userId });
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    await Message.deleteMany({ chatId });
    await Chat.findByIdAndUpdate(chatId, {
      messageCount: 0,
      lastMessageAt: null,
      title: "New Chat",
    });

    await redisClient.del(`messages:${chatId}`);

    return res.json({
      success: true,
      message: "All messages cleared",
    });
  } catch (err) {
    next(err);
  }
};

