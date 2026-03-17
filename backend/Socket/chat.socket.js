import { Server } from "socket.io";
import { verifyToken } from "../utils/jwt.js";
import redisClient from "../config/redis.js";

let io;

/* ===========================
   INITIALIZE SOCKET.IO
=========================== */
export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://127.0.0.1:5500",
      credentials: true,
    },
    pingTimeout: 60000,
  });

  /* ---- AUTH MIDDLEWARE ---- */
  io.use((socket, next) => {
    try {
      let token = null;

      // Try cookie
      const cookieHeader = socket.handshake.headers?.cookie || "";
      if (cookieHeader) {
        const found = cookieHeader
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("jwt="));
        if (found) token = found.split("=")[1];
      }

      // Try auth object or Bearer header
      if (!token) token = socket.handshake.auth?.token;
      if (!token) {
        const authHeader = socket.handshake.headers?.authorization || "";
        if (authHeader.startsWith("Bearer "))
          token = authHeader.split(" ")[1];
      }

      if (!token) return next(new Error("Authentication required"));

      const decoded = verifyToken(token);
      if (!decoded?.id) return next(new Error("Invalid token"));

      socket.userId = decoded.id;
      next();
    } catch (err) {
      next(new Error("Authentication failed"));
    }
  });

  /* ---- CONNECTION ---- */
  io.on("connection", async (socket) => {
    const userId = socket.userId;
    console.log(`[Socket] User connected: ${userId} (${socket.id})`);

    // Track connected sockets per user (multi-device support)
    await redisClient.sadd(`online:${userId}`, socket.id);

    /* ---- ROOM MANAGEMENT ---- */

    socket.on("join_chat", (chatId) => {
      if (!chatId) return;
      socket.join(chatId.toString());
      console.log(`[Socket] User ${userId} joined chat ${chatId}`);
    });

    socket.on("leave_chat", (chatId) => {
      if (!chatId) return;
      socket.leave(chatId.toString());
    });

    /* ---- AI CHAT (Socket path for streaming UI feel) ---- */
    // Note: actual message saving still goes through HTTP /api/chats/:id/messages
    // This event is for streaming token-by-token responses if needed in future
    socket.on("ai:message", async ({ chatId, message, sessionId }) => {
      if (!message || !chatId) return;

      try {
        // Import lazily to avoid circular deps
        const { getAIResponse } = await import("../services/ai.service.js");

        socket.emit("ai:start", { sessionId });

        const reply = await getAIResponse(message);

        // Emit full reply (swap to streaming chunks when AI service supports it)
        socket.emit("ai:token", { sessionId, token: reply });
        socket.emit("ai:done", { sessionId });
      } catch (err) {
        console.error("[Socket] AI error:", err.message);
        socket.emit("ai:error", {
          sessionId,
          message: "AI response failed. Please try again.",
        });
      }
    });

    /* ---- TYPING INDICATORS ---- */
    socket.on("typing:start", ({ chatId }) => {
      if (!chatId) return;
      socket.to(chatId.toString()).emit("typing:start", { userId });
    });

    socket.on("typing:stop", ({ chatId }) => {
      if (!chatId) return;
      socket.to(chatId.toString()).emit("typing:stop", { userId });
    });

    /* ---- DISCONNECT ---- */
    socket.on("disconnect", async () => {
      try {
        await redisClient.srem(`online:${userId}`, socket.id);
        const remaining = await redisClient.scard(`online:${userId}`);

        if (remaining === 0) {
          await redisClient.del(`online:${userId}`);
          console.log(`[Socket] User fully offline: ${userId}`);
        }
      } catch (err) {
        console.error("[Socket] Disconnect cleanup error:", err.message);
      }
    });
  });

  console.log("[Socket] Socket.IO initialized");
  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.IO not initialized. Call initSocket first.");
  return io;
};