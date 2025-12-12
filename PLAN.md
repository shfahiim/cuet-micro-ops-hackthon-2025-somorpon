# 🚀 CUET Micro-Ops Hackathon 2025 - Implementation Plan

> **Team: Somorpon**  
> **Date: December 12, 2025**  
> **Repository: cuet-micro-ops-hackthon-2025-somorpon**

---

## 📦 Prerequisites Checklist

Before starting, ensure you have these installed:

| Tool           | Required Version | Check Command            |
| -------------- | ---------------- | ------------------------ |
| Node.js        | >= 24.10.0       | `node --version`         |
| npm            | >= 10.x          | `npm --version`          |
| Docker         | >= 24.x          | `docker --version`       |
| Docker Compose | >= 2.x           | `docker compose version` |
| Git            | Latest           | `git --version`          |

### Initial Setup Commands

```bash
# 1. Navigate to the project directory
cd cuet-micro-ops-hackthon-2025-somorpon

# 2. Install dependencies
npm install

# 3. Copy environment file (if not exists)
cp .env.example .env

# 4. Verify the app runs locally (mock mode - no S3)
npm run dev

# 5. Test the health endpoint (should show storage: error in mock mode)
curl http://localhost:3000/health
# Expected: {"status":"unhealthy","checks":{"storage":"error"}}

# 6. Stop the dev server (Ctrl+C)
```

---

## 📋 Executive Summary

This document outlines a step-by-step implementation plan for the CUET Micro-Ops Hackathon 2025 challenges. The plan is structured into **4 major milestones** that can be demoed independently.

### Points Breakdown

| Challenge                           | Max Points | Difficulty | Priority  |
| ----------------------------------- | ---------- | ---------- | --------- |
| Challenge 1: S3 Storage Integration | 15         | Medium     | 🔴 HIGH   |
| Challenge 3: CI/CD Pipeline         | 10         | Medium     | 🔴 HIGH   |
| Challenge 2: Architecture Design    | 15         | Hard       | 🟡 MEDIUM |
| Challenge 4: Observability (Bonus)  | 10         | Hard       | 🟢 LOW    |
| **Maximum Total**                   | **50**     |            |           |

---

## 🎯 Milestone Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         IMPLEMENTATION ROADMAP                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  MILESTONE 1 (2-3 hrs)          MILESTONE 2 (1-2 hrs)                       │
│  ┌──────────────────────┐       ┌──────────────────────┐                    │
│  │  S3 Storage Setup    │──────▶│   CI/CD Pipeline     │                    │
│  │  (15 points)         │       │   (10 points)        │                    │
│  │  ✓ MinIO             │       │   ✓ GitHub Actions   │                    │
│  │  ✓ Bucket Creation   │       │   ✓ Docker Build     │                    │
│  │  ✓ Health Check OK   │       │   ✓ E2E Tests        │                    │
│  └──────────────────────┘       └──────────────────────┘                    │
│           │                              │                                   │
│           │          DEMO POINT 1        │        DEMO POINT 2              │
│           │          (15 points)         │        (25 points)               │
│           ▼                              ▼                                   │
│  MILESTONE 3 (2-3 hrs)          MILESTONE 4 (3-4 hrs)                       │
│  ┌──────────────────────┐       ┌──────────────────────┐                    │
│  │  Architecture Doc    │──────▶│   Observability UI   │                    │
│  │  (15 points)         │       │   (10 points BONUS)  │                    │
│  │  ✓ ARCHITECTURE.md   │       │   ✓ React Dashboard  │                    │
│  │  ✓ Polling/SSE/WS    │       │   ✓ Sentry + Jaeger  │                    │
│  │  ✓ Diagrams          │       │   ✓ Trace Viewer     │                    │
│  └──────────────────────┘       └──────────────────────┘                    │
│                                                                              │
│           DEMO POINT 3                   DEMO POINT 4                        │
│           (40 points)                    (50 points - FULL)                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# 📌 MILESTONE 1: S3 Storage Integration (15 Points)

## Objective

Add a self-hosted S3-compatible storage service (MinIO) to Docker Compose and verify health endpoint returns `"storage": "ok"`.

## Current State

- ✅ Docker Compose files exist
- ✅ S3 client configured in `src/index.ts`
- ❌ No S3 service in Docker Compose
- ❌ Health check returns `storage: error`

---

## 📝 Step-by-Step Instructions

### Step 1.1: Update `docker/compose.dev.yml`

