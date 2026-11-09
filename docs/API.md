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
Starts a Razorpay payment for 30 days of a plan. The price is set on the server.

**Body:** `{ "plan": "pro" | "premium" }`

**Response 200:**
```json
{ "success": true, "checkout": { "orderId": "order_…", "amount": 49900, "currency": "INR", "keyId": "rzp_live_…", "plan": "premium", "days": 30 } }
```
The frontend opens Razorpay Checkout with this order.

### POST /api/user/checkout/verify
Called with what Checkout returns after a successful payment. The server checks the signature, then asks Razorpay that the payment is captured for this order and amount, then gives the plan.

**Body:** `{ "orderId": "order_…", "paymentId": "pay_…", "signature": "<hex>" }`

### GET /api/user/wallet
Your AI credit balance (paise), the top-up limits, and the last 20 top-ups and AI charges.

### POST /api/user/wallet/topup
Starts a Razorpay payment that adds credits. **Body:** `{ "amountInr": 250 }` (whole rupees, 50–10,000). Confirm it with `POST /api/user/checkout/verify`, the same as plans.

Paid AI calls on `/api/v1/*` report what they cost in the `X-Cost-INR` response header.

### POST /webhook/razorpay
Razorpay → server (`payment.captured`, `order.paid`), signed with `RAZORPAY_WEBHOOK_SECRET`. Not for direct calls.

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
Cost weight: **5** · Min plan: Pro · Provider: OpenRouter vision model (`OPENROUTER_MODEL_VISION`)

**Body:** `{ "imageUrl": "https://..." }` or `{ "imageBase64": "<base64 or data URL>" }`

`imageUrl` must be a direct, public link. `imageBase64` must be a PNG, JPEG, GIF or WebP image (checked from the bytes, max ~5 MB).

**Response:**
```json
{
  "success": true,
  "source": "openrouter",
  "model": "openai/gpt-4o-mini",
  "input": "url",
  "analysis": {
    "description": "A cat asleep on a grey sofa.",
    "labels": ["cat", "indoor", "furniture"],
    "objects": ["cat", "sofa", "cushion"],
    "text_detected": null,
    "people_count": 0
  }
}
```
`422` if the image can't be read (bad link, not an image). Not charged.

---

### POST /api/v1/translate
Cost weight: **2** · Min plan: Pro · Provider: OpenRouter (your plan's models)

**Body:** `{ "text": "Hello world", "targetLanguage": "es", "sourceLanguage": "auto" }`

Languages can be codes (`es`, `pt-BR`) or names (`Spanish`). `text` up to 5,000 characters.

**Response:**
```json
{
  "success": true,
  "source": "openrouter",
  "translation": { "original": "Hello world", "translated": "Hola mundo", "sourceLanguage": "en", "targetLanguage": "es" }
}
```

---

### POST /api/v1/sentiment
Cost weight: **2** · Min plan: Premium · Provider: OpenRouter

**Body:** `{ "text": "The update is fast but the new UI is confusing." }`

**Response:**
```json
{
  "success": true,
  "source": "openrouter",
  "sentiment": {
    "label": "mixed",
    "score": -0.1,
    "magnitude": 0.5,
    "emotions": ["satisfaction", "frustration"],
    "explanation": "Praises the speed but criticises the confusing UI."
  },
  "text_length": 47
}
```
`label` is one of `positive`, `negative`, `neutral`, `mixed`. `score` is −1 to 1, `magnitude` 0 to 1.

---

### POST /api/v1/summarize
Cost weight: **3** · Min plan: Premium · Provider: OpenRouter

**Body:** `{ "text": "<100–20,000 characters>", "maxLength": 150, "style": "paragraph" }`

`maxLength` is the target length in characters (50–1000). `style` is `paragraph` or `bullets`.

**Response:**
```json
{
  "success": true,
  "source": "openrouter",
  "summary": {
    "text": "Revenue grew 12% while costs fell.",
    "key_points": ["Revenue up 12%", "Costs down"],
    "word_count": { "original": 480, "summary": 6 },
    "reduction": "93%",
    "style": "paragraph"
  }
}
```
With `"style": "bullets"`, `summary.bullets` is an array and `summary.text` joins them as `•` lines.

---

### GET /api/v1/geocode
Cost weight: **1** · Min plan: Premium · Provider: OpenWeather Geocoding (uses `WEATHER_API_KEY`)

**Query:** `?address=Jamshedpur` (forward) or `?lat=22.80&lon=86.20` (reverse)

**Response (forward):**
```json
{
  "success": true,
  "source": "openweathermap",
  "type": "forward",
  "query": "Jamshedpur",
  "result": { "name": "Jamshedpur", "state": "Jharkhand", "country": "IN", "formatted_address": "Jamshedpur, Jharkhand, IN", "latitude": 22.80457, "longitude": 86.20288 },
  "results": [ "...up to 5 matches, best first" ]
}
```
Results are city / town level, not street addresses. `404` when nothing matches. Not charged.

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