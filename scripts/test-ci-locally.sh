#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}🧪 Local CI/CD Simulation${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🧹 Cleaning up containers...${NC}"
    docker stop minio redis 2>/dev/null || true
    docker rm minio redis 2>/dev/null || true
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Step 1: Lint
echo -e "${BLUE}Step 1: Running ESLint...${NC}"
npm run lint
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Linting failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Linting passed${NC}\n"

# Step 2: Format check
echo -e "${BLUE}Step 2: Checking code formatting...${NC}"
npm run format:check
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Format check failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Format check passed${NC}\n"

# Step 3: Start MinIO
echo -e "${BLUE}Step 3: Starting MinIO container...${NC}"
docker run -d \
    --name minio \
    -p 9000:9000 \
    -e MINIO_ROOT_USER=minioadmin \
    -e MINIO_ROOT_PASSWORD=minioadmin \
    minio/minio:latest server /data

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to start MinIO${NC}"
    exit 1
fi

# Step 4: Start Redis
echo -e "${BLUE}Step 4: Starting Redis container...${NC}"
docker run -d \
    --name redis \
    -p 6379:6379 \
    redis:7-alpine

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to start Redis${NC}"
    exit 1
fi

# Step 5: Wait for MinIO
echo -e "${BLUE}Step 5: Waiting for MinIO to be ready...${NC}"
for i in {1..30}; do
    if curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1; then
        echo -e "${GREEN}✅ MinIO is ready!${NC}"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 2
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ MinIO failed to start${NC}"
        docker logs minio
        exit 1
    fi
done

# Step 6: Wait for Redis
echo -e "${BLUE}Step 6: Waiting for Redis to be ready...${NC}"
for i in {1..30}; do
    if docker exec redis redis-cli ping 2>/dev/null | grep -q PONG; then
        echo -e "${GREEN}✅ Redis is ready!${NC}"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 1
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Redis failed to start${NC}"
        docker logs redis
        exit 1
    fi
done

# Step 7: Create MinIO bucket
echo -e "${BLUE}Step 7: Creating MinIO bucket...${NC}"
if [ ! -f ./mc ]; then
    curl -sLo mc https://dl.min.io/client/mc/release/linux-amd64/mc
    chmod +x mc
fi
./mc alias set myminio http://localhost:9000 minioadmin minioadmin
./mc mb myminio/downloads --ignore-existing
echo -e "${GREEN}✅ MinIO bucket created${NC}\n"

# Step 8: Run E2E tests
echo -e "${BLUE}Step 8: Running E2E tests...${NC}"
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

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ E2E tests failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ E2E tests passed${NC}\n"

# Success
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ All CI checks passed!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Your code is ready to push! 🚀${NC}"
