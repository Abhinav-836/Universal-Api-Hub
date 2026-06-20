# 🚀 Universal API Hub

A production-grade, full-stack SaaS platform for managing, rate-limiting, and monetizing AI APIs — with a sleek dashboard, multi-key management, and a weighted request system.

### New Modules
- `GET /api/v1/news` - cached headlines and topic search
- `GET /api/v1/sports` - cached schedules and scores
- `POST /api/v1/llm/chat` - OpenAI-compatible chat completions

---

## ✨ Features

| Feature | Details |
|---------|---------|
| **Auth** | Argon2id + PEPPER password hashing, HttpOnly JWT cookies |
| **API Keys** | Multi-layer SHA-256/SHA-512 generation, stored hashed |
| **Plans** | Free / Pro / Premium with slot limits and daily quotas |
| **Rate Limiting** | Redis-backed, weighted API cost system |
| **Caching** | Redis caching for users, keys, and APIs |
| **Logging** | Winston with daily-rotate-file transport |
| **Security** | Helmet, CORS, IP abuse protection |
| **API Modules** | News, Sports, Weather, Vision, and OpenAI-compatible LLM chat |
| **Frontend** | React + Tailwind — dark, glassmorphic dashboard |

---

## 🏗 Project Structure

```
universal-api-hub/
├── backend/            Express API server
│   └── src/
│       ├── config/         PostgreSQL + Redis clients
│       ├── controllers/    Auth, User, API handlers
│       ├── middleware/      apiKeyAuth, rateLimiter, apiAccess, scope
│       ├── models/         User, ApiKey, Api (DB queries)
│       ├── routes/         auth.routes, api.routes
│       ├── services/       auth, apiKey, rateLimit, usage
│       └── utils/          hash, logger, constants
│
├── frontend/           React + Vite + Tailwind
│   └── src/
│       ├── components/     Navbar, ApiCard, UsageChart
│       ├── context/        AuthContext
│       ├── pages/          Login, Signup, Dashboard, ApiSelection
│       ├── services/       Axios, auth/dashboard/apiKey services
│       └── utils/          constants
│
├── database/
│   ├── schema.sql          Complete PostgreSQL schema
│   ├── seed.sql            Sample API entries
│   └── migrations/         001–005 individual migrations
│
└── docs/
    └── API.md              Full API reference
```

---

## ⚙️ Architecture Flow

Please refer to the [Architecture Guide](./docs/ARCHITECTURE.md) for a detailed breakdown of the middleware request lifecycle, Redis degraded mode resilience, and database single-source-of-truth configuration.

---

## 🛠 Setup & Deployment

Please refer to the [Deployment Guide](./docs/DEPLOYMENT.md) for strict production requirements, CI/CD pipeline details, and required environment variables.

---

## 🔐 Security

| Concern | Implementation |
|---------|---------------|
| Passwords | Argon2id (64MB memory, time=3, parallelism=4) + PEPPER |
| API Keys | HMAC-SHA256(userId:timestamp:randomBytes) → HMAC-SHA512 → base64url |
| Storage | Only SHA-256 hashes stored — raw keys never persisted |
| Transport | Helmet CSP, CORS restricted to FRONTEND_URL |
| Abuse | IP rate limit (200 req/15min), per-user daily weighted limits |
| Input | express-validator on all auth routes |
| State | HttpOnly strict cookies. No localStorage state exposure |

---

## 📊 Plan Limits & Cost Weights

| Plan    | Daily Requests | API Slots | Cost Calculation |
|---------|---------------|-----------|------------------|
| Free    | 10            | 2         | canonical pg cost|
| Pro     | 20            | 4         | canonical pg cost|
| Premium | 30            | Unlimited | canonical pg cost|

All API endpoints incur a cost tracked dynamically in the PostgreSQL `apis` table `cost_weight` column. This replaces legacy hardcoded config variables and unifies quota usage across the platform.

---

## 📡 Full Documentation

See [API Documentation](./docs/API.md) for comprehensive endpoint instructions, rate limiting headers, error codes, and request parameters.

---

## 📄 License

MIT — Build something great.

## 🚀 Quick Start

### 1. Clone & Install
```bash
git clone <repo>
cd universal-api-hub
npm install .
