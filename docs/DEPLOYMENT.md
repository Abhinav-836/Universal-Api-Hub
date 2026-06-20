# Universal API Hub Deployment Guide

## Pre-requisites
- Node.js >= 18
- PostgreSQL 15+
- Redis 7+
- Stripe Account (for webhooks)

## Production Checklist

### 1. Environment Variables
You MUST provide the following in your production environment. The application will intentionally CRASH on startup if critical secrets are missing:
- `DATABASE_URL`
- `REDIS_HOST`, `REDIS_PORT`
- `JWT_SECRET`, `API_KEY_SECRET`, `PEPPER`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

### 2. Database Migrations
Migrations are the absolute canonical source of truth for the schema.
- To execute safely in a clustered environment, run: `node scripts/migrate.js`
- The migration script utilizes **PostgreSQL Advisory Locks** to prevent concurrent execution corruption.

### 3. Stripe Webhooks
Stripe is the sole source of truth for billing status.
- Ensure the webhook endpoint is exposed at `https://yourdomain.com/webhook/stripe`.
- The backend relies on standard raw-body signature verification `stripe.webhooks.constructEvent` to prevent payload forgery.

### 4. Application Protection
- The Node.js application is intentionally restricted. You **must** deploy this application behind a reverse proxy (e.g., Nginx, AWS ALB, Cloudflare).
- Configure your proxy to enforce volumetric DDoS protection, as the internal IP rate limiter (`ipRateLimit`) is designed for application-layer abuse, not Layer 4 network attacks.

### 5. Rollback Procedures
- Database migrations append forward. In the event of a catastrophic failure, restore the PostgreSQL volume from your nearest Point-in-Time Recovery (PITR) snapshot.