**Action:** Open `docker/compose.dev.yml` and replace the ENTIRE content with:

```yaml
name: delineate

services:
  # ============================================
  # MinIO - S3-Compatible Object Storage
  # ============================================
  minio:
    image: minio/minio:latest
    container_name: delineate-minio
    ports:
      - "9000:9000" # S3 API
      - "9001:9001" # Web Console
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - delineate-network

  # ============================================
  # MinIO Init - Create bucket on startup
  # ============================================
  minio-init:
    image: minio/mc:latest
    container_name: delineate-minio-init
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      echo 'Waiting for MinIO to be ready...';
      sleep 2;
      mc alias set myminio http://minio:9000 minioadmin minioadmin;
      mc mb myminio/downloads --ignore-existing;
      mc anonymous set download myminio/downloads;
      echo '✅ Bucket downloads created successfully!';
      exit 0;
      "
    networks:
      - delineate-network

  # ============================================
  # Jaeger - Distributed Tracing
  # ============================================
  delineate-jaeger:
    image: jaegertracing/all-in-one:latest
    container_name: delineate-jaeger
    ports:
      - "16686:16686" # Jaeger UI
      - "4318:4318" # OTLP HTTP
    environment:
      - COLLECTOR_OTLP_ENABLED=true
    networks:
      - delineate-network

  # ============================================
  # Main Application
  # ============================================
  delineate-app:
    build:
      context: ..
      dockerfile: docker/Dockerfile.dev
    container_name: delineate-app
    ports:
      - "3000:3000"
    volumes:
      - ../src:/app/src
    env_file:
      - ../.env
    environment:
      - NODE_ENV=development
      - S3_ENDPOINT=http://minio:9000
      - S3_ACCESS_KEY_ID=minioadmin
      - S3_SECRET_ACCESS_KEY=minioadmin
      - S3_BUCKET_NAME=downloads
      - S3_FORCE_PATH_STYLE=true
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://delineate-jaeger:4318
    depends_on:
      minio-init:
        condition: service_completed_successfully
      delineate-jaeger:
        condition: service_started
    networks:
      - delineate-network

volumes:
  minio_data:
    driver: local

networks:
  delineate-network:
    driver: bridge
```

**Command to edit:**

```bash
nano docker/compose.dev.yml
# OR
code docker/compose.dev.yml
```

---

### Step 1.2: Update `docker/compose.prod.yml`

**Action:** Open `docker/compose.prod.yml` and replace the ENTIRE content with:

```yaml
name: delineate

services:
  # ============================================
  # MinIO - S3-Compatible Object Storage (Production)
  # ============================================
  minio:
    image: minio/minio:latest
    container_name: delineate-minio
    ports:
      - "9000:9000"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    command: server /data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s
    restart: unless-stopped
    networks:
      - delineate-network

  # ============================================
  # MinIO Init - Create bucket on startup
  # ============================================
  minio-init:
    image: minio/mc:latest
    container_name: delineate-minio-init
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      echo 'Waiting for MinIO...';
      sleep 2;
      mc alias set myminio http://minio:9000 minioadmin minioadmin;
      mc mb myminio/downloads --ignore-existing;
      echo '✅ Bucket downloads created!';
      exit 0;
      "
    networks:
      - delineate-network

  # ============================================
  # Main Application (Production)
  # ============================================
  delineate-app:
    build:
      context: ..
      dockerfile: docker/Dockerfile.prod
    container_name: delineate-app
    ports:
      - "3000:3000"
    env_file:
      - ../.env
    environment:
      - NODE_ENV=production
      - S3_ENDPOINT=http://minio:9000
      - S3_ACCESS_KEY_ID=minioadmin
      - S3_SECRET_ACCESS_KEY=minioadmin
      - S3_BUCKET_NAME=downloads
      - S3_FORCE_PATH_STYLE=true
    depends_on:
      minio-init:
        condition: service_completed_successfully
    restart: unless-stopped
    networks:
      - delineate-network

volumes:
  minio_data:
    driver: local

networks:
  delineate-network:
    driver: bridge
```

---

### Step 1.3: Test the Setup

**Run these commands in order:**

```bash
# 1. Stop any running containers and clean up
docker compose -f docker/compose.dev.yml down -v

# 2. Build and start all services
docker compose -f docker/compose.dev.yml up --build

# Watch for these log messages:
# - "✅ Bucket downloads created successfully!"
# - "Server is running on http://localhost:3000"
```

