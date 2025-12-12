# Async Download Architecture - Implementation Complete ✅

This document describes the implementation of Challenge 2: Long-Running Download Architecture Design.

## Overview

The async download architecture solves the long-running download problem by:

- ✅ **Decoupling** request/response from processing using job queues
- ✅ **Real-time feedback** via SSE streaming with polling fallback
- ✅ **Proxy-friendly** with short-lived HTTP requests
- ✅ **Scalable** with stateless API and worker processes
- ✅ **Resilient** with job persistence and automatic retries

## Architecture Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     ASYNCHRONOUS DOWNLOAD ARCHITECTURE                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     │
│   │  Client  │────▶│  Nginx   │────▶│   API    │────▶│  Redis   │     │
│   │ (React)  │     │  Proxy   │     │  Server  │     │  Queue   │     │
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
│        └──────────────────────────────────────────▶│   S3     │        │
│                    Direct Download                 │ Storage  │        │
│                    (Presigned URL)                 └──────────┘        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Components

1. **API Server** (`src/index.ts`)
   - Accepts download requests, returns jobId immediately
   - Enqueues jobs to Redis queue via BullMQ
   - Streams real-time updates via Server-Sent Events (SSE)
   - Serves job status via polling endpoint (fallback)

2. **Worker Process** (`src/worker.ts`)
   - Processes download jobs asynchronously
   - Updates job status in Redis
   - Generates presigned S3 URLs on completion
   - Handles retries and error recovery

3. **Redis**
   - Job queue (BullMQ)
   - Job status cache (TTL: 24 hours)
   - Pub/Sub for SSE updates

4. **S3 Storage** (MinIO)
   - Stores completed download files
   - Serves files via presigned URLs (direct download)

## API Endpoints

### 1. POST /v1/download/initiate

Initiates an asynchronous download job.

**Request:**

```json
{
  "file_ids": [70000, 70001, 70002]
}
```

**Response (200 OK):**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "totalFileIds": 3,
  "estimatedTimeSeconds": 6
}
```

### 2. GET /v1/download/status/:jobId

Polls job status (fallback for SSE).

**Response (200 OK):**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "progress": 66,
  "completedFiles": 2,
  "totalFiles": 3,
  "downloadUrl": null,
  "size": null,
  "error": null,
  "createdAt": "2025-12-12T10:00:00Z",
  "updatedAt": "2025-12-12T10:01:30Z",
  "completedAt": null
}
```

**Status Values:**

- `queued` - Job accepted, waiting for worker
- `processing` - Worker is processing files
- `completed` - All files processed, downloadUrl available
- `failed` - Job failed, error message provided

### 3. GET /v1/download/stream/:jobId

Server-Sent Events stream for real-time updates.

**Response (text/event-stream):**

```
event: connected
data: {"jobId":"...","status":"queued",...}

event: progress
data: {"progress": 33, "completedFiles": 1, "totalFiles": 3}

event: progress
data: {"progress": 66, "completedFiles": 2, "totalFiles": 3}

event: completed
data: {"downloadUrl": "https://storage.example.com/...", "size": 1048576}
```

**Event Types:**

- `connected` - Initial connection with current status
- `progress` - Job progress update
- `completed` - Job finished successfully
- `failed` - Job failed with error
- `heartbeat` - Keep-alive ping (every 30s)

### 4. GET /v1/download/:jobId

Direct download endpoint (redirects to presigned S3 URL).

**Response (302 Found):**

```
Location: https://minio:9000/downloads/550e8400...?X-Amz-Signature=...
```

## Quick Start

### 1. Start Services with Docker

```bash
# Development mode (with hot reload)
npm run docker:dev

# Production mode
npm run docker:prod
```

This starts:

- API server on port 3000
- Worker process (background)
- Redis on port 6379
- MinIO on ports 9000 (API) and 9001 (Console)
- Jaeger on port 16686 (UI)

### 2. Test the Async API

