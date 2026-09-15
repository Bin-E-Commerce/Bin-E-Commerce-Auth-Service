<p align="center">
  <img src="https://raw.githubusercontent.com/Bin-E-Commerce/Bin-E-Commerce-UI-Web/main/public/images/logo/logo_background_white.png" alt="Bin E-Commerce" width="190" />
</p>

<h1 align="center">Auth Service</h1>

<p align="center">
  Give every request a verified identity, the right permissions, and a secure path through Bin E-Commerce.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white" alt="NestJS 11" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-TypeORM-336791?logo=postgresql&logoColor=white" alt="PostgreSQL and TypeORM" />
  <img src="https://img.shields.io/badge/Keycloak-OIDC-4D4D4D?logo=keycloak&logoColor=white" alt="Keycloak OIDC" />
  <img src="https://img.shields.io/badge/Redis-OTP%20%2F%20sessions-DC382D?logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/Kafka-events-231F20?logo=apachekafka&logoColor=white" alt="Kafka" />
</p>

## Contents

1. [Problem](#1-problem)
2. [Service at a glance](#2-service-at-a-glance)
3. [What it owns](#3-what-it-owns)
4. [Architecture](#4-architecture)
5. [Trust surface](#5-trust-surface)
6. [See It Work](#6-see-it-work)
7. [Install](#7-install)
8. [Authentication Flow](#8-authentication-flow)
9. [Authorization and Access Profiles](#9-authorization-and-access-profiles)
10. [Session Lifecycle](#10-session-lifecycle)
11. [API Surface](#11-api-surface)
12. [Internal Contracts](#12-internal-contracts)
13. [Event-Driven Integration](#13-event-driven-integration)
14. [Data Model](#14-data-model)
15. [Project Structure](#15-project-structure)
16. [Configuration Reference](#16-configuration-reference)
17. [Development](#17-development)
18. [Testing Strategy](#18-testing-strategy)
19. [Security and Privacy](#19-security-and-privacy)
20. [Operational Notes](#20-operational-notes)
21. [Documentation Findings](#21-documentation-findings)
22. [FAQ](#22-faq)
23. [Ownership](#23-ownership)

## 1. Problem

Authentication in a commerce platform is more than checking a username and password. The platform also needs verified identity, password recovery, OTP challenges, refresh-session management, profile data, saved addresses, role assignment and permission-aware navigation.

Without a dedicated owner, every microservice starts to make its own assumptions:

- One service trusts a role claim while another reads a database role.
- A revoked session remains usable because only the access token was checked.
- A seller is approved but does not receive seller access consistently.
- Admin permission changes are impossible to audit or invalidate safely.
- Internal services accept user identity directly from an untrusted browser.

Auth Service centralizes these responsibilities. Keycloak provides the identity protocol and token issuer; Auth Service owns platform user data, sessions, role assignment, permission grants and the internal profile contracts consumed by the rest of the system.

The API Gateway is the browser-facing edge. Auth Service remains the source of truth behind that edge and must still protect sensitive internal controllers.

## 2. Service at a glance

| Attribute | Value |
| --- | --- |
| Service | auth-service |
| Default port | 3002 |
| HTTP prefix | /api |
| URI version | v1 |
| Development docs | /docs |
| Health endpoint | /api/health |
| Primary database | PostgreSQL + TypeORM |
| Identity provider | Keycloak, realm bin-ecommerce |
| Short-lived state | Redis |
| Event transport | Kafka |
| Architecture role | Identity, account and authorization owner |

### Runtime responsibilities

Auth Service answers three questions for the platform:

1. Who is this user?
2. Which sessions and profile data belong to this user?
3. Which roles and permissions are currently effective for this user?

It does not own products, carts, orders, shipments or recommendation ranking.

## 3. What it owns

| Domain boundary | Auth Service owns |
| --- | --- |
| User identity | Local user profile, Keycloak mapping, account status and timestamps |
| Account access | Registration, login orchestration, refresh and logout |
| Verification | OTP challenge creation, expiry and verification |
| Password lifecycle | Forgot-password, reset-password and change-password flows |
| Sessions | Refresh-token records, active-session listing and revocation |
| Profile | Name, email-facing profile data, avatar reference and addresses |
| Authorization | Roles, permissions, navigation items and role assignments |
| Governance | Permission audit logs and access-profile versioning |
| Internal directory | Trusted profile, email, address and activity lookups |

### Ownership map

| Concern | Source of truth |
| --- | --- |
| OIDC identity and token signing | Keycloak |
| Platform profile and account status | Auth Service PostgreSQL |
| Current role/permission grants | Auth Service PostgreSQL, with Redis optimization |
| Product/shop/order data | Their respective domain services |
| Browser request admission | API Gateway |

Keycloak and Auth Service are complementary. Keycloak does not replace Auth Service's domain data, and Auth Service does not duplicate the entire identity provider.

## 4. Architecture

~~~text
                 +----------------+
 Browser ------> | API Gateway     |
                 +--------+-------+
                          |
                          | trusted user context
                          v
                 +----------------+
                 | Auth Service    |
                 +--+-----+-----+--+
                    |     |     |
                    v     v     v
              PostgreSQL Redis Kafka
                    |
                    v
                 Keycloak
~~~

### Boundary responsibilities

- Keycloak handles OIDC identity, token issuance and provider-level user administration.
- Auth Service orchestrates application flows and owns local profile/session/access state.
- API Gateway verifies bearer tokens and asks Auth Service for current access context.
- Kafka carries selected domain events such as approved seller applications.
- Redis supports OTP/session/access-cache workloads that do not replace PostgreSQL truth.

### Bootstrap behavior

The service starts an HTTP application and a Kafka consumer in the same process. The current bootstrap starts all microservices before opening the HTTP listener so the seller-role synchronization consumer is ready before traffic is accepted.

## 5. Trust surface

<details>
<summary>What Auth Service trusts and rejects</summary>

### Trusted after validation

- A Keycloak token with a valid signature, issuer and expected claims.
- A user context forwarded by the trusted Gateway or a protected internal caller.
- Internal service requests carrying the configured service token.
- Kafka events that pass schema/business validation.
- Database state written through the application services and migrations.

### Never trusted directly

- Role, permission or user ID supplied in a browser body.
- An arbitrary internal user ID without the internal-service guard.
- A client-selected refresh-token owner.
- A provider callback that has not passed its contract checks.
- A stale cache entry as the final authorization decision.

The distinction between the Keycloak subject and the local PostgreSQL UUID is important. Gateway context uses the Keycloak subject; the application layer resolves that subject to the local user record before operating on local entities.

</details>

## 6. See It Work

### 6.1. Start the service

~~~powershell
cd services/auth-service
Copy-Item .env.example .env
npm install
npm run dev
~~~

The local process expects PostgreSQL, Redis, Kafka and Keycloak to be reachable using the values in .env.

### 6.2. Check health and OpenAPI

~~~powershell
curl http://localhost:3002/api/health
~~~

Open http://localhost:3002/docs in development. Swagger documents the versioned HTTP contract and supports bearer authorization where the controller exposes it.

### 6.3. Walk through registration

~~~powershell
curl -X POST http://localhost:3002/api/v1/auth/register/initiate -H "Content-Type: application/json" -d '{"email":"user@example.com"}'
~~~

The exact payload must match RegisterInitiateDto. The expected flow is initiate challenge, verify challenge, then authenticate. When the browser uses the platform, call the same route through API Gateway.

### 6.4. Verify the current access profile

~~~powershell
curl http://localhost:3002/api/v1/auth/me -H "x-user-id: <keycloak-subject>"
~~~

This direct example is for local contract inspection only. Production traffic should arrive through a trusted Gateway/internal boundary, not by allowing a browser to set x-user-id.

## 7. Install

> [!IMPORTANT]
> Auth Service is stateful and security-sensitive. It requires Keycloak, PostgreSQL, Redis and Kafka. Put client secrets, database passwords, Redis credentials and internal service tokens in a secret manager or deployment secret, never in source control.

### Required dependencies

| Dependency | Why it is required |
| --- | --- |
| Keycloak | OIDC identity, token issuance and admin client operations |
| PostgreSQL | User, address, session, role, permission and audit persistence |
| Redis | OTP/session support and access-cache workloads |
| Kafka | Seller approval event consumption and internal event publishing |

### Local setup

~~~powershell
cd services/auth-service
Copy-Item .env.example .env
npm run type-check
npm run build
npm run start
~~~

### Recovery and rollback

Rolling back application code does not revoke already-issued sessions or undo a role assignment. Use explicit session revocation, access-control changes and forward migrations for operational rollback. Never repair production authorization by editing rows without an audit trail.

## 8. Authentication Flow

### 8.1. Registration and OTP

~~~text
Client -> register/initiate
       -> Auth Service creates OTP challenge
       -> Redis/short-lived store
       -> verification delivery
Client -> register/verify
       -> validate OTP and expiry
       -> create/synchronize identity
       -> return auth response
~~~

OTP is a short-lived challenge, not a permanent account credential. Expired or already-consumed challenges must be rejected.

### 8.2. Login and refresh

~~~text
Client -> login
       -> Keycloak/auth provider validation
       -> local user/profile resolution
       -> persist refresh-session metadata
       -> return access/refresh contract

Client -> refresh
       -> validate refresh/session state
       -> rotate or renew provider token
       -> update session activity
       -> return current profile/access context
~~~

The local refresh-token entity makes session management visible to Auth Service: users can list sessions, mark the current one and revoke other sessions.

### 8.3. Recovery

Forgot-password and reset-password are separate steps. The reset token/challenge must be validated by the owning flow; Auth Service must not reveal whether an arbitrary email is registered through a distinguishable response.

### 8.4. Social authentication

Social routes start or complete a provider-specific flow. Callback URLs are configured through environment values and must be allow-listed by the provider and deployment environment.

## 9. Authorization and Access Profiles

Authentication establishes identity. Authorization builds the current access profile from server-side grants.

~~~text
Keycloak subject
      -> local user
      -> active role assignments
      -> role-permission joins
      -> permission grants
      -> navigation items
      -> access profile + permissionVersion
~~~

### Access-profile contract

The profile returned by Auth Service can contain:

- Current user identity and role.
- Effective permission codes.
- Permission grants and scope metadata.
- Navigation data for the consuming surface.
- A permission version used by callers to detect stale cache.

Gateway forwards this trusted context to downstream services. A service should not reconstruct a second, conflicting permission model from a raw role string.

### Admin access control

The access-control module exposes an admin overview and role-permission update operation. Updates must:

- Check the read/update permission separately.
- Resolve role and permission records from PostgreSQL.
- Be idempotent for the same role/permission/scope combination.
- Protect critical administrator access from accidental self-lockout.
- Write permission audit data.
- Invalidate access cache after database state changes.

### User role changes

Admin user management can update role and account status. A user must not change their own role through the admin operation. Seller approval is a separate event-driven role-assignment path and must remain idempotent.

## 10. Session Lifecycle

### Session data

The refresh-token/session record supports active-session listing, last activity, expiry, revocation timestamp and revocation reason. The user-facing session response intentionally exposes safe metadata rather than tokens.

### Revocation rules

- A user can revoke another owned session.
- The current session is revoked through logout, not by the “revoke another session” operation.
- Logout-other-sessions preserves the current session and revokes the rest.
- Logout-all revokes every session owned by the actor.
- Expired or revoked sessions must not be treated as active.

### Why this boundary matters

Keycloak token validity alone is not enough for product session UX. The local session record enables device/session management, activity display and explicit revocation behavior without exposing refresh secrets.

## 11. API Surface

All application routes use /api/v1. Health is exposed at /api/health.

### Authentication

| Method | Route | Purpose |
| --- | --- | --- |
| POST | /auth/register/initiate | Start registration verification |
| POST | /auth/register/verify | Verify registration challenge |
| POST | /auth/login | Authenticate |
| POST | /auth/refresh | Refresh authentication context |
| GET | /auth/me | Read current auth profile |
| POST | /auth/logout | End current session |
| GET/POST | /auth/social/start/:provider, callback | Social provider flow |
| POST | /auth/forgot-password | Start password recovery |
| POST | /auth/reset-password | Complete password reset |
| POST | /auth/change-password | Change authenticated password |

### Account and administration

| Area | Routes |
| --- | --- |
| User profile | GET/PUT /users/me |
| Addresses | GET/POST /users/me/addresses, PUT/DELETE /users/me/addresses/:id |
| User sessions | GET /users/me/sessions, DELETE sessions and session/:id |
| Admin users | GET /admin/users, PUT /admin/users/:id/role, status |
| Access control | GET /auth/access-control/admin/overview, PATCH role permissions |
| Health | GET /health |

### Session actions

| Method | Route | Purpose |
| --- | --- | --- |
| GET | /auth/sessions | List sessions from auth context |
| POST | /auth/sessions/:sessionId/revoke | Revoke one session |
| POST | /auth/sessions/logout-others | Revoke other sessions |
| POST | /auth/sessions/logout-all | Revoke all sessions |

The API Gateway may expose a subset or mapped version of these routes. Check Gateway route metadata before calling Auth Service directly from a client.

## 12. Internal Contracts

The internal users controller is protected by InternalServiceGuard and serves trusted service-to-service use cases:

| Route family | Consumer purpose |
| --- | --- |
| PUT /internal/users/avatar | Media updates user avatar reference |
| GET /internal/users/addresses/:addressId | Order/shipping address ownership lookup |
| GET /internal/users/:userId/email | Notification recipient resolution |
| GET /internal/users/public-profiles | Public-facing profile projection |
| GET /internal/users/recommendation-profiles | Recommendation account projection |
| GET /internal/users/:userId/activity | Minimal activity timestamp for seller/admin surfaces |

The internal token is an admission check, not a replacement for domain authorization. Callers still need to send the correct actor/context and must not use internal access to bypass ownership rules.

## 13. Event-Driven Integration

### Seller approval

~~~text
Seller Service approves application
       -> Kafka seller-application event
       -> Auth Service consumer
       -> upsert SELLER role assignment
       -> invalidate access cache
       -> mirror role where required by Keycloak integration
~~~

The upsert key makes a redelivered approval event safe. Database assignment remains the dynamic authorization source; provider role mirroring supports future token issuance.

### Producer boundary

KafkaProducerService owns broker connection and publishing. Domain application services decide what event means; the transport class should not contain seller or permission business rules.

### Event failure behavior

| Failure | Expected behavior |
| --- | --- |
| Duplicate approval event | No duplicate role assignment |
| Unknown Keycloak user | Log/reject clearly; do not grant a role to another user |
| Cache invalidation failure | Keep database change; alert and reconcile cache |
| Kafka reconnect | Resume consumer without silently losing acknowledged work |

## 14. Data Model

~~~text
User
├── UserAddress[]
├── RefreshToken[]
└── UserRoleAssignment[]

AccessRole
└── RolePermission
    └── AccessPermission

NavigationItem
PermissionAuditLog
OtpChallenge
~~~

### Persistence entities

The database currently includes user, user-address, refresh-token, OTP challenge, access role, access permission, role-permission, user-role assignment, navigation item and permission audit log entities.

### Identifier rule

Keycloak subject and local user UUID are different identifiers. Resolve the subject at the application boundary; never query a local UUID column with an unverified provider subject by accident.

### Schema changes

Migrations live under database/migrations. Local synchronization behavior exists in the current bootstrap for development, while production uses SSL configuration and should use controlled migration execution. Review this distinction before deployment.

## 15. Project Structure

~~~text
src/
├── main.ts                         # HTTP + Kafka bootstrap, validation, Swagger
├── app.module.ts                   # Database, Redis, Kafka and feature modules
├── common/config/                  # Helmet configuration
├── database/
│   ├── entities/                   # User, access-control, OTP and session entities
│   ├── migrations/                 # Versioned schema changes
│   └── redis/                      # Redis module/client
├── kafka/
│   ├── consumers/                  # Seller approval consumer
│   └── kafka-producer.service.ts   # Event publishing boundary
└── modules/
    ├── auth/
    │   ├── application/services/   # Auth, OTP, token and Keycloak admin services
    │   └── presentation/           # Auth controllers and DTOs
    ├── users/
    │   ├── application/services/   # Profile, session and role-assignment use cases
    │   └── presentation/           # Public, admin and internal controllers
    ├── access-control/
    │   ├── application/services/   # Profile build, cache, seed and policy changes
    │   └── presentation/           # Admin access-control controller/DTO
    └── health/
~~~

The intended dependency direction is presentation to application to infrastructure/database. Controllers should coordinate HTTP concerns; they should not own token rotation, role joins or transaction policy.

## 16. Configuration Reference

### Runtime and public URLs

| Variable | Purpose | Example |
| --- | --- | --- |
| NODE_ENV | Runtime mode and Swagger behavior | development |
| PORT | HTTP listener | 3002 |
| APP_VERSION | Application version metadata | 1.0.0 |
| FRONTEND_URL | Public web origin | http://localhost:5173 |
| SOCIAL_AUTH_CALLBACK_URL | Social callback allow-list target | http://localhost:5173/callback |

### Persistence and infrastructure

| Variable group | Variables |
| --- | --- |
| PostgreSQL | POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB |
| Redis | REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_DB |
| Kafka | KAFKA_BROKERS, KAFKA_GROUP_ID |
| Internal auth | INTERNAL_SERVICE_TOKEN |

### Keycloak clients

| Variable group | Variables |
| --- | --- |
| Realm | KEYCLOAK_URL, KEYCLOAK_REALM |
| Confidential client | KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET |
| Web client | KEYCLOAK_WEB_CLIENT_ID, KEYCLOAK_WEB_CLIENT_SECRET |
| Admin client | KEYCLOAK_ADMIN_CLIENT_ID, KEYCLOAK_ADMIN_CLIENT_SECRET |

Use [.env.example](./.env.example) as the canonical variable list. Never commit .env, real Keycloak secrets, database credentials, SMTP credentials or internal tokens.

## 17. Development

### Commands

| Command | Purpose |
| --- | --- |
| npm run dev | Start Nest watch mode |
| npm run build | Build the service |
| npm run start | Run the built artifact |
| npm run type-check | TypeScript validation without emit |
| npm run lint | ESLint source validation |
| npm test | Run Jest tests |
| npm run test:watch | Run Jest in watch mode |
| npm run test:cov | Generate coverage |
| npm run test:e2e | Run configured E2E suite |

### Recommended local gate

~~~powershell
npm run type-check
npm run lint
npm test -- --runInBand
npm run build
~~~

Keep Keycloak/PostgreSQL/Redis/Kafka test data isolated from personal development accounts. If a test modifies role or session state, use a disposable database or clean fixture.

## 18. Testing Strategy

### Unit tests

Test pure/application behavior without depending on live providers:

- OTP expiry, consumption and invalid-code behavior.
- Token/session rotation and revocation rules.
- Profile resolution from Keycloak subject to local UUID.
- Role-permission joins and access-profile versioning.
- Cache invalidation after role or permission mutation.
- Self-role-change protection and account status rules.
- Idempotent seller-role assignment.

### Integration tests

Use PostgreSQL/Redis/Kafka test infrastructure to verify:

- Migration/entity compatibility.
- Session ownership and concurrent revocation.
- Access-control audit writes.
- Consumer redelivery behavior.
- Internal-service guard and token comparison.

### E2E acceptance flow

~~~text
Given Keycloak, PostgreSQL, Redis and Kafka are healthy
When a user registers and verifies OTP
Then the account can authenticate and read its profile
When an admin changes a role-permission grant
Then the next access profile reflects the new permission
When a seller-approved event is delivered twice
Then exactly one active seller assignment exists
~~~

## 19. Security and Privacy

- Use Helmet security headers from the common configuration.
- Keep CORS/callback origins environment-specific.
- Store only the session metadata needed for revocation and UX; never expose refresh secrets in session responses.
- Hash/compare sensitive challenge material according to the application service contract.
- Do not reveal whether an arbitrary email exists during recovery.
- Treat Keycloak admin credentials and internal tokens as high-sensitivity secrets.
- Mask email, provider subject and session identifiers in operational logs where full values are unnecessary.
- Audit permission mutations with actor and before/after information.
- Rotate secrets without committing replacement values to repository files.

Security boundary is defense in depth: Gateway checks public request admission, Auth Service protects its own internal/admin operations, and application services enforce ownership.

## 20. Operational Notes

### Dependency health

Monitor:

- Keycloak availability and issuer/client configuration.
- PostgreSQL pool saturation, migration state and query latency.
- Redis latency and eviction/availability for OTP/session support.
- Kafka consumer lag, reconnects and seller approval failures.
- Access-cache invalidation errors and permission-version drift.

### Failure matrix

| Failure | Expected result |
| --- | --- |
| Keycloak unavailable | Authentication/provider operations fail clearly; no synthetic token |
| PostgreSQL unavailable | No successful user/permission mutation |
| Redis unavailable | OTP/session support may fail; never treat stale cache as authorization truth |
| Kafka unavailable | Consumer retries/reconnects; monitor unprocessed approval events |
| Expired OTP | Verification rejected; initiate a new challenge |
| Revoked session | Refresh/logout contract rejects or treats it as inactive |

### Deployment checklist

1. Verify realm/issuer and all Keycloak client secrets.
2. Apply database migrations with a controlled release step.
3. Verify Redis and Kafka connectivity before opening traffic.
4. Check health endpoint and a non-destructive profile lookup.
5. Confirm Gateway and internal callers share the expected internal token.
6. Confirm Swagger is not exposed in production.
7. Verify seller approval event consumption and access-profile cache invalidation.

## 21. Documentation Findings

The following are source/config facts worth verifying during deployment:

1. The current bootstrap enables TypeORM synchronization outside production, while production is configured for SSL. Treat local synchronization as development-only and use migrations for deployed databases.
2. The local Keycloak, Kafka and PostgreSQL values in .env.example are examples, not credentials suitable for shared or production environments.
3. Gateway identity uses a Keycloak subject while Auth Service queries local entities by the mapped local user ID. Integration tests should cover this conversion explicitly.
4. Admin access-control mutation is protected both at the Gateway boundary and inside Auth Service. Keeping both checks is intentional defense in depth.
5. Seller-role assignment has a TODO in the admin role mutation path for a user-role-changed event; do not assume every direct admin role update has the same event behavior as seller approval until that path is implemented.

This section documents current behavior and follow-up risks; it does not silently change runtime configuration.

## 22. FAQ

### Why use Keycloak and a local Auth database?

Keycloak provides a standard identity/token boundary. The local database stores platform-specific profile, role, permission, session and audit concepts that belong to Bin E-Commerce.

### Is a valid JWT enough to access every endpoint?

No. A valid JWT proves identity. The effective permission profile and route authorization still determine whether the operation is allowed.

### Why does Gateway call Auth Service for /me?

Because role and permission assignments can change after a token was issued. Auth Service returns the current server-side access context.

### Can a browser call internal/users directly?

It should not. The internal controller requires the internal service guard and is intended for trusted service-to-service calls.

### What happens when an approval event is delivered twice?

Seller-role assignment uses an upsert-style ownership key so redelivery does not create duplicate active assignments.

### Can I change permission by editing PostgreSQL manually?

Do not do this as a normal operation. Use the access-control API so audit logging and cache invalidation happen together.

## 23. Ownership

### Engineering

**Đào Ngọc Anh**

**Software Engineer**

[View portfolio](https://daongocanh.site)

Software Engineer responsible for the architecture, implementation, integration, and maintenance of this service.

### Architecture & API Design

**Đào Ngọc Anh**

Designed the identity boundary, Keycloak integration, session lifecycle, access-profile model, permission audit path, internal directory contracts, and event-driven seller role synchronization.
