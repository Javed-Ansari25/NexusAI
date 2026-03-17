import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js"
import messageRoutes from "./routes/message.routes.js"
import errorHandler from "./middlewares/errorHandler.js";

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || "http://127.0.0.1:5500",
  credentials: true
}));

app.use(express.json());
app.use((cookieParser()))

app.use("/api/auth", authRoutes);
app.use("/api/ai", messageRoutes);

/* Global Error Handler */
app.use(errorHandler);

export default app;
