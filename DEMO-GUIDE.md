# 🎯 DEMO GUIDE FOR JUDGES - CUET Fest 2025

**Team**: Somorpon  
**Challenges Completed**: 1, 2, 3 (40/50 points)  
**Live Server**: http://36.255.70.250

---

## 📋 Table of Contents

1. [Quick Overview](#quick-overview)
2. [Challenge 1: S3 Storage Integration](#challenge-1-s3-storage-integration-15-points)
3. [Challenge 2: Async Architecture](#challenge-2-async-architecture-15-points)
4. [Challenge 3: CI/CD Pipeline](#challenge-3-cicd-pipeline-10-points)
5. [Live Dashboard Demo](#live-dashboard-demo)
6. [End-to-End Demo Flow](#end-to-end-demo-flow)

---

## 🎬 Quick Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     PRODUCTION DEPLOYMENT                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     │
│   │  Client  │────▶│  Nginx   │────▶│   API    │────▶│  Redis   │     │
│   │ (Browser)│     │  Proxy   │     │  Server  │     │  Queue   │     │
│   └──────────┘     └──────────┘     └──────────┘     └──────────┘     │
│        │                                  │               │             │
│        │                                  │               ▼             │
│        │                                  │         ┌──────────┐       │
│        │                                  │         │  Worker  │       │
│        │                                  │         │ Process  │       │
│        │                                  │         └──────────┘       │
│        │                                  │               │             │
│        │           SSE Stream             │               │             │
│        ◀──────────────────────────────────┘               │             │
│        │                                                  ▼             │
│        │                                           ┌──────────┐        │
│        └──────────────────────────────────────────▶│  MinIO   │        │
│                    Direct Download                 │    S3    │        │
│                    (Presigned URL)                 └──────────┘        │
│                                                          │              │
│                                                          ▼              │
│                                                    ┌──────────┐        │
│                                                    │  Jaeger  │        │
│                                                    │ Tracing  │        │
│                                                    └──────────┘        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key URLs

| Service              | URL                                                                                         | Credentials           |
| -------------------- | ------------------------------------------------------------------------------------------- | --------------------- |
| 🌐 API Server        | http://36.255.70.250:3000                                                                   | -                     |
| 📚 API Documentation | http://36.255.70.250:3000/docs                                                              | -                     |
| 🏥 Health Check      | http://36.255.70.250:3000/health                                                            | -                     |
| 📦 MinIO Console     | http://36.255.70.250:9001                                                                   | minioadmin/minioadmin |
| 🔍 Jaeger Tracing    | http://36.255.70.250:16686                                                                  | -                     |
| 🚀 CI/CD Pipeline    | [GitHub Actions](https://github.com/shfahiim/cuet-micro-ops-hackthon-2025-somorpon/actions) | -                     |

---

## Challenge 1: S3 Storage Integration (15 Points)

### ✅ What We Implemented

1. **MinIO S3-Compatible Storage**
   - Self-hosted object storage in Docker
   - Automatic bucket creation on startup
   - Production-ready with health checks

2. **Docker Compose Configuration**
   - Added MinIO service with persistent volumes
   - Configured networking between services
   - Automated initialization container

3. **API Integration**
   - Environment variables for S3 connection
   - Presigned URL generation for downloads
   - File availability checking

### 🎯 Demo Commands

#### 1. Verify Health Check

```bash
BASE=http://36.255.70.250:3000

# Check system health
curl -s $BASE/health | jq '.'

# Expected output:
# {
#   "status": "healthy",
#   "checks": {
#     "storage": "ok",
#     "redis": "ok"
#   }
# }
```

#### 2. Browse MinIO Console

1. Open: http://36.255.70.250:9001
2. Login: `minioadmin` / `minioadmin`
3. Navigate: **Buckets** → **downloads**
4. View uploaded files in `downloads/` folder

#### 3. Test File Availability

```bash
# Check if file exists in S3
curl -s -X POST $BASE/v1/download/check \
  -H "Content-Type: application/json" \
  -d '{"file_id": 70000}' | jq '.'

# Expected output:
# {
#   "file_id": 70000,
#   "available": true,
#   "s3Key": "downloads/70000.zip",
#   "size": 69
# }
```

### 📁 Configuration Files

- `docker/compose.prod.yml` - MinIO service definition
- `src/s3.ts` - S3 client integration
- `src/config.ts` - Environment configuration

---

## Challenge 2: Async Architecture (15 Points)

### ✅ What We Implemented

1. **Async Job Queue System**
   - BullMQ for reliable job processing
   - Redis as message broker
   - Separate worker process

2. **New API Endpoints**
   - `POST /v1/download/initiate` - Start async job
   - `GET /v1/download/status/:jobId` - Poll status
   - `GET /v1/download/stream/:jobId` - SSE real-time updates
   - `GET /v1/download/:jobId` - Direct download redirect

3. **Real-Time Updates**
   - Server-Sent Events (SSE) for progress
   - Fallback polling endpoint
   - Job status caching in Redis

### 🎯 Demo Flow

#### Step 1: Initiate Async Download

```bash
BASE=http://36.255.70.250:3000

# Start a download job
JOB_RESPONSE=$(curl -s -X POST $BASE/v1/download/initiate \
  -H "Content-Type: application/json" \
  -d '{"file_ids": [70000, 14000, 21000]}')

echo $JOB_RESPONSE | jq '.'

# Expected output:
# {
#   "jobId": "uuid-here",
#   "status": "queued",
#   "totalFileIds": 3,
#   "estimatedTimeSeconds": 6
# }

# Save the job ID
JOB_ID=$(echo $JOB_RESPONSE | jq -r '.jobId')
echo "Job ID: $JOB_ID"
```

#### Step 2: Monitor Progress (Option A - Polling)

```bash
# Poll for status updates
watch -n 2 "curl -s $BASE/v1/download/status/$JOB_ID | jq '{status, progress, completedFiles, totalFiles}'"

# Progress updates:
# {
#   "status": "queued",
#   "progress": 0,
#   "completedFiles": 0,
#   "totalFiles": 3
# }
# →
# {
#   "status": "processing",
#   "progress": 66,
#   "completedFiles": 2,
#   "totalFiles": 3
# }
# →
# {
#   "status": "completed",
#   "progress": 100,
#   "completedFiles": 3,
#   "totalFiles": 3
# }
```

#### Step 3: Monitor Progress (Option B - SSE Stream)

```bash
# Real-time updates via Server-Sent Events
curl -N $BASE/v1/download/stream/$JOB_ID

# You'll see events stream in real-time:
# event: progress
# data: {"progress":0,"completedFiles":0,"totalFiles":3}
#
# event: progress
# data: {"progress":33,"completedFiles":1,"totalFiles":3}
#
# event: progress
# data: {"progress":66,"completedFiles":2,"totalFiles":3}
#
# event: completed
# data: {"downloadUrl":"http://...","size":207}
```

#### Step 4: Get Final Result

```bash
# Check final status
curl -s $BASE/v1/download/status/$JOB_ID | jq '{status, downloadUrl, size, completedFiles}'

# Expected output:
# {
#   "status": "completed",
#   "downloadUrl": "http://minio:9000/downloads/downloads/70000.zip?X-Amz-...",
#   "size": 207,
#   "completedFiles": 3
# }
```

#### Step 5: Download the File

```bash
# Get direct download (302 redirect to presigned URL)
curl -L -o downloaded.zip $BASE/v1/download/$JOB_ID

# Verify the file
ls -lh downloaded.zip
```

### 🎨 Interactive Demo (Swagger UI)

1. Open: http://36.255.70.250:3000/docs
2. Try the endpoints interactively:
   - POST `/v1/download/initiate`
   - GET `/v1/download/status/{jobId}`
   - GET `/v1/download/{jobId}`

### 📊 Architecture Benefits

| Problem              | Solution                       |
| -------------------- | ------------------------------ |
| 100s timeout limits  | Job returns immediately (< 1s) |
| No progress feedback | Real-time SSE updates          |
| Resource exhaustion  | Background worker processing   |
| Connection drops     | Job continues processing       |
| Retry storms         | Idempotent job IDs             |

### 📁 Implementation Files

- `src/queue.ts` - BullMQ job queue
- `src/worker.ts` - Background worker process
- `src/job-status.ts` - Status tracking
- `ARCHITECTURE.md` - Detailed design docs
- `ASYNC-IMPLEMENTATION.md` - Implementation guide

---

## Challenge 3: CI/CD Pipeline (10 Points)

### ✅ What We Implemented

1. **GitHub Actions Pipeline**
   - Automated testing on every push
   - Multi-stage build process
   - Security scanning with Trivy

2. **Pipeline Stages**

   ```
   Lint → Test → Build → Scan → Deploy → Notify
   ```

3. **Automated Deployment**
   - SSH deployment to production server
   - Docker container orchestration
   - Health checks after deployment

### 🎯 Demo Steps

#### 1. View Pipeline Status

1. Open: https://github.com/shfahiim/cuet-micro-ops-hackthon-2025-somorpon/actions
2. See successful builds with green checkmarks
3. Click on any workflow run to see details

#### 2. Pipeline Stages Breakdown

```yaml
Stage 1: Lint (ESLint + Prettier)
  ✓ Code quality checks
  ✓ Format validation
  ⏱️  ~30 seconds

Stage 2: E2E Tests
  ✓ MinIO container startup
  ✓ API endpoint testing
  ✓ Download flow validation
  ⏱️  ~2 minutes

Stage 3: Docker Build
  ✓ Multi-platform images
  ✓ Layer caching
  ✓ Optimized for size
  ⏱️  ~3 minutes

Stage 4: Security Scan (Trivy)
  ✓ Vulnerability scanning
  ✓ Critical issue detection
  ⏱️  ~1 minute

Stage 5: Deploy
  ✓ SSH to production server
  ✓ Docker compose up
  ✓ Health check verification
  ⏱️  ~2 minutes

Stage 6: Slack Notification
  ✓ Build status alert
  ✓ Deployment confirmation
  ⏱️  ~5 seconds
```

#### 3. Trigger a Build

```bash
# Make a small change
cd /home/fahim/Desktop/csefest-devops/cuet-micro-ops-hackthon-2025-somorpon

# Commit and push
git add .
git commit -m "Demo: Trigger CI/CD pipeline"
git push origin main

# Watch the pipeline run at:
# https://github.com/shfahiim/cuet-micro-ops-hackthon-2025-somorpon/actions
```

#### 4. View Build Badge

The README shows real-time pipeline status:

[![CI/CD Pipeline](https://github.com/shfahiim/cuet-micro-ops-hackthon-2025-somorpon/actions/workflows/ci.yml/badge.svg)](https://github.com/shfahiim/cuet-micro-ops-hackthon-2025-somorpon/actions/workflows/ci.yml)

### 🔒 Security Features

- ✅ Trivy vulnerability scanning
- ✅ GitHub secrets for credentials
- ✅ No hardcoded passwords
- ✅ Secure SSH deployment

### 📁 Configuration Files

- `.github/workflows/ci.yml` - Pipeline definition
- `CI-CD-SETUP.md` - Setup documentation
- `scripts/test-ci-locally.sh` - Local testing

---

## 🎨 Live Dashboard Demo

### 1. Jaeger Distributed Tracing

**URL**: http://36.255.70.250:16686

**What to Show:**

1. Select Service: `delineate-hackathon-challenge`
2. Click "Find Traces"
3. Show recent API calls
4. Click on a trace to see:
   - Request timeline
   - Duration breakdown
   - HTTP details (method, status, URL)
   - Redis operations
   - S3 interactions

**Key Insights:**

- See the complete request flow
- Identify bottlenecks
- Track performance over time

### 2. MinIO Storage Dashboard

**URL**: http://36.255.70.250:9001

**What to Show:**

1. Login with `minioadmin` / `minioadmin`
2. Navigate to **Buckets** → **downloads**
3. Show uploaded files
4. Click on a file to see metadata
5. Demonstrate file upload:
   - Click "Upload" button
   - Select a test file
   - Save as `downloads/99999.zip`
   - Verify availability via API

### 3. API Documentation (Swagger)

**URL**: http://36.255.70.250:3000/docs

**What to Show:**

1. Interactive API explorer
2. Test endpoints live:
   - POST `/v1/download/initiate`
   - GET `/v1/download/status/{jobId}`
   - POST `/v1/download/check`
3. Show request/response schemas
4. Copy example requests

---

## 🎬 End-to-End Demo Flow

### Complete Workflow (5 minutes)

#### 1. Upload Test File (MinIO Console)

1. Open http://36.255.70.250:9001
2. Login: `minioadmin` / `minioadmin`
3. Navigate: Buckets → downloads
4. Upload file as: `downloads/99999.zip`

#### 2. Verify File Availability (Swagger UI)

1. Open http://36.255.70.250:3000/docs
2. Expand: POST `/v1/download/check`
3. Click "Try it out"
4. Enter: `{"file_id": 99999}`
5. Execute and show: `"available": true`

#### 3. Initiate Download (Swagger UI)

1. Expand: POST `/v1/download/initiate`
2. Click "Try it out"
3. Enter: `{"file_ids": [99999]}`
4. Execute and copy the `jobId`

#### 4. Monitor in Jaeger

1. Open http://36.255.70.250:16686
2. Service: `delineate-hackathon-challenge`
3. Click "Find Traces"
4. Show the POST `/v1/download/initiate` trace
5. Click on it to see detailed timeline

#### 5. Check Progress (Swagger UI)

1. Expand: GET `/v1/download/status/{jobId}`
2. Paste the jobId
3. Execute repeatedly to show progress:
   - `"status": "queued"` → `"processing"` → `"completed"`
   - `"progress": 0` → `100`

#### 6. Download the File (Browser/cURL)

```bash
# Using the Swagger UI
GET /v1/download/{jobId}
# Shows 302 redirect to presigned S3 URL

# Or via cURL
curl -L -o result.zip http://36.255.70.250:3000/v1/download/{jobId}
```

#### 7. Show SSE Real-Time Updates (Terminal)

```bash
# Open in a separate terminal
curl -N http://36.255.70.250:3000/v1/download/stream/{jobId}

# Watch events stream in real-time!
```

---

## 📊 Performance Metrics

### System Capabilities

| Metric                   | Value     |
| ------------------------ | --------- |
| API Response Time        | < 100ms   |
| Job Initiation           | < 1s      |
| Concurrent Jobs          | 5 workers |
| File Availability Check  | < 50ms    |
| Presigned URL Generation | < 100ms   |

### Scalability

- **Horizontal Scaling**: Add more worker containers
- **Load Balancing**: Nginx reverse proxy ready
- **Cache Layer**: Redis for job status
- **Storage**: MinIO supports clustering

---

## 🎯 Scoring Summary

| Challenge                       | Points    | Status        | Evidence                            |
| ------------------------------- | --------- | ------------- | ----------------------------------- |
| Challenge 1: S3 Storage         | 15        | ✅            | MinIO running, health check passing |
| Challenge 2: Async Architecture | 15        | ✅            | BullMQ, SSE, worker process         |
| Challenge 3: CI/CD Pipeline     | 10        | ✅            | GitHub Actions, auto-deploy         |
| **Total**                       | **40/50** | **Excellent** | All core challenges complete        |

### Bonus Achievements

- ✅ Jaeger distributed tracing (partial Challenge 4)
- ✅ Automated deployment
- ✅ Security scanning
- ✅ Slack notifications
- ✅ Docker optimization
- ✅ Comprehensive documentation

---

## 📚 Quick Reference Commands

```bash
# Base URL
BASE=http://36.255.70.250:3000

# 1. Health Check
curl -s $BASE/health | jq '.'

# 2. Check File Availability
curl -s -X POST $BASE/v1/download/check \
  -H "Content-Type: application/json" \
  -d '{"file_id": 70000}' | jq '.'

# 3. Initiate Download
JOB=$(curl -s -X POST $BASE/v1/download/initiate \
  -H "Content-Type: application/json" \
  -d '{"file_ids": [70000]}' | jq -r '.jobId')

# 4. Check Status
curl -s $BASE/v1/download/status/$JOB | jq '.'

# 5. Real-time Updates (SSE)
curl -N $BASE/v1/download/stream/$JOB

# 6. Download File
curl -L -o file.zip $BASE/v1/download/$JOB
```

---

## 🏆 Team Contact

**Team Name**: Somorpon  
**Repository**: https://github.com/shfahiim/cuet-micro-ops-hackthon-2025-somorpon  
**Live Demo**: http://36.255.70.250

---

**Thank you, judges! Questions welcome! 🙏**
