#!/bin/bash

# CI/CD Local Test Script
# Simulates the GitHub Actions CI pipeline locally

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   CI/CD Pipeline - Local Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Cleaning up containers...${NC}"
    docker stop minio redis 2>/dev/null || true
    docker rm minio redis 2>/dev/null || true
}

# Set trap to cleanup on exit
trap cleanup EXIT

# ==========================================
# STAGE 1: Lint & Format Check
# ==========================================
echo -e "${BLUE}=== STAGE 1: Lint & Format ===${NC}"
echo ""

echo -e "${YELLOW}Running ESLint...${NC}"
npm run lint
echo -e "${GREEN}✅ Linting passed${NC}"
echo ""

echo -e "${YELLOW}Checking formatting...${NC}"
npm run format:check
echo -e "${GREEN}✅ Formatting check passed${NC}"
echo ""

# ==========================================
# STAGE 2: E2E Tests with MinIO + Redis
# ==========================================
echo -e "${BLUE}=== STAGE 2: E2E Tests ===${NC}"
echo ""

echo -e "${YELLOW}Starting MinIO container...${NC}"
docker run -d \
  --name minio \
  -p 9000:9000 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  minio/minio:latest server /data

echo -e "${YELLOW}Starting Redis container...${NC}"
docker run -d \
  --name redis \
  -p 6379:6379 \
  redis:7-alpine

echo -e "${YELLOW}Waiting for MinIO to be ready...${NC}"
for i in {1..30}; do
  if curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1; then
    echo -e "${GREEN}✅ MinIO is ready!${NC}"
    break
  fi
  echo "Waiting... ($i/30)"
  sleep 2
done

echo -e "${YELLOW}Waiting for Redis to be ready...${NC}"
for i in {1..30}; do
  if docker exec redis redis-cli ping | grep -q PONG; then
    echo -e "${GREEN}✅ Redis is ready!${NC}"
    break
  fi
  echo "Waiting... ($i/30)"
  sleep 1
done

echo -e "${YELLOW}Creating MinIO bucket...${NC}"
curl -sLo mc https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc
./mc alias set myminio http://localhost:9000 minioadmin minioadmin
./mc mb myminio/downloads --ignore-existing
rm mc
echo -e "${GREEN}✅ MinIO bucket created${NC}"
echo ""

echo -e "${YELLOW}Running E2E tests...${NC}"
export NODE_ENV=development
export PORT=3000
export S3_REGION=us-east-1
export S3_ENDPOINT=http://localhost:9000
export S3_ACCESS_KEY_ID=minioadmin
export S3_SECRET_ACCESS_KEY=minioadmin
export S3_BUCKET_NAME=downloads
export S3_FORCE_PATH_STYLE=true
export REQUEST_TIMEOUT_MS=30000
export RATE_LIMIT_WINDOW_MS=60000
export RATE_LIMIT_MAX_REQUESTS=100
export CORS_ORIGINS="*"
export REDIS_HOST=localhost
export REDIS_PORT=6379

npm run test:e2e
echo -e "${GREEN}✅ E2E tests passed${NC}"
echo ""

# ==========================================
# Summary
# ==========================================
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   ✅ All CI/CD stages passed!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Pipeline stages completed:"
echo -e "  ${GREEN}✅${NC} Lint & Format"
echo -e "  ${GREEN}✅${NC} E2E Tests"
echo ""
echo -e "${BLUE}Ready to push to GitHub!${NC}"