```bash
# Run automated test suite
npm run test:async

# Or test manually:

# 1. Initiate a job
curl -X POST http://localhost:3000/v1/download/initiate \
  -H "Content-Type: application/json" \
  -d '{"file_ids": [70000, 70007, 70014]}'

# Response: {"jobId":"...","status":"queued",...}

# 2. Poll for status
curl http://localhost:3000/v1/download/status/<jobId>

# 3. Stream updates (SSE) - open in browser
open http://localhost:3000/v1/download/stream/<jobId>

# 4. Download when ready
curl -L http://localhost:3000/v1/download/<jobId>
```

### 3. Monitor Services

- **API Docs**: http://localhost:3000/docs
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)
- **Jaeger Tracing**: http://localhost:16686
- **Redis**: `redis-cli -h localhost -p 6379`

## Implementation Details

### Job Queue (BullMQ)

```typescript
// src/queue.ts
export const downloadQueue = new Queue<DownloadJobData, DownloadJobResult>(
  "downloads",
  {
    connection: { host: "redis", port: 6379 },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 3600 },
    },
  },
);
```

### Job Status Tracking (Redis)

```typescript
// src/job-status.ts
export interface JobStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  fileIds: number[];
  progress: number;
  completedFiles: number;
  totalFiles: number;
  downloadUrl: string | null;
  size: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
```

### Worker Processing

```typescript
// src/worker.ts
const worker = new Worker<DownloadJobData, DownloadJobResult>(
  "downloads",
  async (job) => {
    // 1. Mark as processing
    await markJobProcessing(job.data.jobId);

    // 2. Process files with simulated delay
    for (const fileId of job.data.fileIds) {
      const result = await checkS3Availability(fileId);
      // Update progress
      await updateJobProgress(job.data.jobId, completedFiles);
      await publishJobUpdate(job.data.jobId, "progress", {...});
    }

    // 3. Generate presigned URL
    const downloadUrl = await generatePresignedUrl(s3Key);

    // 4. Mark as completed
    await markJobCompleted(job.data.jobId, downloadUrl, totalSize);
    await publishJobUpdate(job.data.jobId, "completed", {...});
  },
  { concurrency: 5 },
);
```

### SSE Streaming

```typescript
// src/index.ts
app.openapi(downloadStreamRoute, async (c) => {
  const { jobId } = c.req.valid("param");

  return streamSSE(c, async (stream) => {
    const channel = `job:${jobId}:updates`;
    const subscriber = redis.duplicate();
    await subscriber.subscribe(channel);

    // Send initial status
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify(initialStatus),
    });

    // Listen for updates from worker
    subscriber.on("message", async (ch, message) => {
      const update = JSON.parse(message);
      await stream.writeSSE({
        event: update.event,
        data: JSON.stringify(update.data),
      });
    });
  });
});
```

## Configuration

### Environment Variables

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Job Configuration
JOB_TTL_SECONDS=86400              # 24 hours
PRESIGNED_URL_EXPIRY_SECONDS=900   # 15 minutes

# Download Delay Simulation
DOWNLOAD_DELAY_ENABLED=true
DOWNLOAD_DELAY_MIN_MS=10000        # 10 seconds
DOWNLOAD_DELAY_MAX_MS=120000       # 120 seconds
```

### Docker Compose Services

```yaml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: [redis_data:/data]
    command: redis-server --appendonly yes

  delineate-app:
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - redis

  delineate-worker:
    command: npm run worker
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - redis
```

## Error Handling

### Idempotency

- Use jobId as idempotency key
- Duplicate requests return existing job status
- Redis distributed lock prevents race conditions

### Job Expiration

- Completed jobs: 24-hour TTL
- Failed jobs: 1-hour TTL
- Queued jobs: 1-hour timeout

### Worker Failures

- BullMQ automatic retry (3 attempts)
- Exponential backoff: 1s, 5s, 15s
- Dead letter queue for manual review

### Client Disconnection

- SSE: Server continues processing
- Polling: Client can reconnect anytime
- Job status persists in Redis

## Performance

### Scalability

**Horizontal Scaling:**

- API servers: Stateless, scale to N instances
- Workers: Scale based on queue depth
- Redis: Single instance or cluster for HA

**Capacity Planning:**

```
Assumptions:
- Average download time: 30 seconds
- Peak concurrent downloads: 1000
- Worker concurrency: 5 jobs/worker

