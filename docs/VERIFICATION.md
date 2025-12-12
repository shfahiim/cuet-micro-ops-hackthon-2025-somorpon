# Verification Guide

This guide helps you verify that all milestones have been implemented correctly.

---

## ✅ Milestone 1: S3 Storage Integration

### Step 1: Start Docker Services

```bash
cd cuet-micro-ops-hackthon-2025-somorpon

# Clean up any existing containers
docker compose -f docker/compose.dev.yml down -v

# Start all services
docker compose -f docker/compose.dev.yml up --build
```

### Step 2: Watch for Success Messages

You should see these logs:

```
✅ Bucket downloads created successfully!
Server is running on http://localhost:3000
```

### Step 3: Verify Health Endpoint

Open a new terminal and run:

```bash
curl http://localhost:3000/health
```

**Expected Output:**

```json
{ "status": "healthy", "checks": { "storage": "ok" } }
```

### Step 4: Access MinIO Console (Optional)

1. Open browser: http://localhost:9001
2. Login with:
   - Username: `minioadmin`
   - Password: `minioadmin`
3. Verify the `downloads` bucket exists

### Step 5: Run E2E Tests

```bash
npm run test:e2e
```

**Expected:** All tests should pass ✅

---

## ✅ Milestone 2: CI/CD Pipeline

### Step 1: Commit and Push Changes

```bash
# Add all changes
git add .

# Commit
git commit -m "feat: add MinIO S3 storage and enhanced CI/CD pipeline"

# Push to trigger pipeline
git push origin main
```

### Step 2: Verify Pipeline Execution

1. Go to: https://github.com/shfahiim/cuet-micro-ops-hackthon-2025-somorpon/actions
2. Click on the latest workflow run
3. Verify all stages pass:
   - 🔍 Lint & Format
   - 🧪 E2E Tests (with MinIO)
   - 🐳 Build Docker Image
   - 🔒 Security Scan

### Step 3: Check CI Badge

The README should now show a green CI badge at the top.

---

## ✅ Milestone 3: Architecture Design

### Verification Checklist

Open `ARCHITECTURE.md` and verify it contains:

- [ ] Problem statement explaining timeout issues
- [ ] Architecture diagram showing components
- [ ] Technical approach (Hybrid SSE + Polling)
- [ ] API contract changes with examples
- [ ] Redis schema design
- [ ] Nginx proxy configuration
- [ ] Cloudflare configuration options
- [ ] React frontend integration code
- [ ] Implementation roadmap
- [ ] Error handling strategies
- [ ] Performance considerations
- [ ] Monitoring and observability
- [ ] Security considerations
- [ ] Cost analysis

---

## 🧪 Testing Commands

### Test Health Endpoint

```bash
curl http://localhost:3000/health
```

### Test Download Check

```bash
curl -X POST http://localhost:3000/v1/download/check \
  -H "Content-Type: application/json" \
  -d '{"file_id": 70000}'
```

### Test Download Initiate

```bash
curl -X POST http://localhost:3000/v1/download/initiate \
  -H "Content-Type: application/json" \
  -d '{"file_ids": [70000, 70001]}'
```

### Test Long-Running Download (Dev Mode)

```bash
# This should complete in 5-15 seconds
curl -X POST http://localhost:3000/v1/download/start \
  -H "Content-Type: application/json" \
  -d '{"file_id": 70000}'
```

### Access API Documentation

Open browser: http://localhost:3000/docs

### Access Jaeger Tracing UI

Open browser: http://localhost:16686

---

## 🐛 Troubleshooting

### MinIO Not Starting

**Problem:** Container exits or health check fails

**Solution:**

```bash
# Check logs
docker logs delineate-minio

# Verify port 9000 is not in use
sudo lsof -i :9000

# Clean up and restart
docker compose -f docker/compose.dev.yml down -v
docker compose -f docker/compose.dev.yml up --build
```

### Health Check Returns "storage": "error"

**Problem:** API can't connect to MinIO

**Solution:**

```bash
# Check if MinIO is healthy
docker ps

# Check MinIO logs
docker logs delineate-minio

# Check app logs
docker logs delineate-app

# Verify network connectivity
docker exec delineate-app ping minio
```

### E2E Tests Failing

**Problem:** Tests fail with connection errors

**Solution:**

```bash
# Ensure Docker services are running
docker compose -f docker/compose.dev.yml ps

# Wait for services to be fully ready (30 seconds)
sleep 30

# Run tests again
npm run test:e2e
```

### CI Pipeline Failing

**Problem:** GitHub Actions workflow fails

**Solution:**

1. Check the Actions tab for detailed error logs
2. Verify MinIO service container is healthy
3. Ensure all environment variables are set correctly
4. Check if bucket creation step succeeded

---

## 📊 Success Criteria

### Milestone 1 (15 points)

- [x] MinIO service running in Docker Compose
- [x] Bucket `downloads` created automatically
- [x] Health endpoint returns `"storage": "ok"`
- [x] E2E tests pass
- [x] MinIO console accessible

### Milestone 2 (10 points)

- [x] Enhanced CI/CD pipeline with 4 stages
- [x] MinIO service in GitHub Actions
- [x] npm caching enabled
- [x] Docker image build and push
- [x] Security scanning with Trivy
- [x] CI badge in README

### Milestone 3 (15 points)

- [x] Complete ARCHITECTURE.md document
- [x] Architecture diagram included
- [x] Technical approach justified
- [x] API contracts defined
- [x] Redis schema designed
- [x] Proxy configurations provided
- [x] Frontend integration examples

**Total Points Achieved: 40/50** (Milestone 4 is optional bonus)

---

## 🎯 Next Steps

If you want to pursue **Milestone 4 (Observability Dashboard)** for the bonus 10 points:

1. Create React frontend application
2. Integrate Sentry for error tracking
3. Add OpenTelemetry tracing
4. Build dashboard UI
5. Update Docker Compose with frontend service

See `PLAN.md` for detailed instructions on Milestone 4.
