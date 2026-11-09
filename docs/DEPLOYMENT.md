# Universal API Hub Deployment Guide

## Pre-requisites
- Node.js >= 18
- PostgreSQL 15+
- Redis 7+
- Razorpay account (to take payments)

## Production Checklist

### 1. Environment Variables
You MUST provide the following in your production environment. The application will intentionally CRASH on startup if critical secrets are missing:
- `DATABASE_URL`
- `REDIS_HOST`, `REDIS_PORT`
- `JWT_SECRET`, `API_KEY_SECRET`, `PEPPER`
- Optional, to take payments: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`

### 2. Database Migrations
Migrations are the absolute canonical source of truth for the schema.
- To execute safely in a clustered environment, run: `node scripts/migrate.js`
- The migration script utilizes **PostgreSQL Advisory Locks** to prevent concurrent execution corruption.

### 3. Razorpay Webhook
- In Razorpay Dashboard → Webhooks, add `https://<your-backend>/webhook/razorpay` with the events `payment.captured` and `order.paid`, and a secret; put the same secret in `RAZORPAY_WEBHOOK_SECRET`.
- Every webhook is checked with HMAC-SHA256 over the raw body. Payments are also confirmed against Razorpay's API before a plan is given, and each order can only be fulfilled once.

### 4. Application Protection
- The Node.js application is intentionally restricted. You **must** deploy this application behind a reverse proxy (e.g., Nginx, AWS ALB, Cloudflare).
- Configure your proxy to enforce volumetric DDoS protection, as the internal IP rate limiter (`ipRateLimit`) is designed for application-layer abuse, not Layer 4 network attacks.

### 5. Rollback Procedures
- Database migrations append forward. In the event of a catastrophic failure, restore the PostgreSQL volume from your nearest Point-in-Time Recovery (PITR) snapshot.
