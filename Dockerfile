# Giai đoạn build của Auth Service.
# Build context là repository root vì Auth Service dùng packages/common trong monorepo.
# Context chỉ là phạm vi file được phép đọc, không khiến Docker build các service khác.
FROM node:20-alpine AS builder

# Giữ workspace root để npm resolve package-lock và dependency của auth-service.
WORKDIR /app

# Copy manifest trước source để Docker cache layer dependency khi code thay đổi.
# package chung được copy vì TypeScript của Auth Service dùng alias @common.
COPY package.json package-lock.json tsconfig.base.json ./
COPY services/auth-service/package.json services/auth-service/tsconfig.json ./services/auth-service/
COPY packages/common ./packages/common

# npm ci dùng đúng version trong lockfile. DevDependency như Nest CLI và TypeScript
# cần tồn tại ở build stage nhưng sẽ bị loại khỏi image runtime sau khi compile.
# Tắt lifecycle script để build không tự chạy hành vi ngoài phạm vi image.
RUN npm ci --workspace=services/auth-service --include=dev --ignore-scripts

# Chỉ copy source Auth Service; các service khác không được đưa vào bước compile.
COPY services/auth-service/src ./services/auth-service/src

# Build đúng workspace. Vì rootDir là repository root, output thực tế nằm tại
# services/auth-service/dist/services/auth-service/src/main.js.
RUN npm run build --workspace=services/auth-service

# Sau khi build xong, giữ lại dependency production để giảm kích thước image cuối.
RUN npm prune --omit=dev

# Giai đoạn runtime không chứa compiler, test hoặc source TypeScript.
FROM node:20-alpine AS production

# Giá trị mặc định cho chạy image độc lập; Compose/Kubernetes có thể override PORT.
ENV NODE_ENV=production
ENV PORT=3002

# Chạy service bằng user không có quyền root để giới hạn tác động khi process gặp sự cố.
# npm/npx chỉ cần ở builder để cài dependency; runtime chỉ chạy bằng node.
# Loại chúng khỏi final image để không mang theo dependency/tooling không cần thiết của npm.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
  && addgroup -g 1001 -S nodejs \
  && adduser -S nestjs -u 1001

WORKDIR /app

# Chỉ copy node_modules production và artifact đã build từ builder stage.
# --chown giúp user nestjs đọc được file mà không cần nâng quyền runtime.
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/services/auth-service/dist ./dist

USER nestjs

# EXPOSE chỉ mô tả port mặc định trong image; PORT runtime có thể được override.
EXPOSE 3002

# Auth Service bật URI versioning nên health endpoint là /api/v1/health.
# Dùng shell-form sau CMD để ${PORT} được thay bằng port thực tế mà Compose/Kubernetes truyền vào.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- "http://localhost:${PORT}/api/v1/health" > /dev/null || exit 1

# Dùng node trực tiếp để nhận SIGTERM đúng trong rolling update và graceful shutdown.
CMD ["node", "--max-old-space-size=100", "dist/services/auth-service/src/main.js"]
