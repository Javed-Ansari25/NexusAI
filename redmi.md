# NexusAI — AI-Powered Chat Backend

> A production-ready REST + WebSocket backend for an intelligent conversational platform — built with Node.js, Express, MongoDB, Redis, and Groq API. Paired with a zero-dependency HTML/CSS/JS client.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js)
![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-6.x-47A248?style=flat-square&logo=mongodb)
![Redis](https://img.shields.io/badge/Redis-7.x-DC382D?style=flat-square&logo=redis)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?style=flat-square&logo=socket.io)
![Groq](https://img.shields.io/badge/Groq-API-F55036?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-nexus__ai.oneapp.dev-4A90E2?style=flat-square&logo=vercel)](https://ai-nexus.oneapp.dev/)

---

## 🚀 Live Demo

**[https://ai-nexus.oneapp.dev/](https://ai-nexus.oneapp.dev/)**

Try the live deployment — register an account and start chatting with the AI instantly.

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
- [Client (HTML/CSS/JS)](#client-htmlcssjs)
- [Design Decisions](#design-decisions)

---

## Overview

NexusAI is a **backend-first** AI chat platform. The server handles authentication, persistent chat storage, real-time messaging via Socket.IO, Redis-backed caching, and intelligent rate limiting — all exposed through a clean REST API.

The client is a lightweight static interface built in plain **HTML, CSS, and vanilla JavaScript** — no framework, no build step, no bundler. It communicates with the backend exclusively through the documented API and WebSocket events.

The system is designed around three principles:
- **Security by default** — JWT in httpOnly cookies, per-account rate limiting, ownership checks on every resource
- **Performance at the data layer** — Redis cache-aside for message history, invalidation on mutation
- **Resilience** — every external dependency (Redis, Socket.IO) has a graceful fallback so the core flow never breaks

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Static Client                            │
│           HTML  ·  CSS  ·  Vanilla JavaScript               │
│     (Served by Express static OR opened directly)           │
└───────────────────────┬─────────────────────────────────────┘
                        │  HTTP REST  /  WebSocket
┌───────────────────────▼─────────────────────────────────────┐
│                    Express Server                           │
│                                                             │
│   Middleware Chain:                                         │
│   cors → cookieParser → express.json →                      │
│   protect (JWT) → rateLimiter → controller                  │
│                                                             │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐  │
│   │ auth routes │   │  ai routes  │   │  Socket.IO      │  │
│   │ /api/auth/* │   │  /api/ai/*  │   │  chat.socket.js │  │
│   └─────────────┘   └─────────────┘   └─────────────────┘  │
└────────┬───────────────────┬───────────────────────────────┘
         │                   │
┌────────▼────────┐  ┌───────▼──────────┐
│    MongoDB      │  │      Redis       │
│   (Mongoose)    │  │                  │
│                 │  │  Message cache   │
│  Users          │  │  Chat list cache │
│  Chats          │  │  Rate limit keys │
│  Messages       │  └──────────────────┘
└────────┬────────┘
         │
┌────────▼──────────────┐
│      Groq API         │
│   llama / mixtral     │
│   Ultra-fast LLM      │
└───────────────────────┘
```

---

## Features

### Backend
- **JWT Authentication** — Cookie-based, `httpOnly`, `secure`, `sameSite=strict`
- **Persistent Chat History** — MongoDB with per-user ownership isolation
- **Real-Time Messaging** — Socket.IO rooms, graceful REST fallback
- **Redis Caching** — Cache-aside pattern with TTL and mutation-triggered invalidation
- **Rate Limiting** — `express-rate-limit` + `rate-limit-redis`; per-account, failed-attempts-only
- **File Uploads** — Multer middleware, multipart support
- **AI Service Layer** — Abstracted Groq wrapper in `ai.service.js`

### Client
- **Zero Dependencies** — Pure HTML, CSS, JavaScript — no npm, no bundler
- **SPA Behaviour** — Single page with auth screen and chat app, no page reloads
- **Typewriter Effect** — Character-by-character AI response rendering
- **Multi-Modal File Analysis** — Images (vision), PDFs (document API), text files
- **Socket.IO + REST Fallback** — Seamless real-time with automatic fallback
- **Smart Auto-Scroll** — Pauses when user scrolls up mid-stream, resumes at bottom
- **Stop Generation** — Cancel mid-response; partial content is saved
- **Edit & Resend** — Edit any past message, history is trimmed and resent
- **Multi-User Isolation** — DOM cleared on logout, no session bleed between users
- **Chat Search & Rename** — Sidebar search with highlight, inline rename

---

## Tech Stack

### Backend

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | 4.x | HTTP server & routing |
| `mongoose` | 8.x | MongoDB ODM |
| `ioredis` | 5.x | Redis client |
| `socket.io` | 4.x | WebSocket server |
| `groq-sdk` | latest | Groq LLM API client |
| `jsonwebtoken` | 9.x | JWT sign & verify |
| `bcryptjs` | 2.x | Password hashing |
| `cookie-parser` | 1.x | Cookie middleware |
| `multer` | 1.x | Multipart file uploads |
| `express-rate-limit` | 7.x | Rate limiting middleware |
| `rate-limit-redis` | 4.x | Redis store for rate limits |
| `cors` | 2.x | Cross-origin resource sharing |
| `dotenv` | 16.x | Environment variable loading |

### Client

| Technology | Purpose |
|-----------|---------|
| HTML5 | Page structure, semantic markup |
| CSS3 | Styling, animations, responsive layout |
| Vanilla JavaScript ES6+ | All interactivity, API calls, state management |
| Socket.IO Client (CDN) | WebSocket connection |
| Web APIs | `fetch` · `FileReader` · `navigator.clipboard` · `localStorage` |

---

## Project Structure

```
nexus-ai/
│
├── backend/                          # Node.js server (primary codebase)
│   │
│   ├── config/
│   │   ├── db.js                     # MongoDB connection with retry logic
│   │   └── redis.js                  # ioredis client, error handling
│   │
│   ├── controllers/
│   │   ├── auth.controller.js        # register · login · logout · getMe
│   │   └── message.controller.js     # sendMessage · getChatHistory
│   │                                 # deleteMessage · clearMessages
│   ├── middleware/
│   │   ├── auth.middleware.js        # JWT verification (protect)
│   │   ├── rateLimiter.js            # authLimiter · aiChatLimiter
│   │   └── upload.js                 # Multer configuration
│   │
│   ├── models/
│   │   ├── user.model.js             # User schema — bcrypt pre-save hook
│   │   ├── chat.model.js             # Chat schema — title, messageCount
│   │   └── message.model.js          # Message schema — role, content, isError
│   │
│   ├── routes/
│   │   ├── auth.routes.js            # POST /register /login /logout · GET /me
│   │   └── message.routes.js         # POST /chat · GET /history/:id
│   │
│   ├── services/
│   │   └── ai.service.js             # Groq API wrapper
│   │
│   ├── socket/
│   │   └── chat.socket.js            # Socket.IO init, room join/leave
│   │
│   ├── app.js                        # Express app, middleware chain
│   ├── server.js                     # HTTP server entry point
│   ├── .env.example                  # Environment variable template
│   └── package.json
│
└── client/                           # Static HTML/CSS/JS — no build step
    ├── index.html                    # App shell — auth screen + chat UI
    ├── app.js                        # All client logic (~1100 lines)
    └── style.css                     # Complete stylesheet
```

---

## Getting Started

### Prerequisites

- **Node.js** `>= 18.0.0`
- **MongoDB** `>= 6.0` — [local](https://www.mongodb.com/try/download/community) or [Atlas](https://www.mongodb.com/atlas)
- **Redis** `>= 7.0` — [local](https://redis.io/download) or [Redis Cloud](https://redis.io/cloud)
- **Groq API Key** — [console.groq.com](https://console.groq.com)

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/nexus-ai.git
cd nexus-ai/backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Fill in your values — see Environment Variables below
```

### 3. Start Services

```bash
# Redis (local)
redis-server

# MongoDB (local)
mongod --dbpath /your/data/path

# Backend — development (nodemon)
npm run dev

# Backend — production
npm start
```

### 4. Open the Client

```bash
# Express serves client/ as static files automatically
# Just open:
http://localhost:4000

# Or open client/index.html directly in any browser — also works
```

---

## Environment Variables

```env
# ── Server ──────────────────────────────────────────
PORT=4000
NODE_ENV=development                # development | production

# ── Database ────────────────────────────────────────
MONGODB_URI=mongodb://localhost:27017/nexusai
# Atlas: mongodb+srv://<user>:<pass>@cluster.mongodb.net/nexusai

# ── Redis ────────────────────────────────────────────
REDIS_URL=redis://localhost:6379
# Redis Cloud: redis://:<password>@<host>:<port>

# ── Authentication ───────────────────────────────────
JWT_SECRET=your_super_secret_key_minimum_32_characters_long
JWT_EXPIRES_IN=7d
COOKIE_SECRET=another_random_secret_for_cookies

# ── Groq ─────────────────────────────────────────────
GROQ_API_KEY=gsk_...

# ── CORS ─────────────────────────────────────────────
CLIENT_URL=http://localhost:4000
```

> ⚠️ Never commit `.env` to version control. It is in `.gitignore` by default.

---

## API Reference

### Base URL
```
https://ai-nexus.oneapp.dev/  ← Production
http://localhost:4000          ← Local development
```

### Authentication — `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | ✗ | Create account |
| `POST` | `/api/auth/login` | ✗ | Login, sets httpOnly cookie |
| `POST` | `/api/auth/logout` | ✓ | Logout, clears cookie |
| `GET` | `/api/auth/me` | ✓ | Get current user |

#### `POST /api/auth/register`
```json
// Request
{ "name": "Alice", "email": "alice@example.com", "password": "securepass123" }

// 201 Created
{ "success": true, "user": { "_id": "64f1...", "name": "Alice", "email": "alice@example.com" } }

// 400 Bad Request
{ "success": false, "message": "Email already in use." }
```

#### `POST /api/auth/login`
```json
// Request
{ "email": "alice@example.com", "password": "securepass123" }

// 200 OK  →  sets cookie: token=<jwt>  (httpOnly, secure, sameSite=strict)
{ "success": true, "user": { "_id": "64f1...", "name": "Alice", "email": "alice@example.com" } }

// 401 Unauthorized
{ "success": false, "message": "Invalid email or password." }

// 429 Too Many Requests  (7 failed attempts from same IP + email)
{ "success": false, "message": "Too many failed attempts. 9 minutes baad try karo.", "retryAfter": 540 }
```

---

### AI Chat — `/api/ai`

All routes require a valid JWT cookie (`protect` middleware).

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/ai/chat` | ✓ | Send message, receive AI reply |
| `GET` | `/api/ai/history/:chatId` | ✓ | Fetch message history |
| `DELETE` | `/api/ai/message/:messageId` | ✓ | Delete a single message |
| `DELETE` | `/api/ai/history/:chatId` | ✓ | Clear all messages in a chat |

#### `POST /api/ai/chat`

Accepts **JSON** (text only) or **multipart/form-data** (with files).

```json
// JSON request — chatId optional (omit to create new chat)
{ "message": "Explain Redis caching.", "chatId": "64f1a2b3..." }

// 201 Created
{
  "success": true,
  "chat":        { "_id": "64f1...", "title": "Explain Redis caching.", "messageCount": 4 },
  "userMessage": { "_id": "64f2...", "role": "user",      "content": "Explain Redis caching." },
  "aiMessage":   { "_id": "64f3...", "role": "assistant", "content": "Redis is an in-memory..." }
}
```

```
// Multipart request
Content-Type: multipart/form-data

Fields:  message  (string, optional if files present)
         chatId   (string, optional)
Files:   files[]  (image/* | application/pdf | text/*)
```

> If `chatId` is omitted, the backend creates a new Chat document. The client must read `data.chat._id` from the response and send it on all subsequent messages to continue the same conversation.

#### `GET /api/ai/history/:chatId`
```json
// 200 OK
{
  "success": true,
  "source": "cache",
  "messages": [
    { "_id": "...", "role": "user",      "content": "Hello",     "createdAt": "2024-01-15T10:00:00Z" },
    { "_id": "...", "role": "assistant", "content": "Hi there!", "createdAt": "2024-01-15T10:00:01Z" }
  ]
}

// 404 — wrong userId or chat doesn't exist
{ "success": false, "message": "Chat not found" }
```

---

## Security

### JWT Auth Flow

```
Client                              Server
  │                                   │
  │── POST /api/auth/login ──────────►│
  │   { email, password }             │
  │                                   ├─ 1. Check rate limit  (IP + email key)
  │                                   ├─ 2. User.findOne({ email })
  │                                   ├─ 3. bcrypt.compare(password, hash)
  │                                   │
  │                      fail ────────┤─ 4a. recordFailedAttempt → return 401
  │                                   │
  │                   success ────────┤─ 4b. clearFailedAttempts
  │                                   ├─ 5.  sign JWT  { userId }
  │◄── Set-Cookie: token=<jwt> ───────┤      httpOnly · secure · sameSite=strict
  │                                   │
  │── GET /api/ai/history/:id ───────►│
  │   Cookie: token=<jwt>             ├─ 6. verify JWT → extract userId
  │                                   ├─ 7. Chat.findOne({ _id, userId })
  │                                   │      ↑ ownership check on every query
  │◄── { messages } ─────────────────┤
```

### Security Checklist

- [x] Passwords hashed with **bcrypt** — cost factor 12
- [x] JWT stored in **httpOnly cookie** — inaccessible to JavaScript (XSS safe)
- [x] `secure: true` in production — transmitted over HTTPS only
- [x] `sameSite: strict` — blocks cross-site request forgery
- [x] Every data route verifies **`userId` ownership** before any DB access
- [x] Auth rate limit keyed by **`IP + email`** — not IP alone (NAT-safe)
- [x] Only **failed** login attempts count toward the limit
- [x] Rate limit counters in **Redis** — survive restarts, work across instances
- [x] Redis failures **never block requests** — fail open with logging
- [x] File uploads restricted by Multer (MIME type + size limits)
- [x] All secrets in `.env` — zero hardcoded credentials

---

## Performance & Caching

### Cache-Aside Pattern

```
GET /api/ai/history/:chatId
        │
        ▼
   Redis.get(key)
        │
   ┌────┴──────────────────────────────┐
  HIT                                MISS
   │                                   │
   ▼                                   ▼
Return JSON                     MongoDB.find()
source: "cache"                        │
                               Redis.set(key, TTL: 300s)
                                       │
                               Return JSON
                               source: "database"
```

### Cache Invalidation

Caches are invalidated **immediately** on any write — stale reads are never possible.

| Event | Redis Keys Deleted |
|-------|-------------------|
| Message sent | `messages:{chatId}` · `chats:user:{userId}` |
| Message deleted | `messages:{chatId}` |
| Chat cleared | `messages:{chatId}` |
| New chat created | `chats:user:{userId}` |

### Why 5-Minute TTL?

Chat history is read-heavy and write-infrequent. A 5-minute window handles the common pattern of reopening the same chat repeatedly (e.g., on mobile). Writes always invalidate immediately, so TTL only affects read-only access — stale data is never a risk.

---

## Rate Limiting

### Configuration

| Limiter | Key | Limit | Counts |
|---------|-----|-------|--------|
| `authLimiter` | `IP + email` | 7 per 10 min | Failed requests only |
| `aiChatLimiter` | `userId` (IP fallback) | 15 per 60 sec | All requests |

### Implementation

```javascript
// express-rate-limit + rate-limit-redis
export const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 7,
  keyGenerator: (req) => `auth:${req.ip}:${req.body?.email?.toLowerCase()}`,
  store: new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }),
  skipSuccessfulRequests: true,   // only failed logins count
});
```

### Why `IP + email` and not just IP?

Office networks, universities, and mobile carriers use NAT — many users share one public IP. A pure IP key would lock out an entire building because one user mistyped their password. `IP + email` scopes the limit to one account from one origin.

### Why `skipSuccessfulRequests: true`?

Without it, every login increments the counter — including successful ones. A user who logs in correctly 7 times gets locked out of their own account. This flag ensures only `4xx`/`5xx` responses count.

### Why Redis store?

The default in-memory store resets on every server restart and doesn't share state across multiple instances. Redis store persists counters durably and works in any deployment topology.

---

## Real-Time Communication

### Socket.IO Events

| Direction | Event | Payload | Description |
|-----------|-------|---------|-------------|
| Server → Client | `new_message` | `Message` object | Broadcast to chat room |
| Server → Client | `ai:token` | `{ token: string }` | Streaming chunk |
| Server → Client | `ai:done` | `{ chatId: string }` | Stream finished |
| Server → Client | `ai:error` | `{ message: string }` | Stream error |
| Client → Server | `ai:stop` | `{ chatId: string }` | Stop generation |

### Graceful REST Fallback

```
On login → connectSocket()
                │
         socket.connected?
          YES            NO
           │              │
    WebSocket path    REST path
    emit 'ai:chat'    POST /api/ai/chat
                      (identical response shape)
```

If Socket.IO fails, the client falls back to REST silently. Response handling is identical on both paths — the user sees no difference.

---

## Client (HTML/CSS/JS)

The client is a **static single-page application** — three files, no build toolchain, no dependencies to install.

```
client/
├── index.html   ~  300 lines   App shell, auth forms, chat layout
├── style.css    ~  600 lines   Full UI, responsive, dark theme, animations
└── app.js       ~ 1100 lines   All logic — auth, messaging, sockets, file handling
```

### Why no framework?

Frameworks solve problems of scale: component reuse across large teams, complex state trees, server-side rendering. This client has one page, one state object, and a clear data flow. Vanilla JS is the right tool — zero build time, instant load, nothing to patch or update, and every line is directly auditable.

### State Object

All runtime state lives in a single plain object:

```javascript
const state = {
  user,               // logged-in user object from /api/auth/me
  socket,             // Socket.IO instance (null if unavailable)
  currentSessionId,   // localStorage key for the active session
  currentChatId,      // MongoDB _id of the active backend chat
  chatSessions,       // array, index persisted in localStorage
  isStreaming,        // prevents double-sends during AI response
  attachedFiles,      // staged files pending upload
  stopRequested,      // true when Stop button clicked
  userScrolled,       // true = user scrolled up → pause auto-scroll
};
```

### Session & Chat ID Lifecycle

The client uses two IDs per conversation — a local session key and the backend's MongoDB `_id`. They are separate because the backend chat doesn't exist until the first message is sent.

```
New Chat → currentSessionId = 'sess_...'  (localStorage key, local only)
           currentChatId    = null

First message sent
        │
        ▼
POST /api/ai/chat  (no chatId in body — backend creates new Chat)
        │
        ▼
data.chat._id returned
        │
        ▼
session.chatId      = data.chat._id   ← saved to localStorage
state.currentChatId = data.chat._id

All subsequent messages
        │
        ▼
POST /api/ai/chat  { chatId: session.chatId }
Backend appends to the same Chat document
```

### Multi-Modal File Handling

Files are fully processed in the browser using the `FileReader` API before any network call:

```
User attaches file
        │
        ├─ Image  → readAsDataURL → base64
        │           Sent as base64 string in message context
        │
        ├─ PDF    → readAsDataURL → base64
        │           Extracted text sent inline in prompt
        │
        └─ Text   → readAsText → raw string
                    Embedded inline in prompt as fenced code block

All content assembled → POST /api/ai/chat  (backend → Groq API)
```

### Typewriter Effect

AI responses render character-by-character using a queue-drain loop — no `setInterval` drift:

```javascript
// Characters pushed into queue as response arrives
for (const ch of chunk) stream.typingQueue.push(ch);

// Drain loop: 3 characters per tick at 8ms ≈ 375 chars/sec
function drainTypingQueue() {
  if (!stream.typingQueue.length) { stream.typingTimer = null; return; }
  for (let i = 0; i < 3 && stream.typingQueue.length; i++)
    stream.buffer += stream.typingQueue.shift();
  stream.el.innerHTML = renderMarkdown(stream.buffer);
  stream.typingTimer = setTimeout(drainTypingQueue, 8);
}
```

---

## Design Decisions

**Why `httpOnly` cookie for JWT instead of `localStorage`?**
`localStorage` is readable by any JavaScript on the page — one XSS vulnerability exposes every user's token permanently. `httpOnly` cookies are invisible to scripts; the browser sends them automatically and they cannot be read or stolen by injected code.

**Why `IP + email` key for auth rate limiting?**
A pure IP key harms users sharing a network (offices, universities, NAT routers). A pure email key lets one IP hammer unlimited accounts. `IP + email` is the right granularity — one account, one origin, one counter.

**Why `skipSuccessfulRequests: true` on the auth limiter?**
Without it, every login — including correct ones — increments the counter. A user who logs in 7 times successfully would lock themselves out. This flag ensures only `4xx`/`5xx` responses count toward the limit.

**Why Redis for rate limit storage?**
In-memory counters reset on restart and don't work across multiple processes. Redis persists counters and is shared across all instances — correct behaviour in any deployment from a single server to a load-balanced cluster.

**Why cache-aside instead of write-through?**
Write-through would cache every sent message, most of which are never re-read within the TTL. Cache-aside only populates the cache on a read miss, matching the actual access pattern: history is fetched when a chat is opened, not on every send.

**Why vanilla JS for the client?**
One page. One state object. One data flow. A framework adds a build pipeline, a dependency tree to audit, and abstractions that solve problems this project doesn't have. Vanilla JS has zero supply-chain risk, loads instantly, and every line of logic is directly readable.

---

## Contributing

```bash
# 1. Fork and clone
git clone https://github.com/yourusername/nexus-ai.git

# 2. Create a feature branch
git checkout -b feat/your-feature-name

# 3. Commit with Conventional Commits
git commit -m "feat: add streaming token support"
git commit -m "fix: rate limit key collision on shared IP"
git commit -m "docs: update API reference for /history endpoint"

# 4. Push and open a Pull Request
git push origin feat/your-feature-name
```

Prefix guide: `feat` · `fix` · `docs` · `refactor` · `test` · `chore`

---

## License

MIT — see [LICENSE](LICENSE) for full text.

---

<div align="center">
  <sub>Node.js · Express · MongoDB · Redis · Socket.IO · Groq API</sub>
  <br><br>
  <a href="https://ai-nexus.oneapp.dev/">🌐 Live at NexusAi</a>
</div>
