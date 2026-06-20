# Universal API Hub — API Reference

## Base URL
```
https://yourdomain.com
```

## Authentication

### JWT (Dashboard routes)
Authentication is handled automatically via HttpOnly cookies (`jwt`) set upon login.
No explicit `Authorization` header is required for dashboard routes.

### API Key (API routes)
```
X-API-Key: uhb_<your_api_key>
```

---

## Auth Endpoints

### POST /auth/register
Register a new user.

**Body:**
```json
{ "email": "user@example.com", "username": "myuser", "password": "Str0ngPass!" }
```

**Response 201:**
```json
{ "success": true, "user": { "id": "uuid", "email": "...", "username": "...", "plan": "free" } }
```

---

### POST /auth/login
**Body:** `{ "email": "...", "password": "..." }`

**Response 200:**
```json
{ "success": true, "user": { "id": "...", "plan": "free" } }
```
*(Also sets `jwt` HttpOnly cookie)*

---

### GET /auth/me
Returns current user. Requires active session cookie.

---

## User / Dashboard Endpoints (Cookie required)

### GET /api/user/dashboard
Returns full dashboard data: usage, stats, APIs, keys, recent logs.

### GET /api/user/usage
Returns daily usage counters.

### GET /api/user/apis
Returns all APIs with `selected`, `accessible`, `locked` flags.

### POST /api/user/apis/select
**Body:** `{ "apiId": "uuid" }`

### DELETE /api/user/apis/:apiId
Remove an API from your selection.

### POST /api/user/checkout
Creates a real Stripe Checkout Session for plan upgrades.

**Body:** `{ "plan": "pro" | "premium" | "free" }`

**Response 200:**
```json
{ "success": true, "url": "https://checkout.stripe.com/..." }
```

### POST /webhook/stripe
Stripe webhook endpoint for subscription state synchronization. (Not for direct user calling).

---

## API Key Management (Cookie required)

### GET /api/keys
List all your API keys.

### POST /api/keys
Create a new API key.

**Body:**
```json
{
  "label": "Production Key",
  "keyType": "prod",
  "scopedApis": ["chat", "weather"],
  "expiresAt": "2025-12-31T23:59:59Z"
}
```

**Response 201:** Returns `rawKey` (shown once only), metadata.

### DELETE /api/keys/:keyId
Revoke an API key.

### PATCH /api/keys/:keyId/scopes
**Body:** `{ "scopedApis": ["chat"] }`

---

## API Endpoints (API Key required)

All endpoints require `X-API-Key` header.

### Rate Limit Headers
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Used: 3
X-RateLimit-Reset: 2024-06-01T00:00:00.000Z
X-RateLimit-Warning: "You have used 85% of your daily limit"
```

---

### POST /api/v1/chat
Cost weight: **3**

**Body:** `{ "message": "Hello, world!", "context": "optional context" }`

**Response:**
```json
{ "success": true, "reply": "...", "model": "gpt-3.5-turbo", "tokens": {...} }
```

---

### POST /api/v1/image/analyze
Cost weight: **5**

**Body:** `{ "imageUrl": "https://..." }` or `{ "imageBase64": "base64string" }`

**Response:**
```json
{
  "success": true,
  "analysis": {
    "description": "...",
    "tags": ["..."],
    "objects": [{ "label": "...", "confidence": 0.94 }],
    "dominant_colors": ["#hex"],
    "safe_search": { "adult": "VERY_UNLIKELY" }
  }
}
```

---

### GET /api/v1/weather
Cost weight: **1**

**Query params:** `?city=London` or `?lat=51.5&lon=-0.12&units=metric`

**Response:**
```json
{
  "success": true,
  "weather": {
    "city": "London",
    "temperature": { "current": 15, "feels_like": 13, "unit": "°C" },
    "description": "Partly cloudy",
    "humidity": 72,
    "wind": { "speed": 5.1, "direction": "SW" }
  }
}
```

---

### GET /api/v1/news
Cost weight: **2**

**Query params:** `?q=ai&category=technology&country=us&pageSize=10&page=1`

**Response:**
```json
{
  "success": true,
  "news": {
    "source": "newsapi",
    "query": { "q": "ai", "category": "technology", "country": "us", "pageSize": 10, "page": 1 },
    "totalResults": 120,
    "articles": [
      {
        "id": "https://example.com/article",
        "title": "AI story headline",
        "description": "Short summary",
        "source": "Example News",
        "url": "https://example.com/article",
        "publishedAt": "2026-04-23T12:00:00.000Z"
      }
    ]
  }
}
```

---

### GET /api/v1/sports
Cost weight: **2**

**Query params:** `?league=soccer&team=Arsenal&date=2026-04-23&pageSize=10`

**Response:**
```json
{
  "success": true,
  "sports": {
    "source": "mock",
    "query": { "league": "soccer", "team": "Arsenal", "date": "2026-04-23", "pageSize": 10 },
    "events": [
      {
        "id": "mock-sports-1",
        "league": "soccer",
        "homeTeam": "Arsenal",
        "awayTeam": "Platform United",
        "startTime": "2026-04-23T18:00:00Z",
        "status": "scheduled"
      }
    ]
  }
}
```

---

### POST /api/v1/llm/chat
Cost weight: **5**

**Body:** `{ "message": "Summarize today's API traffic", "system": "You are a helpful assistant." }`

**Response:**
```json
{
  "success": true,
  "reply": "Here is a summary...",
  "model": "gpt-4o-mini",
  "usage": { "prompt_tokens": 34, "completion_tokens": 88, "total_tokens": 122 },
  "finishReason": "stop",
  "source": "llm"
}
```

---

## Error Responses

```json
{ "success": false, "error": "Human-readable error message" }
```

| Code | Meaning |
|------|---------|
| 400  | Bad Request / Validation Error |
| 401  | Unauthorized (missing/invalid credentials) |
| 403  | Forbidden (no access to this API) |
| 404  | Not Found |
| 409  | Conflict (duplicate email/username, key limit) |
| 429  | Rate Limit Exceeded |
| 500  | Server Error |

---

## Plan Limits

| Plan    | Daily Requests | API Slots | Cost Weights Count |
|---------|---------------|-----------|-------------------|
| Free    | 10            | 2         | Uses weighted cost |
| Pro     | 20            | 4         | Uses weighted cost |
| Premium | 30            | Unlimited | Uses weighted cost |

### API Cost Weights
| API             | Weight |
|-----------------|--------|
| /v1/weather     | 1      |
| /v1/translate   | 2      |
| /v1/news        | 2      |
| /v1/sports      | 2      |
| /v1/sentiment   | 2      |
| /v1/chat        | 3      |
| /v1/summarize   | 3      |
| /v1/ocr         | 4      |
| /v1/image/analyze | 5    |
| /v1/llm/chat    | 5      |
