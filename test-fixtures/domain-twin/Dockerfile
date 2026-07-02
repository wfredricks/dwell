# Dockerfile — aws-sa-domain-twin
# Single-stage: node:22-alpine, runs src/index.ts via tsx
# @adopt:dwell-node-version [resolved: 22-alpine]

FROM node:22-alpine

WORKDIR /app

# Install dependencies (includes tsx)
COPY package.json ./
RUN npm install

# Copy source
COPY src/ ./src/

# @adopt:dwell-aws-sa-twin-id [resolved: aws-sa]
CMD ["npx", "tsx", "src/index.ts"]
