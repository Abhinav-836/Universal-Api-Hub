# Universal API Hub

One API key, many APIs. Sign up, pick a plan, choose which APIs you want, and call stocks, forex, crypto, weather, news, sports, LLM chat, translation, sentiment, summarization, image analysis and geocoding through a single gateway — with per-plan daily quotas, weighted request costs, scoped API keys and a usage dashboard.

**Live:** [universal-api-hub.vercel.app](https://universal-api-hub.vercel.app)

| | |
|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS, Three.js — deployed on Vercel |
| **Backend** | Node.js, Express, PostgreSQL, Redis — deployed on Render |
| **Payments** | Stripe Checkout + webhooks |
| **CI** | GitHub Actions: lint, dependency audit, backend + frontend tests, migration and seed checks against a real Postgres |

## How a request flows

```
GET /api/v1/stocks/quote?symbol=AAPL      X-API-Key: <your key>
  ─► IP rate limit
  ─► API key lookup (HMAC-SHA256 hash, never the raw key)
  ─► key scope: is this key allowed to call this API?
  ─► plan access: has the user selected this API, and does their plan include it?
  ─► daily quota: charge the API's cost weight (from the `apis` table)
  ─► provider chain ─► response + X-RateLimit-* headers ─► usage logged
```

When a provider key isn't configured, responses are clearly labelled `"source": "mock"` and refund the quota they would have used. Failed calls (4xx/5xx) are refunded too.

## APIs

| API | Endpoint | Cost | Min plan | Provider |
|---|---|---|---|---|
| Stock quote | `GET /api/v1/stocks/quote` | 2 | Free | Finnhub → Alpha Vantage → Yahoo Finance |
| Stock search | `GET /api/v1/stocks/search` | 1 | Free | Finnhub → Alpha Vantage → Yahoo Finance |
| Forex | `GET /api/v1/forex` | 2 | Free | Alpha Vantage → Frankfurter (ECB) → Yahoo Finance |
| Crypto | `GET /api/v1/crypto` | 2 | Free | Coinbase → Alpha Vantage → Yahoo Finance |
| Weather | `GET /api/v1/weather` | 1 | Free | OpenWeatherMap |
| News | `GET /api/v1/news` | 2 | Free | NewsAPI (cached 5 min) |
| AI chat | `POST /api/v1/chat` | 3 | Free | OpenRouter |
| Sports | `GET /api/v1/sports` | 2 | Pro | SportsDataIO (cached 1 min) |
| LLM chat (OpenAI-compatible) | `POST /api/v1/llm/chat` | 5 | Premium | OpenRouter |
| Translate | `POST /api/v1/translate` | 2 | Pro | OpenRouter |
| Image analysis | `POST /api/v1/image/analyze` | 5 | Pro | OpenRouter vision model |
| Sentiment | `POST /api/v1/sentiment` | 2 | Premium | OpenRouter |
| Summarize | `POST /api/v1/summarize` | 3 | Premium | OpenRouter |
| Geocoding | `GET /api/v1/geocode` | 1 | Premium | OpenWeather Geocoding (city level) |

Every API except market data returns labelled demo data (and charges no quota) when its provider key isn't set, so a fresh install still works end to end. Market data is different: it never returns made-up numbers — an unknown symbol is a `404`, and if every provider is down you get a `503`.

## Plans

| | Free | Pro | Premium |
|---|---|---|---|
| Daily quota (weighted) | 10 | 50 | 200 |
| API slots | 2 | 8 | every API |
| API switches per day | 2 | 5 | unlimited |
| LLM models | `OPENROUTER_MODEL_FREE` | `OPENROUTER_MODEL_PRO` | `OPENROUTER_MODEL_ALL` |

A call costs its API's weight, so on Free you could make 10 weather calls or 3 AI chats a day. Upgrades go through Stripe Checkout. While `BETA_FREE_UPGRADES` is `true` (the default), plans can be switched without paying.

## Security

- **Passwords** — Argon2id (64 MB memory, 3 iterations, parallelism 4) plus a server-side pepper
- **API keys** — generated from random bytes with HMAC-SHA256 → HMAC-SHA512, shown once, stored only as an HMAC-SHA256 hash; each key can be scoped to specific APIs and revoked
- **Sessions** — JWT in HttpOnly cookies (a `Bearer` header also works)
- **Abuse limits** — per-IP limits on `/api` and `/auth`, plus `IP_RATE_LIMIT_MAX` (default 200) on `/api/v1`, on top of the per-user daily quota
- **Transport** — Helmet, CORS restricted to `FRONTEND_URL`, request validation with express-validator

## Run locally

Needs Node 20+, PostgreSQL and Redis.

```bash
git clone https://github.com/Abhinav-836/Universal-Api-Hub.git
cd Universal-Api-Hub/backend
npm install
```

Create `backend/.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/universal_api_hub
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=a-long-random-string
PEPPER=another-long-random-string
API_KEY_SECRET=yet-another-long-random-string
FRONTEND_URL=http://localhost:5173

# Providers — add the ones you want live
FINNHUB_API_KEY=
ALPHA_VANTAGE_API_KEY=
WEATHER_API_KEY=
NEWS_API_KEY=
SPORTS_API_KEY=
OPENROUTER_API_KEY=
```

```bash
npm run setup      # runs migrations, then seeds the API catalogue
npm run dev        # http://localhost:5000
```

Frontend:

```bash
cd ../frontend
npm install
echo VITE_API_BASE=http://localhost:5000 > .env.local
npm run dev        # http://localhost:5173
```

Crypto (Coinbase), forex (Frankfurter) and Yahoo Finance need no key, so market data works even with an empty provider section.

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `JWT_SECRET`, `PEPPER`, `API_KEY_SECRET` | yes | The server refuses to start without them |
| `DATABASE_URL` (or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) | yes | `DB_SSL` for hosted Postgres |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | | Rate limiting and caching |
| `FRONTEND_URL` | | Allowed CORS origin |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_PREMIUM` | in production | Stripe webhook endpoint: `POST /webhook/stripe` |
| `GOOGLE_CLIENT_ID` | optional | Turns on "Continue with Google". OAuth client ID (type *Web application*) from Google Cloud Console, with the frontend URL under *Authorized JavaScript origins*. The frontend reads it from `GET /auth/config`, so nothing is needed on Vercel |
| `BETA_FREE_UPGRADES` | | `true` (default) lets users change plan without paying |
| `OPENROUTER_MODEL_FREE` / `_PRO` / `_ALL` | | Comma-separated model IDs per plan, tried in order (also used by translate, sentiment and summarize) |
| `OPENROUTER_MODEL_VISION` | | Comma-separated vision-capable models for image analysis. Default `openai/gpt-4o-mini` |
| `IP_RATE_LIMIT_MAX`, `IP_RATE_LIMIT_WINDOW_MS` | | Per-IP limit on `/api/v1` |

Frontend: `VITE_API_BASE` — the backend URL. Required in production.

More detail in [docs/API.md](docs/API.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Account API

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `POST /auth/refresh`, `POST /auth/change-password` |
| Dashboard | `GET /api/user/dashboard`, `GET /api/user/usage` |
| Plans | `GET /api/user/plans`, `GET /api/user/plan-features`, `POST /api/user/select-plan`, `POST /api/user/checkout` |
| APIs | `GET /api/user/apis`, `POST /api/user/apis/select`, `DELETE /api/user/apis/:apiId` |
| Keys | `GET /api/user/keys`, `POST /api/user/keys`, `DELETE /api/user/keys/:keyId`, `PATCH /api/user/keys/:keyId/scopes` |

## Tests

```bash
cd backend && npm test        # Jest: app, billing, Stripe
cd frontend && npm test       # Vitest
```

## Project structure

```
backend/src/
  routes/        auth, user (dashboard, plans, keys), api (/v1/*)
  middleware/    API key auth, scopes, plan access, rate limiting
  services/      market, news, sports, llm, AI tools, geocoding, api keys, usage, rate limits
  controllers/   request handlers
  config/        Postgres, Redis, JWT, env validation
database/        schema.sql, seed.sql, migrations 001–007
frontend/src/    landing page, playground, dashboard, API selection, auth
docs/            API reference, architecture, deployment
```

---

Built by **Abhinav Ashutosh** · [GitHub](https://github.com/Abhinav-836)