# Auth Service — Bin E-Commerce

> Handles everything identity: register, login, token refresh, password reset, and email verification. This is the **only service that talks to the user credentials database** — all other services receive user identity via trusted headers injected by the API Gateway.

---

## What problem it solves

Authentication logic scattered across multiple services creates inconsistency, duplicated code, and a larger attack surface. The auth service centralises all identity operations behind a single dedicated NestJS service backed by PostgreSQL.

Downstream services never see raw JWTs. They receive `X-User-Id`, `X-User-Email`, and `X-User-Roles` headers that the API Gateway injects after verifying the token — so auth-service only needs to issue tokens, not verify them on every request.

---

## Architecture

```
API Gateway :3000
      │  @Public() routes only:
      │  POST /api/v1/auth/login
      │  POST /api/v1/auth/register
      │  POST /api/v1/auth/refresh
      │  POST /api/v1/auth/forgot-password
      │  POST /api/v1/auth/reset-password
      │  POST /api/v1/auth/verify-email
      │
      │  Protected routes (with X-User-Id header):
      │  GET  /api/v1/auth/me
      │  POST /api/v1/auth/logout
      │
      ▼
┌─────────────────────────────────────┐
│         Auth Service  :3001         │
│                                     │
│  ┌──────────────────────────────┐   │
│  │  ValidationPipe (global)     │   │
│  │  ThrottlerGuard (100/60s)    │   │
│  └──────────────┬───────────────┘   │
│                 │                   │
│  ┌──────────────▼───────────────┐   │
│  │       AuthModule             │   │  ← business logic (planned)
│  │  register / login / refresh  │   │
│  │  forgot-password / verify    │   │
│  └──────────────┬───────────────┘   │
│                 │                   │
│  ┌──────────────▼───────────────┐   │
│  │  TypeORM + PostgreSQL        │   │
│  │  users, refresh_tokens,      │   │
│  │  password_resets             │   │
│  └──────────────────────────────┘   │
│                                     │
│  ┌──────────────────────────────┐   │
│  │  Keycloak (token issuance)   │   │  ← RS256, ROPC flow
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

## Features

| Feature                | Detail                                                               |
| ---------------------- | -------------------------------------------------------------------- |
| **Token issuance**     | Delegates to Keycloak via ROPC — RS256 access tokens, 15 min expiry  |
| **Refresh tokens**     | 7-day rolling refresh tokens stored in Keycloak                      |
| **Password reset**     | Email-based reset flow                                               |
| **Email verification** | Post-registration verification link                                  |
| **Rate limiting**      | 100 requests / 60 s per real client IP via `@nestjs/throttler`       |
| **Trust proxy**        | `trust proxy = 1` — reads real client IP from `X-Forwarded-For`      |
| **Validation**         | Global `ValidationPipe` — whitelist, forbidNonWhitelisted, transform |
| **Database**           | PostgreSQL via TypeORM code-first, auto-migrations in dev            |
| **Health check**       | `GET /api/health` — liveness probe via `@nestjs/terminus`            |
| **Swagger**            | `GET /api/docs` — available in non-production only                   |
| **Graceful shutdown**  | SIGTERM/SIGINT handled cleanly                                       |

---

## Token Flow

```
POST /api/v1/auth/login  { email, password }
         │
         ▼
   AuthService.login()
         │
         ├── Validate credentials against local DB (bcrypt compare)
         │
         └── POST Keycloak ROPC endpoint
             /realms/bin-ecommerce/protocol/openid-connect/token
             grant_type=password, client_id=api-gateway
                  │
                  ▼
             Returns:
             {
               access_token:  eyJ...  (RS256, exp 15 min)
               refresh_token: eyJ...  (exp 7 days)
               expires_in:    900
             }
                  │
                  ▼
         Client stores tokens.
         Every subsequent request includes:
         Authorization: Bearer <access_token>
```

> **Key insight:** Auth-service issues tokens through Keycloak. The API Gateway verifies them independently using Keycloak's public keys (JWKS). Auth-service is never in the hot path for verification — only for issuance.
