import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

//
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js"
import messageRoutes from "./routes/message.routes.js"
import errorHandler from "./middlewares/errorHandler.js";

const app = express();

app.use(cors({
  origin: "http://127.0.0.1:5500",
  credentials: true
}));

app.use(express.json());
app.use((cookieParser()))

app.use("/api/auth", authRoutes);
app.use("/api/ai", messageRoutes);

/* Global Error Handler */
app.use(errorHandler);

//
app.use(express.static(path.join(__dirname, '../client')));

// Koi bhi unknown route → index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client', 'index.html'));
});

export default app;
