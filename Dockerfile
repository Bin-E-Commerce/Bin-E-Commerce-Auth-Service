# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root configs
COPY package.json ./
COPY tsconfig.base.json ./

# Copy service files
COPY services/auth-service/package.json ./services/auth-service/
COPY services/auth-service/tsconfig.json ./services/auth-service/
COPY services/auth-service/src ./services/auth-service/src

# Copy shared packages
COPY packages/common ./packages/common

# Install all deps (including devDeps for build)
RUN npm install --workspace=services/auth-service

# Build
WORKDIR /app/services/auth-service
RUN npx nest build

# ── Production stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

WORKDIR /app

# Copy package files
COPY --from=builder /app/services/auth-service/package.json ./
COPY --from=builder /app/packages/common ./packages/common

# Install production deps only
RUN npm install --omit=dev

# Copy built output
COPY --from=builder /app/services/auth-service/dist ./dist

USER nestjs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "--max-old-space-size=100", "dist/main"]
