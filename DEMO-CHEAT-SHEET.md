# 🎯 DEMO CHEAT SHEET - Quick Reference

## 📋 Essential URLs

```
API:        http://36.255.70.250:3000
Docs:       http://36.255.70.250:3000/docs
Health:     http://36.255.70.250:3000/health
MinIO:      http://36.255.70.250:9001 (minioadmin/minioadmin)
Jaeger:     http://36.255.70.250:16686
GitHub:     https://github.com/shfahiim/cuet-micro-ops-hackthon-2025-somorpon/actions
```

## ⚡ Quick Demo Script (2 Minutes)

### 1. Show System Health

```bash
curl -s http://36.255.70.250:3000/health | jq '.'
```

**Say**: "All services healthy - S3 storage and Redis are operational"

### 2. Initiate Async Download

```bash
JOB=$(curl -s -X POST http://36.255.70.250:3000/v1/download/initiate \
  -H "Content-Type: application/json" \
  -d '{"file_ids": [70000, 14000, 21000]}' | tee /dev/tty | jq -r '.jobId')
```

**Say**: "Job created instantly - no waiting for processing"

### 3. Show Real-Time Progress

```bash
curl -N http://36.255.70.250:3000/v1/download/stream/$JOB
```

**Say**: "Server-Sent Events provide real-time updates"

### 4. Check Final Status (in another terminal)

```bash
curl -s http://36.255.70.250:3000/v1/download/status/$JOB | jq '{status, progress, downloadUrl}'
```

**Say**: "Job completed with presigned S3 URL for download"

### 5. Show in Jaeger

**Open**: http://36.255.70.250:16686  
**Say**: "Complete request tracing from API to worker to S3"

## 🎨 Dashboard Demo Sequence

### Jaeger (1 minute)

1. Open http://36.255.70.250:16686
2. Service: `delineate-hackathon-challenge`
3. Find Traces → Click latest trace
4. **Highlight**: Request duration, operations, timing

### MinIO (1 minute)

1. Open http://36.255.70.250:9001
2. Login: minioadmin/minioadmin
3. Buckets → downloads → downloads/
4. **Show**: Files 70000.zip, 14000.zip, 21000.zip

### Swagger UI (1 minute)

1. Open http://36.255.70.250:3000/docs
2. Try POST /v1/download/initiate
3. **Execute** live request
4. Copy jobId → Test GET /v1/download/status/{jobId}

## 🏆 Key Points to Emphasize

### Challenge 1: S3 Storage

✅ "MinIO self-hosted S3 storage integrated"  
✅ "Health check confirms storage connectivity"  
✅ "Files stored with presigned URL generation"

### Challenge 2: Async Architecture

✅ "Solves timeout issues with async job queue"  
✅ "Real-time updates via Server-Sent Events"  
✅ "Background worker processes downloads"  
✅ "Redis-backed job status tracking"

### Challenge 3: CI/CD

✅ "GitHub Actions pipeline with 6 stages"  
✅ "Automated testing, building, scanning, deployment"  
✅ "Deploys on every push to main"  
✅ "Slack notifications for build status"

## 🎯 Score Breakdown

```
Challenge 1: S3 Integration        15/15 ✅
Challenge 2: Async Architecture    15/15 ✅
Challenge 3: CI/CD Pipeline        10/10 ✅
Challenge 4: Observability         Partial (Jaeger implemented)
─────────────────────────────────────────
TOTAL:                             40/50 ✅
```

## 🔥 Impressive Features

1. **Production-Ready**: Running on live server with public IP
2. **Full Async Stack**: BullMQ + Redis + Worker process
3. **Real-Time**: SSE streaming for instant updates
4. **Observability**: Jaeger tracing integrated
5. **Security**: Trivy scanning in CI/CD
6. **Automation**: Zero-touch deployment
7. **Documentation**: Comprehensive guides and architecture docs

## 🚀 If They Ask "Show Me It Working"

```bash
# One-liner complete demo
JOB=$(curl -s -X POST http://36.255.70.250:3000/v1/download/initiate \
  -H "Content-Type: application/json" \
  -d '{"file_ids": [70000]}' | jq -r '.jobId') && \
echo "Job ID: $JOB" && \
sleep 5 && \
curl -s http://36.255.70.250:3000/v1/download/status/$JOB | jq '{status, progress, downloadUrl}'
```

## 📱 Backup Demo (If Network Issues)

1. Show GitHub Actions pipeline (works offline from cache)
2. Show Jaeger UI with existing traces
3. Show MinIO console with uploaded files
4. Walk through code architecture in IDE
5. Show Docker Compose configuration

## 💡 Questions They Might Ask

**Q: Why use MinIO instead of AWS S3?**  
A: Self-hosted, no cloud costs, S3-compatible API, Challenge requirement

**Q: How does async help with timeouts?**  
A: Job returns in <1s, processing happens in background, client can disconnect

**Q: What if worker crashes?**  
A: BullMQ has retry logic, job remains in Redis queue

**Q: Can this scale?**  
A: Yes - add more workers, Redis supports clustering, MinIO supports distributed mode

**Q: What about security?**  
A: Trivy scanning, no hardcoded secrets, presigned URLs with expiry

## ⏱️ Time Management

```
5-min demo:  Health → Initiate → SSE → Jaeger → MinIO
3-min demo:  Health → Initiate → Status → Show URL
1-min demo:  Swagger UI live test + show GitHub Actions
```

## 🎬 Closing Statement

"We've built a production-ready async download system that solves real-world timeout issues, with complete CI/CD automation, distributed tracing, and self-hosted S3 storage. The system is live, tested, and ready for scale."

---

**Good luck! 🍀**
