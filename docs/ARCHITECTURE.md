# Universal API Hub Architecture

## Overview
Universal API Hub is a multi-tenant SaaS API gateway designed to meter, track, and provide access to a variety of underlying API services (LLMs, Weather, News, etc.) through a single unified API key.

## Component Stack
- **Frontend**: React + Vite + TailwindCSS.
- **Backend**: Node.js + Express.
- **Database**: PostgreSQL (Source of truth for all relations, plans, schemas, and API weights).
- **Cache & Resilience**: Redis (For idempotency, API key caching, rate limiting).

## Request Lifecycle
1. **Request Ingress**: Receives request at `/api/v1/*` endpoint.
2. **API Key Auth (`apiKeyAuth`)**: Validates `X-API-Key` header, caches and retrieves key from Redis.
3. **API Access Check (`apiAccessCheck`)**: Verifies user's active plan supports the requested API, checks if the user has explicitly selected it (if on Free/Pro), and attaches the canonical `cost_weight` from PostgreSQL.
4. **Rate Limiting (`userRateLimit`)**: Determines quota usage based on `req.apiCost`. Consults Redis.
5. **Validation (`checkValidation`)**: Checks payload size and schema (e.g. `express-validator`).
6. **Execution (`handler`)**: Invokes downstream API, deducts quota, sends response.
7. **Logging (`UsageService`)**: Asynchronously writes execution metrics to `usage_logs`.

## Resiliency & Degraded Mode
To ensure the platform never suffers a hard failure during caching layer outages:
- **Redis Outage**: The `userRateLimit` middleware will catch Redis connection errors and gracefully degrade into a **Local-Memory Emergency Cache**.
- **Degraded Quota**: During degraded mode, users bypass their normal Postgres-defined quotas and are placed into a strict local memory quota (10 requests per 30 seconds). This prevents unbounded abuse while keeping the platform functional.

## CI/CD Pipeline
- Pull Requests and merges to `main` trigger `.github/workflows/ci.yml`.
- **Quality Gates**: Requires 100% pass on ESLint, strict unit/integration tests (Jest/Vitest), and `npm audit --audit-level=high`.
- **Deployment Safety**: Generates ephemeral Postgres/Redis containers to validate all schema migrations and ensure the container orchestrator builds correctly.