---

### Step 1.4: Verify Health Endpoint

**In a NEW terminal window:**

```bash
# Test the health endpoint
curl http://localhost:3000/health

# ✅ Expected Response:
# {"status":"healthy","checks":{"storage":"ok"}}
```

---

### Step 1.5: Run E2E Tests

```bash
# Run the full test suite
npm run test:e2e

# ✅ All tests should pass
```

---

### Step 1.6: (Optional) Access MinIO Console

Open in browser:

- **URL:** http://localhost:9001
- **Username:** minioadmin
- **Password:** minioadmin

You should see the `downloads` bucket.

---

## ✅ Milestone 1 Checklist

- [ ] `docker/compose.dev.yml` updated
- [ ] `docker/compose.prod.yml` updated
- [ ] `docker compose up --build` runs without errors
- [ ] Bucket `downloads` created (check logs)
- [ ] `curl http://localhost:3000/health` → `{"status":"healthy","checks":{"storage":"ok"}}`
- [ ] `npm run test:e2e` passes

---

# 📌 MILESTONE 2: CI/CD Pipeline Setup (10 Points)

## Objective

Enhance the GitHub Actions workflow with proper testing, caching, and Docker build stages.

## Current State

- ✅ Basic CI workflow exists at `.github/workflows/ci.yml`
- ❌ No npm caching
- ❌ E2E tests run without S3
- ❌ No security scanning

---

## 📝 Step-by-Step Instructions

### Step 2.1: Update `.github/workflows/ci.yml`

**Action:** Open `.github/workflows/ci.yml` and replace the ENTIRE content with:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  # ==========================================
  # STAGE 1: Lint & Format Check
  # ==========================================
  lint:
    name: 🔍 Lint & Format
    runs-on: ubuntu-24.04
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Check formatting
        run: npm run format:check

  # ==========================================
  # STAGE 2: E2E Tests with MinIO
  # ==========================================
  test:
    name: 🧪 E2E Tests
    runs-on: ubuntu-24.04
    needs: lint
    services:
      minio:
        image: minio/minio:latest
        ports:
          - 9000:9000
        env:
          MINIO_ROOT_USER: minioadmin
          MINIO_ROOT_PASSWORD: minioadmin
        options: >-
          --health-cmd "curl -f http://localhost:9000/minio/health/live || exit 1"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Create MinIO bucket
        run: |
          curl -sLo mc https://dl.min.io/client/mc/release/linux-amd64/mc
          chmod +x mc
          ./mc alias set myminio http://localhost:9000 minioadmin minioadmin
          ./mc mb myminio/downloads --ignore-existing
          echo "✅ MinIO bucket created"

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          NODE_ENV: development
          PORT: 3000
          S3_REGION: us-east-1
          S3_ENDPOINT: http://localhost:9000
          S3_ACCESS_KEY_ID: minioadmin
          S3_SECRET_ACCESS_KEY: minioadmin
          S3_BUCKET_NAME: downloads
          S3_FORCE_PATH_STYLE: "true"
          REQUEST_TIMEOUT_MS: "30000"
          RATE_LIMIT_WINDOW_MS: "60000"
          RATE_LIMIT_MAX_REQUESTS: "100"
          CORS_ORIGINS: "*"

  # ==========================================
  # STAGE 3: Build Docker Image
  # ==========================================
  build:
    name: 🐳 Build Docker Image
    runs-on: ubuntu-24.04
    needs: test
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=sha,prefix=
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: docker/Dockerfile.prod
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ==========================================
  # STAGE 4: Security Scan (Bonus)
  # ==========================================
  security-scan:
    name: 🔒 Security Scan
    runs-on: ubuntu-24.04
    needs: build
    if: github.event_name != 'pull_request'
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: "fs"
          scan-ref: "."
          format: "table"
          exit-code: "0"
          severity: "CRITICAL,HIGH"
```

**Command to edit:**

```bash
nano .github/workflows/ci.yml
# OR
code .github/workflows/ci.yml
```

---

### Step 2.2: Add CI/CD Section to README

**Action:** Add this section near the top of `README.md` (after the title and before "The Scenario"):

```markdown
## 🔄 CI/CD

