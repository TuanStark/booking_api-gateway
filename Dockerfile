# =============================
# 1. BUILDER – Compile TypeScript → JS
# =============================
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files first → Tối ưu cache
COPY package*.json ./

# Cài TẤT CẢ dependencies (dev + prod) để build
RUN npm ci --legacy-peer-deps

# Copy toàn bộ source code
COPY . .

# Copy keys vào builder stage
COPY keys ./keys

# Build NestJS
RUN npm run build

# =============================
# 2. PRUNER – Loại bỏ devDependencies
# =============================
FROM node:20-alpine AS pruner
WORKDIR /app

# Copy cần thiết từ builder
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist

# Cài CHỈ production dependencies
RUN npm ci --only=production --legacy-peer-deps && \
    npm cache clean --force

# =============================
# 3. FINAL IMAGE – Runtime only
# =============================
FROM node:20-alpine AS production
WORKDIR /app

# Tạo user non-root (bảo mật)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy file cần thiết + gán quyền
COPY --from=pruner --chown=nestjs:nodejs /app/package*.json ./
COPY --from=pruner --chown=nestjs:nodejs /app/dist          ./dist
COPY --from=pruner --chown=nestjs:nodejs /app/node_modules  ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/keys         ./keys

# Chuyển sang user non-root
USER nestjs

# Environment
ENV NODE_ENV=production \
    PORT=3001

EXPOSE 3001

# Healthcheck (tùy chọn – yêu cầu có endpoint /health)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1

# Khởi động ứng dụng
CMD ["node", "dist/main"]