Required workers: 1000 / 5 = 200 workers
Redis memory: ~100MB for 10K active jobs
```

### Optimization

1. **Connection Pooling**
   - Redis: 10 connections per API instance
   - S3: Reuse HTTP connections

2. **Caching**
   - Cache S3 availability checks (5 minutes)
   - Cache presigned URLs (1 hour)

3. **Batching**
   - Process multiple files per job
   - Batch Redis updates (every 5 seconds)

## Testing

### Automated Tests

```bash
# Run async API test suite
npm run test:async

# Run E2E tests
npm run test:e2e
```

### Manual Testing

```bash
# 1. Start services
npm run docker:dev

# 2. Check health
curl http://localhost:3000/health

# 3. Initiate job
curl -X POST http://localhost:3000/v1/download/initiate \
  -H "Content-Type: application/json" \
  -d '{"file_ids": [70000, 70007, 70014]}'

# 4. Poll status
curl http://localhost:3000/v1/download/status/<jobId>

# 5. Test SSE (in browser)
open http://localhost:3000/v1/download/stream/<jobId>
```

## Monitoring

### Key Metrics

- Jobs queued/processing/completed/failed (gauge)
- Job processing time (histogram)
- Queue depth (gauge)
- Worker utilization (gauge)
- SSE connection count (gauge)
- API response time (histogram)

### Logs

```bash
# API server logs
docker logs delineate-app -f

# Worker logs
docker logs delineate-worker -f

# Redis logs
docker logs delineate-redis -f
```

## Comparison: Sync vs Async

| Aspect             | Synchronous (Old)          | Asynchronous (New)     |
| ------------------ | -------------------------- | ---------------------- |
| **Response Time**  | 10-120 seconds             | < 100ms                |
| **Proxy Timeout**  | ❌ Fails at 60-100s        | ✅ No timeout issues   |
| **User Feedback**  | ❌ No progress             | ✅ Real-time updates   |
| **Scalability**    | ❌ Limited by connections  | ✅ Unlimited jobs      |
| **Resilience**     | ❌ Lost on disconnect      | ✅ Persisted in Redis  |
| **Resource Usage** | ❌ High (open connections) | ✅ Low (async workers) |

## Next Steps

### Frontend Integration (Optional)

Create a React app with:

```typescript
// hooks/useDownload.ts
export function useDownload(fileIds: number[]) {
  const [state, setState] = useState<DownloadStatus>({
    jobId: null,
    status: "idle",
    progress: 0,
    downloadUrl: null,
    error: null,
  });

  const startDownload = async () => {
    // 1. Initiate download
    const response = await fetch("/v1/download/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_ids: fileIds }),
    });
    const { jobId } = await response.json();

    // 2. Try SSE first
    connectSSE(jobId);

    // 3. Fallback to polling after 5 seconds
    setTimeout(() => {
      if (eventSourceRef.current?.readyState !== EventSource.OPEN) {
        startPolling(jobId);
      }
    }, 5000);
  };

  return { ...state, startDownload };
}
```

### Production Deployment

1. **Nginx Configuration** for SSE:

```nginx
location /v1/download/stream {
    proxy_pass http://api:3000;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    chunked_transfer_encoding on;
}
```

2. **Redis Cluster** for high availability
3. **Worker Auto-scaling** based on queue depth
4. **Monitoring** with Prometheus + Grafana

## Conclusion

The async download architecture successfully solves the long-running download problem by:

✅ Decoupling request/response from processing  
✅ Providing real-time feedback via SSE with polling fallback  
✅ Being proxy-friendly with short-lived HTTP requests  
✅ Enabling horizontal scaling with stateless components  
✅ Ensuring resilience with job persistence and retries

**Challenge 2: COMPLETE** ✅