[![CI/CD Pipeline](https://github.com/shfahiim/cuet-micro-ops-hackthon-2025-somorpon/actions/workflows/ci.yml/badge.svg)](https://github.com/shfahiim/cuet-micro-ops-hackthon-2025-somorpon/actions/workflows/ci.yml)

### Pipeline Stages
```

┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ 🔍 Lint │───▶│ 🧪 Test │───▶│ 🐳 Build │───▶│ 🔒 Scan │
│ ESLint + │ │ E2E with │ │ Docker │ │ Trivy │
│ Prettier │ │ MinIO │ │ Image │ │ Security │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘

````

### Running Tests Locally

```bash
# Install dependencies
npm install

# Run linting
npm run lint

# Check formatting
npm run format:check

# Run E2E tests (with Docker MinIO)
npm run docker:dev  # Start services first
npm run test:e2e
````

---

````

---

### Step 2.3: Commit and Push

```bash
# Add all changes
git add .

# Commit
git commit -m "feat: add MinIO S3 storage and enhanced CI/CD pipeline"

# Push to trigger the pipeline
git push origin main
````

---

### Step 2.4: Verify Pipeline

1. Go to: https://github.com/shfahiim/cuet-micro-ops-hackthon-2025-somorpon/actions
2. Watch the pipeline run through all stages
3. All stages should pass ✅

---

## ✅ Milestone 2 Checklist

- [ ] `.github/workflows/ci.yml` updated
- [ ] README updated with CI/CD badge and section
- [ ] Changes pushed to GitHub
- [ ] Pipeline runs successfully (all green)
- [ ] Docker image built and cached

---

# 📌 MILESTONE 3: Architecture Design Document (15 Points)

## Objective

Create `ARCHITECTURE.md` documenting a solution for handling long-running downloads.

---

## 📝 Step-by-Step Instructions

### Step 3.1: Create `ARCHITECTURE.md`

**Action:** Create a new file `ARCHITECTURE.md` in the project root.

**Run this command to create the file:**

```bash
touch ARCHITECTURE.md
code ARCHITECTURE.md
```

### Step 3.2: Required Sections

Your `ARCHITECTURE.md` must include:

#### Section 1: Problem Statement

- Explain why current approach fails with proxies (100s timeout)
- Connection timeouts, gateway errors, poor UX

#### Section 2: Architecture Diagram

Include an ASCII or Mermaid diagram:

```
┌─────────────────────────────────────────────────────────────────────┐
│                          ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐  │
│   │  Client  │────▶│  Nginx   │────▶│   API    │────▶│  Redis   │  │
│   │ (React)  │     │  Proxy   │     │  Server  │     │  Queue   │  │
│   └──────────┘     └──────────┘     └──────────┘     └──────────┘  │
│        │                                  │               │         │
│        │                                  │               ▼         │
│        │                                  │         ┌──────────┐   │
│        │                                  │         │  Worker  │   │
│        │                                  │         │ Process  │   │
│        │                                  │         └──────────┘   │
│        │                                  │               │         │
│        │           SSE Stream             │               │         │
│        ◀──────────────────────────────────┘               │         │
│        │                                                  ▼         │
│        │                                           ┌──────────┐    │
│        └──────────────────────────────────────────▶│   S3     │    │
│                    Direct Download                 │ Storage  │    │
│                    (Presigned URL)                 └──────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

#### Section 3: Technical Approach

**Recommended: Hybrid Polling + Server-Sent Events (SSE)**

| Pattern   | Pros                     | Cons                  |
| --------- | ------------------------ | --------------------- |
| Polling   | Simple, works everywhere | More requests, delay  |
| SSE       | Real-time, efficient     | Proxy support needed  |
| WebSocket | Bi-directional           | Complex, overkill     |
| Webhook   | Decoupled                | Requires callback URL |

**Justification:** SSE for real-time with polling fallback.

#### Section 4: API Contract Changes

```
POST /v1/download/initiate
  Request:  { file_ids: [70000, 70001] }
  Response: { jobId: "uuid", status: "queued", totalFileIds: 2 }

GET /v1/download/status/:jobId
  Response: {
    jobId: "uuid",
    status: "processing" | "completed" | "failed",
    progress: 50,
    completedFiles: 1,
    totalFiles: 2,
    downloadUrl?: "presigned-url",
    error?: "error message"
  }

GET /v1/download/stream/:jobId
  Response: Server-Sent Events stream
  Events:
    - event: progress, data: { progress: 50 }
    - event: completed, data: { downloadUrl: "..." }
    - event: failed, data: { error: "..." }
```

#### Section 5: Database/Cache Schema (Redis)

```
# Job Status Hash
job:{jobId} → {
  status: "queued" | "processing" | "completed" | "failed",
  file_ids: [70000, 70001],
  progress: 50,
  completed_files: 1,
  total_files: 2,
  download_url: "presigned-url",
  error: null,
  created_at: "2025-12-12T10:00:00Z",
  completed_at: null
}

# Job Queue (BullMQ)
downloads:pending → List of jobIds
downloads:processing → Set of jobIds
```

#### Section 6: Proxy Configuration

**Nginx:**

```nginx
location /v1/download/stream {
    proxy_pass http://api:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
}

location /v1/download {
    proxy_pass http://api:3000;
    proxy_read_timeout 30s;
}
```

**Cloudflare:**

- Enable WebSocket support
- Use Cloudflare Workers for SSE handling
- Increase timeout with Enterprise plan or use polling

#### Section 7: Frontend Integration (React)

```tsx
// useDownload.ts
function useDownload(fileIds: number[]) {
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const startDownload = async () => {
    setStatus("loading");

    // 1. Initiate download
    const { jobId } = await api.post("/v1/download/initiate", {
      file_ids: fileIds,
    });

    // 2. Connect to SSE stream
    const eventSource = new EventSource(`/v1/download/stream/${jobId}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setProgress(data.progress);

      if (data.status === "completed") {
        setDownloadUrl(data.downloadUrl);
        setStatus("success");
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      // Fallback to polling
      pollStatus(jobId);
    };
  };

  return { status, progress, downloadUrl, startDownload };
}
```

---

## ✅ Milestone 3 Checklist

- [ ] `ARCHITECTURE.md` created
- [ ] Contains architecture diagram
- [ ] Technical approach documented and justified
- [ ] API contracts defined
- [ ] Redis schema designed
- [ ] Proxy configs included (Nginx/Cloudflare)
- [ ] Frontend integration guide with React example

---

# 📌 MILESTONE 4: Observability Dashboard (10 Bonus Points)

## Objective

Build a React UI with Sentry error tracking and OpenTelemetry tracing.

---

## 📝 Step-by-Step Instructions

### Step 4.1: Create React App with Vite

```bash
# From project root
npm create vite@latest frontend -- --template react-ts

# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Install additional packages
npm install @sentry/react axios

# Return to project root
cd ..
```

### Step 4.2: Create Frontend Dockerfile

**Create `frontend/Dockerfile`:**

```dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Step 4.3: Create Basic Components

**Create `frontend/src/components/HealthStatus.tsx`:**

```tsx
import { useEffect, useState } from "react";
import axios from "axios";

export function HealthStatus() {
  const [health, setHealth] = useState<{
    status: string;
    checks: { storage: string };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await axios.get("http://localhost:3000/health");
        setHealth(response.data);
      } catch (err) {
        setError("Failed to fetch health status");
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!health) return <div>Loading...</div>;

  return (
    <div className="health-status">
      <h2>API Health</h2>
      <p>
        Status: <strong>{health.status}</strong>
      </p>
      <p>
        Storage: <strong>{health.checks.storage}</strong>
      </p>
    </div>
  );
}
```

### Step 4.4: Update Docker Compose

**Add to `docker/compose.dev.yml` (before the volumes section):**

```yaml
# ============================================
# Frontend (React)
# ============================================
frontend:
  build:
    context: ../frontend
    dockerfile: Dockerfile
  container_name: delineate-frontend
  ports:
    - "5173:80"
  depends_on:
    - delineate-app
  networks:
    - delineate-network
```

### Step 4.5: Configure Sentry

1. Go to https://sentry.io and create a free account
2. Create a new React project
3. Get your DSN (looks like `https://xxx@yyy.ingest.sentry.io/zzz`)
4. Update `frontend/src/main.tsx`:

```tsx
import * as Sentry from "@sentry/react";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN_HERE",
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p>An error occurred</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);
```

### Step 4.6: Test Sentry Integration

```bash
# Start all services
docker compose -f docker/compose.dev.yml up --build -d

# Open frontend
echo "Open http://localhost:5173"

# Trigger a Sentry test error via API
curl -X POST "http://localhost:3000/v1/download/check?sentry_test=true" \
  -H "Content-Type: application/json" \
  -d '{"file_id": 70000}'

# Check Sentry dashboard for the error
```

---

## ✅ Milestone 4 Checklist

