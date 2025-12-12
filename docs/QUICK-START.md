# Quick Start Guide

Get the hackathon project running in 5 minutes.

---

## ⚡ Prerequisites

Ensure you have these installed:

```bash
# Check Node.js version (need >= 24.10.0)
node --version

# Check npm version (need >= 10.x)
npm --version

# Check Docker version (need >= 24.x)
docker --version

# Check Docker Compose version (need >= 2.x)
docker compose version
```

If any are missing, install them first.

---

## 🚀 Step 1: Install Dependencies

```bash
cd cuet-micro-ops-hackthon-2025-somorpon
npm install
```

---

## 🐳 Step 2: Start Docker Services

```bash
# Start all services (MinIO, Jaeger, API)
docker compose -f docker/compose.dev.yml up --build
```

**Wait for these messages:**

```
✅ Bucket downloads created successfully!
Server is running on http://localhost:3000
```

This takes about 30-60 seconds on first run.

---

## ✅ Step 3: Verify Everything Works

Open a **new terminal** and run:

```bash
# Test health endpoint
curl http://localhost:3000/health
```

**Expected output:**

```json
{ "status": "healthy", "checks": { "storage": "ok" } }
```

If you see `"storage":"ok"`, you're good to go! ✅

---

## 🧪 Step 4: Run Tests

```bash
npm run test:e2e
```

All tests should pass ✅

---

## 🌐 Step 5: Access Services

Open these URLs in your browser:

| Service               | URL                        | Credentials             |
| --------------------- | -------------------------- | ----------------------- |
| **API Documentation** | http://localhost:3000/docs | -                       |
| **MinIO Console**     | http://localhost:9001      | minioadmin / minioadmin |
| **Jaeger Tracing**    | http://localhost:16686     | -                       |

---

## 🎯 Test the API

### Test 1: Check File Availability

```bash
curl -X POST http://localhost:3000/v1/download/check \
  -H "Content-Type: application/json" \
  -d '{"file_id": 70000}'
```

### Test 2: Initiate Download Job

```bash
curl -X POST http://localhost:3000/v1/download/initiate \
  -H "Content-Type: application/json" \
  -d '{"file_ids": [70000, 70001, 70002]}'
```

### Test 3: Long-Running Download (5-15s in dev mode)

```bash
curl -X POST http://localhost:3000/v1/download/start \
  -H "Content-Type: application/json" \
  -d '{"file_id": 70000}'
```

---

## 🛑 Stopping Services

```bash
# Stop and remove containers (keeps data)
docker compose -f docker/compose.dev.yml down

# Stop and remove everything including data
docker compose -f docker/compose.dev.yml down -v
```

---

## 🐛 Troubleshooting

### Problem: Health check returns `"storage":"error"`

**Solution:**

```bash
# Stop everything
docker compose -f docker/compose.dev.yml down -v

# Start again
docker compose -f docker/compose.dev.yml up --build

# Wait 30 seconds for MinIO to initialize
```

### Problem: Port 3000 already in use

**Solution:**

```bash
# Find what's using port 3000
sudo lsof -i :3000

# Kill the process
kill -9 <PID>

# Or change port in .env
echo "PORT=3001" >> .env
```

### Problem: Tests failing

**Solution:**

```bash
# Make sure Docker services are running
docker compose -f docker/compose.dev.yml ps

# Check if all services are healthy
docker ps

# Wait a bit longer and try again
sleep 30
npm run test:e2e
```

---

## 📚 Next Steps

1. **Review Implementation:** See `docs/IMPLEMENTATION-SUMMARY.md`
2. **Verify Milestones:** Follow `docs/VERIFICATION.md`
3. **Learn Docker Commands:** Check `docs/DOCKER-COMMANDS.md`
4. **Understand Architecture:** Read `ARCHITECTURE.md`

---

## 🎉 You're Ready!

The project is now running with:

- ✅ MinIO S3 storage
- ✅ Jaeger distributed tracing
- ✅ API server with OpenAPI docs
- ✅ Health checks passing
- ✅ E2E tests passing

**Total Points Achieved: 40/50 (80%)**

Happy hacking! 🚀
