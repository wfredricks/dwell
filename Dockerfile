# Dockerfile — dwell-runtime
# Multi-stage build: TypeScript compile → minimal runtime image
# @adopt:dwell-node-version [resolved: 22-alpine]

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies (includes dev deps for tsc)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and compile
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS run

WORKDIR /app

# Only production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy compiled output from build stage
COPY --from=build /app/dist ./dist

# @adopt:dwell-runtime-port [resolved: 3000]
EXPOSE 3000

CMD ["node", "dist/runtime/index.js"]