- [ ] React app created in `frontend/`
- [ ] Sentry SDK installed and configured
- [ ] Error boundary implemented
- [ ] Health status component works
- [ ] Download manager UI exists
- [ ] Docker Compose updated with frontend service
- [ ] Jaeger UI accessible at http://localhost:16686

---

# ⏱️ Time Estimation

| Milestone                     | Estimated Time | Points |
| ----------------------------- | -------------- | ------ |
| Milestone 1: S3 Storage       | 2-3 hours      | 15     |
| Milestone 2: CI/CD Pipeline   | 1-2 hours      | 10     |
| Milestone 3: Architecture Doc | 2-3 hours      | 15     |
| Milestone 4: Observability    | 3-4 hours      | 10     |
| **Total**                     | **8-12 hours** | **50** |

---

# 🎬 Demo Strategy

## Demo Point 1 (After Milestone 1) - 15 Points

```bash
# Show Docker Compose with MinIO
cat docker/compose.dev.yml

# Start services
docker compose -f docker/compose.dev.yml up -d

# Wait for startup
sleep 20

# Show health check
curl -s http://localhost:3000/health | jq .

# Show MinIO console
echo "Open http://localhost:9001 (minioadmin/minioadmin)"

# Run tests
npm run test:e2e
```

## Demo Point 2 (After Milestone 2) - 25 Points

- Show GitHub Actions page
- Point out all stages passing (Lint → Test → Build → Scan)
- Show the Docker image in packages

## Demo Point 3 (After Milestone 3) - 40 Points

- Walk through ARCHITECTURE.md
- Explain the diagram
- Justify the hybrid SSE + polling approach
- Show Redis schema design

## Demo Point 4 (After Milestone 4) - 50 Points

- Show React dashboard at http://localhost:5173
- Show health status updating in real-time
- Trigger Sentry error and show in dashboard
- Open Jaeger UI and show traces

---

# 🔧 Quick Commands Reference

```bash
# ============ DEVELOPMENT ============
npm run dev                      # Start dev server (5-15s delays)
npm run start                    # Start prod server (10-120s delays)
npm run docker:dev               # Start with Docker (dev mode)
npm run docker:prod              # Start with Docker (prod mode)

# ============ TESTING ============
npm run lint                     # Run ESLint
npm run format:check             # Check Prettier
npm run test:e2e                 # Run E2E tests

# ============ DOCKER ============
docker compose -f docker/compose.dev.yml up -d --build    # Start background
docker compose -f docker/compose.dev.yml down -v          # Stop & clean
docker compose -f docker/compose.dev.yml logs -f          # View logs
docker compose -f docker/compose.dev.yml logs -f delineate-app  # App logs only

# ============ VERIFICATION ============
curl http://localhost:3000/health
curl http://localhost:3000/docs
curl http://localhost:3000/

# ============ GIT ============
git add .
git commit -m "feat: description"
git push origin main
```

---

# 📁 Files to Create/Modify Summary

| File                       | Action                         | Milestone |
| -------------------------- | ------------------------------ | --------- |
| `docker/compose.dev.yml`   | **MODIFY**                     | 1         |
| `docker/compose.prod.yml`  | **MODIFY**                     | 1         |
| `.github/workflows/ci.yml` | **MODIFY**                     | 2         |
| `README.md`                | **MODIFY** (add CI/CD section) | 2         |
| `ARCHITECTURE.md`          | **CREATE**                     | 3         |
| `frontend/`                | **CREATE** (entire directory)  | 4         |
| `frontend/Dockerfile`      | **CREATE**                     | 4         |
| `frontend/src/components/` | **CREATE**                     | 4         |

---

# 🚨 Troubleshooting

## MinIO not starting?

```bash
# Check if port 9000 is in use
sudo lsof -i :9000

# Remove old volumes and restart
docker compose -f docker/compose.dev.yml down -v
docker compose -f docker/compose.dev.yml up --build
```

## Health check still failing?

```bash
# Check if MinIO is healthy
docker ps

# Check MinIO logs
docker logs delineate-minio

# Check app logs
docker logs delineate-app
```

## E2E tests failing?

```bash
# Make sure Docker services are running
docker compose -f docker/compose.dev.yml ps

# Check if health endpoint works
curl http://localhost:3000/health

# Run tests with verbose output
npm run test:e2e
```

## GitHub Actions failing?

- Check the Actions tab for error logs
- Ensure MinIO service container is healthy before bucket creation
- Verify all environment variables are set

---

**Good luck with the hackathon! Let's build this! 🚀**
