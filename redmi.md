# NexusAI — Intelligent Conversational Platform

> A production-ready, full-stack AI chat application with real-time messaging, multi-modal file analysis, Redis caching, rate limiting, and persistent chat history.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js)
![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-6.x-47A248?style=flat-square&logo=mongodb)
![Redis](https://img.shields.io/badge/Redis-7.x-DC382D?style=flat-square&logo=redis)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?style=flat-square&logo=socket.io)
![Anthropic](https://img.shields.io/badge/Anthropic-Claude%20API-6B46C1?style=flat-square)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Security](#security)
- [Performance & Caching](#performance--caching)
- [Rate Limiting](#rate-limiting)
- [Real-Time Communication](#real-time-communication)
- [Frontend Architecture](#frontend-architecture)
- [Design Decisions](#design-decisions)

---

## Overview

NexusAI is a full-stack conversational AI platform built for scale and production use. Users can register, maintain persistent chat histories, upload images and documents for AI analysis, and receive real-time responses powered by Anthropic's Claude API.

The system is designed with **separation of concerns**, **defense-in-depth security**, and **performance-first caching** — making it suitable for real-world deployment and easy to extend.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Client                           │
│         Vanilla JS SPA  ·  Socket.IO Client             │
└──────────────────────┬──────────────────────────────────┘
                       │  HTTP / WebSocket
┌──────────────────────▼──────────────────────────────────┐
│                   Express Server                        │
│  Auth Routes  ·  AI Routes  ·  Socket.IO Server         │
│                                                         │
│  Middleware Stack:                                      │
│  cors → cookieParser → express-json → protect →         │
│  authLimiter / aiChatLimiter → controller               │
└──────┬─────────────────────┬───────────────────────────┘
       │                     │
┌──────▼──────┐    ┌─────────▼──────────┐
│   MongoDB   │    │    Redis Cache     │
│  (Mongoose) │    │  Sessions · Chats  │
│  Users      │    │  Rate Limit Keys   │
│  Chats      │    └────────────────────┘
│  Messages   │
└──────┬──────┘
       │
┌──────▼───────────────┐
│   Anthropic Claude   │
│   API  (claude-3)    │
│   Vision · Docs · Text│
└──────────────────────┘
```

---

## Features

### Core
- **JWT Authentication** — Secure cookie-based auth with `httpOnly`, `sameSite`, `secure` flags
- **Persistent Chat History** — MongoDB-backed with per-user isolation
- **Real-Time Messaging** — Socket.IO with graceful REST fallback
- **AI-Powered Responses** — Anthropic Claude integration via `ai.service.js`

### Multi-Modal File Analysis
- **Images** — Claude Vision API (PNG, JPG, GIF, WebP)
- **PDFs** — Anthropic Document API (base64 encoded)
- **Text Files** — Inline embedding (TXT, CSV, MD, JS, PY, and more)
- Auto-generated prompts when no text accompanies a file

### Performance
- **Redis Caching** — Chat history cached with 5-minute TTL; invalidated on mutation
- **Cache-Aside Pattern** — DB only queried on cache miss
- **Lazy Session Loading** — Frontend session index in localStorage; messages fetched on demand

### Security & Reliability
- **Per-Account Rate Limiting** — `IP + email` keyed auth limiter (not IP-only)
- **Failed-Attempts-Only Counting** — `skipSuccessfulRequests: true` on auth limiter
- **Ownership Verification** — Every resource access validates `userId` ownership
- **Redis-Backed Rate Limits** — Survives server restarts and horizontal scaling
- **Graceful Degradation** — Redis failures never block requests; errors are logged

### UX
- **Typewriter Effect** — Character-by-character rendering for all AI responses
- **Smart Auto-Scroll** — Stops auto-scrolling when user manually scrolls up
- **Stop Generation** — Interrupt mid-response, saves partial content
- **Edit & Resend** — Edit any past message; history is trimmed and resent
- **Multi-User Isolation** — Logout clears DOM immediately; no session bleed between users

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Node.js 18+ | Server runtime |
| Framework | Express.js | HTTP server & routing |
| Database | MongoDB + Mongoose | Persistent storage |
| Cache | Redis (ioredis) | Session cache, rate limits |
| Real-Time | Socket.IO | WebSocket messaging |
| AI | Anthropic Claude API | LLM + Vision + Document |
| Auth | JWT + httpOnly cookies | Stateless auth |
| Rate Limiting | express-rate-limit + rate-limit-redis | Abuse prevention |
| File Upload | Multer | Multipart form handling |
| Frontend | Vanilla JS (ES6+) | Zero-dependency SPA |

---

## Project Structure

```
nexus-ai/
│
├── backend/
│   ├── config/
│   │   ├── db.js                  # MongoDB connection with retry logic
│   │   └── redis.js               # ioredis client with error handling
│   │
│   ├── controllers/
│   │   ├── auth.controller.js     # register, login, logout, getMe
│   │   └── message.controller.js  # sendMessage, getChatHistory,
│   │                              # deleteMessage, clearMessages
│   ├── middleware/
│   │   ├── auth.middleware.js     # JWT protect middleware
│   │   ├── rateLimiter.js         # aiChatLimiter, authLimiter
│   │   └── upload.js              # Multer config
│   │
│   ├── models/
│   │   ├── user.model.js          # User schema (bcrypt password hash)
│   │   ├── chat.model.js          # Chat schema (title, messageCount)
│   │   └── message.model.js       # Message schema (role, content, isError)
│   │
│   ├── routes/
│   │   ├── auth.routes.js         # /api/auth/*
│   │   └── message.routes.js      # /api/ai/*
│   │
│   ├── services/
│   │   └── ai.service.js          # Anthropic API wrapper
│   │
│   ├── socket/
│   │   └── chat.socket.js         # Socket.IO setup, room management
│   │
│   └── app.js                     # Express app entry point
│
└── frontend/
    ├── index.html                 # Single HTML shell
    ├── app.js                     # All client-side logic (~1000 lines)
    └── style.css                  # UI styles
```

---

## Getting Started

### Prerequisites

- Node.js `>= 18.0.0`
- MongoDB `>= 6.0` (local or Atlas)
- Redis `>= 7.0` (local or Redis Cloud)
- Anthropic API key

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/nexus-ai.git
cd nexus-ai

# 2. Install backend dependencies
cd backend
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your values (see Environment Variables section)

# 4. Start Redis (if running locally)
redis-server

# 5. Start the backend server
npm run dev        # development (nodemon)
npm start          # production
```

### Frontend

The frontend is plain HTML + JS — no build step required.

```bash
# Option 1: Serve via the Express backend (recommended)
# Place frontend/ files in the public/ folder served by Express
# app.use(express.static('public'))

# Option 2: Open directly
open frontend/index.html
```

---

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# ── Server ─────────────────────────────────────
PORT=4000
NODE_ENV=development            # development | production

# ── Database ───────────────────────────────────
MONGODB_URI=mongodb://localhost:27017/nexusai

# ── Redis ──────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── Authentication ─────────────────────────────
JWT_SECRET=your_super_secret_jwt_key_min_32_chars
JWT_EXPIRES_IN=7d
COOKIE_SECRET=your_cookie_secret

# ── Anthropic ──────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...

# ── CORS ───────────────────────────────────────
CLIENT_URL=http://localhost:3000
```

> **Never commit `.env` to version control.** Add it to `.gitignore`.

---

## API Reference

### Authentication — `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/register` | ✗ | Register new user |
| `POST` | `/login` | ✗ | Login, sets cookie |
| `POST` | `/logout` | ✓ | Logout, clears cookie |
| `GET` | `/me` | ✓ | Get current user |

#### POST `/api/auth/register`
```json
// Request
{ "name": "Alice", "email": "alice@example.com", "password": "min8chars" }

// Response 201
{ "success": true, "user": { "_id": "...", "name": "Alice", "email": "alice@example.com" } }
```

#### POST `/api/auth/login`
```json
// Request
{ "email": "alice@example.com", "password": "min8chars" }

// Response 200 — sets httpOnly cookie
{ "success": true, "user": { "_id": "...", "name": "Alice", "email": "alice@example.com" } }

// Response 429 — rate limited
{ "success": false, "message": "Too many failed attempts. 9 minutes baad try karo.", "retryAfter": 540 }
```

---

### AI Chat — `/api/ai`

All routes require authentication (`protect` middleware).

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/chat` | ✓ | Send message, get AI reply |
| `GET` | `/history/:chatId` | ✓ | Get chat message history |
| `DELETE` | `/message/:messageId` | ✓ | Delete a single message |
| `DELETE` | `/history/:chatId` | ✓ | Clear all messages in chat |

#### POST `/api/ai/chat`

**JSON request (text only):**
```json
{ "message": "Explain Redis caching.", "chatId": "64f1a2b3..." }
```

**Multipart request (with files):**
```
Content-Type: multipart/form-data
Fields: message, chatId (optional)
Files:  files[] (images, PDFs, text files)
```

**Response 201:**
```json
{
  "success": true,
  "chat": { "_id": "64f1a2b3...", "title": "Explain Redis caching.", "messageCount": 2 },
  "userMessage": { "_id": "...", "role": "user", "content": "Explain Redis caching." },
  "aiMessage":   { "_id": "...", "role": "assistant", "content": "Redis is an in-memory..." }
}
```

> If `chatId` is omitted, a new chat is created automatically. The response always includes the `chat` object with its `_id` for the client to persist.

#### GET `/api/ai/history/:chatId`
```json
// Response 200
{
  "success": true,
  "messages": [
    { "_id": "...", "role": "user",      "content": "Hello",    "createdAt": "..." },
    { "_id": "...", "role": "assistant", "content": "Hi there", "createdAt": "..." }
  ],
  "source": "cache"   // "cache" | "database"
}
```

---

## Security

### Authentication Flow

```
Client                          Server
  │                               │
  ├── POST /login ──────────────► │
  │                               ├── checkAuthLimit(IP + email)
  │                               ├── User.findOne({ email })
  │                               ├── bcrypt.compare(password, hash)
  │                               ├── clearFailedAttempts()  ← on success
  │                               ├── sign JWT
  │   ◄── Set-Cookie: token ──────┤   httpOnly, secure, sameSite=strict
  │                               │
  ├── GET /api/auth/me ─────────► │
  │   Cookie: token               ├── verify JWT
  │                               ├── User.findById(payload.id)
  │   ◄── { user } ──────────────┤
```

### Security Checklist

- [x] Passwords hashed with **bcrypt** (salt rounds: 12)
- [x] JWT stored in **httpOnly cookie** — not localStorage (XSS safe)
- [x] `secure: true` in production (HTTPS only)
- [x] `sameSite: strict` (CSRF protection)
- [x] All chat/message routes verify **userId ownership** before DB access
- [x] Rate limiting on auth with **IP + email key** (not IP-only)
- [x] Only failed login attempts count toward rate limit
- [x] Redis failures **never block requests** (fail open with logging)
- [x] File uploads validated by Multer (type + size limits)
- [x] Environment secrets via `.env` — never hardcoded

---

## Performance & Caching

### Cache Strategy — Cache-Aside Pattern

```
Request: GET /api/ai/history/:chatId
         │
         ▼
  Check Redis ──► HIT ──► Return cached messages  (source: "cache")
         │
        MISS
         │
         ▼
  Query MongoDB
         │
         ▼
  Store in Redis  TTL: 300s (5 min)
         │
         ▼
  Return messages  (source: "database")
```

### Cache Invalidation

Caches are invalidated immediately on any mutation:

| Action | Keys Invalidated |
|--------|-----------------|
| Send message | `messages:{chatId}`, `chats:user:{userId}` |
| Delete message | `messages:{chatId}` |
| Clear chat | `messages:{chatId}` |
| New chat created | `chats:user:{userId}` |

### Frontend Performance

- **Session index** stored in `localStorage` — sidebar renders instantly
- **Messages loaded on demand** — only when a chat is opened
- **Typing effect** uses `setTimeout` drain loop at 8ms/3 chars — smooth without blocking UI thread
- **Auto-scroll** uses passive scroll listener — never blocks scrolling

---

## Rate Limiting

### Configuration

```
┌─────────────────┬──────────────────────────┬──────────────────────────┐
│  Limiter        │  Key                     │  Limit                   │
├─────────────────┼──────────────────────────┼──────────────────────────┤
│  authLimiter    │  IP + email (lowercase)  │  7 failed / 10 min       │
│  aiChatLimiter  │  userId (or IP fallback) │  15 requests / 60 sec    │
└─────────────────┴──────────────────────────┴──────────────────────────┘
```

### Why `IP + email` key for auth?

A pure IP-based key would block all users on the same network (offices, universities, mobile carriers with NAT) if a single account is attacked. Keying by `IP + email` ensures limits are per-account-per-origin.

### Why `skipSuccessfulRequests: true`?

Without this, every login attempt (even successful ones) increments the counter. A legitimate user logging in 7 times would lock themselves out. With this flag, only `4xx`/`5xx` responses count.

### Redis Store

Using `rate-limit-redis` instead of the default in-memory store ensures:
- Limits persist across **server restarts**
- Limits work correctly with **horizontal scaling** (multiple instances)
- Shared state across all Node.js workers

---

## Real-Time Communication

### Socket.IO Events

| Direction | Event | Payload | Description |
|-----------|-------|---------|-------------|
| Server → Client | `new_message` | `Message` object | New user or AI message |
| Server → Client | `ai:token` | `{ token: string }` | Streaming chunk (if enabled) |
| Server → Client | `ai:done` | `{ chatId: string }` | Stream complete |
| Server → Client | `ai:error` | `{ message: string }` | Stream error |
| Client → Server | `ai:stop` | `{ chatId: string }` | Stop generation |

### Graceful Fallback

If Socket.IO is unavailable (network issues, server cold start), the frontend automatically falls back to standard REST polling. The user experience is identical — only the latency differs slightly.

```
Socket connected?
  YES → emit 'ai:chat' via WebSocket
  NO  → POST /api/ai/chat via fetch()
```

---

## Frontend Architecture

The frontend is a **single-page application** built with zero dependencies — no React, no Vue, no bundler. This is a deliberate choice for simplicity and performance.

### State Management

```javascript
const state = {
  user, authToken, socket,
  currentSessionId,    // frontend localStorage key
  currentChatId,       // backend MongoDB _id
  chatSessions,        // in-memory + localStorage index
  isStreaming,
  attachedFiles,
  stopRequested,
  userScrolled,        // smart auto-scroll flag
};
```

### Session Lifecycle

```
User types message
       │
       ▼
getOrCreateSession()    ← creates local session (no backend call yet)
       │
       ▼
sendViaREST()
       │
       ▼
POST /api/ai/chat       ← backend creates Chat document
       │
       ▼
session.chatId = data.chat._id   ← persisted to localStorage
       │
       ▼
Future messages use chatId → appended to same backend chat
```

### Multi-Modal File Flow

```
User attaches file
       │
       ├── Image  → FileReader → base64 dataUrl → preview + Anthropic vision block
       ├── PDF    → FileReader → base64          → Anthropic document block
       └── Text   → FileReader → raw text        → embedded in prompt
                                     │
                                     ▼
                         POST https://api.anthropic.com/v1/messages
                         content: [ image/document/text blocks... ]
                                     │
                                     ▼
                         Also POST /api/ai/chat (backend saves history)
                                     │
                                     ▼
                         AI reply piped through typewriter effect
```

---

## Design Decisions

### Why vanilla JS for the frontend?
No build step, no node_modules on the client, instant load time, and easier to audit. For a project of this scope, a framework would add complexity without meaningful benefit.

### Why cookie-based JWT over localStorage?
`httpOnly` cookies are inaccessible to JavaScript, making them immune to XSS attacks. `localStorage`-based tokens can be stolen by malicious scripts.

### Why Redis for rate limiting instead of in-memory?
In-memory rate limiters reset on restart and don't work across multiple server instances. Redis-backed limits are persistent, shared, and production-safe.

### Why `IP + email` key for auth rate limiting?
Pure IP-based limiting is too broad (harms shared networks) and pure email-based limiting is too narrow (a single IP can hammer many accounts). The combination is the correct granularity.

### Why cache-aside over write-through?
Write-through would require caching every message on write — expensive and wasteful for messages that may never be re-read in the TTL window. Cache-aside only caches on read, which matches the actual access pattern.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

Please follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
  Built with ❤️ using Node.js, MongoDB, Redis
</div>