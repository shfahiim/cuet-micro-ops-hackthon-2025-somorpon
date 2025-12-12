# Architecture Design: Long-Running Download System

## 1. Problem Statement

### Current Architecture Limitations

The existing synchronous download endpoint (`POST /v1/download/start`) faces critical issues when deployed behind reverse proxies:

**Connection Timeouts**

- Cloudflare: 100-second timeout for free/pro plans
- Nginx: Default 60-second proxy timeout
- AWS ALB: 60-second idle timeout
- Our downloads: 10-120 seconds (highly variable)

**User Experience Issues**

- No progress feedback during 2+ minute waits
- Browser timeout errors (504 Gateway Timeout)
- Users don't know if download is processing or failed
- Retry attempts create duplicate work

**Resource Exhaustion**

- Open HTTP connections consume server memory
- Thread/worker pool saturation under load
- Database connection pool depletion
- No horizontal scaling capability

**Failure Scenarios**

- User closes browser → server continues processing wastefully
- Network interruption → no way to resume
- Proxy timeout → user sees error but server completes successfully

---

## 2. Proposed Architecture

### High-Level System Design

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

### Component Responsibilities

**API Server (Hono)**

- Accepts download requests, returns jobId immediately
- Enqueues jobs to Redis queue
- Streams real-time updates via Server-Sent Events (SSE)
- Serves job status via polling endpoint (fallback)

**Worker Process (BullMQ)**

- Processes download jobs asynchronously
- Updates job status in Redis
- Generates presigned S3 URLs on completion
- Handles retries and error recovery

**Redis**

- Job queue (BullMQ)
- Job status cache (TTL: 24 hours)
- Rate limiting state
- Distributed locks for idempotency

**S3 Storage (MinIO)**

- Stores completed download files
- Serves files via presigned URLs (direct download)
- No proxy bottleneck for large files

---

## 3. Technical Approach: Hybrid SSE + Polling

### Why Hybrid?

| Pattern       | Pros                     | Cons                  | Use Case              |
| ------------- | ------------------------ | --------------------- | --------------------- |
| **Polling**   | Simple, works everywhere | More requests, delay  | Fallback, mobile apps |
| **SSE**       | Real-time, efficient     | Proxy support varies  | Primary for web       |
| **WebSocket** | Bi-directional           | Complex, overkill     | Not needed here       |
| **Webhook**   | Decoupled                | Requires callback URL | Server-to-server      |

**Decision: SSE with Polling Fallback**

- SSE for real-time updates (web browsers)
- Polling for environments where SSE fails (corporate proxies, mobile)
- Automatic fallback detection in client

---

## 4. API Contract Changes

### New Endpoints

#### POST /v1/download/initiate

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
  "estimatedTimeSeconds": 45
}
```

#### GET /v1/download/status/:jobId

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
  "error": null,
  "createdAt": "2025-12-12T10:00:00Z",
  "updatedAt": "2025-12-12T10:01:30Z"
}
```

**Status Values:**

- `queued` - Job accepted, waiting for worker
- `processing` - Worker is processing files
- `completed` - All files processed, downloadUrl available
- `failed` - Job failed, error message provided

#### GET /v1/download/stream/:jobId

Server-Sent Events stream for real-time updates.

**Response (text/event-stream):**

```
event: progress
data: {"progress": 33, "completedFiles": 1, "totalFiles": 3}

event: progress
data: {"progress": 66, "completedFiles": 2, "totalFiles": 3}

event: completed
data: {"downloadUrl": "https://storage.example.com/...", "size": 1048576}
```

**Event Types:**

- `progress` - Job progress update
- `completed` - Job finished successfully
- `failed` - Job failed with error
- `heartbeat` - Keep-alive ping (every 30s)

#### GET /v1/download/:jobId

Direct download endpoint (redirects to presigned S3 URL).

**Response (302 Found):**

```
Location: https://minio:9000/downloads/550e8400...?X-Amz-Signature=...
```

---

## 5. Database/Cache Schema (Redis)

### Job Status Hash

```redis
# Key: job:{jobId}
# TTL: 86400 seconds (24 hours)
HSET job:550e8400-e29b-41d4-a716-446655440000
  status "processing"
  file_ids "[70000,70001,70002]"
  progress 66
  completed_files 2
  total_files 3
  download_url ""
  error ""
  created_at "2025-12-12T10:00:00Z"
  updated_at "2025-12-12T10:01:30Z"
  completed_at ""
```

### Job Queue (BullMQ)

```redis
# Queue: downloads:pending
# Sorted set with priority/timestamp
ZADD downloads:pending 1702382400 "550e8400-e29b-41d4-a716-446655440000"

# Processing set
SADD downloads:processing "550e8400-e29b-41d4-a716-446655440000"

# Completed set (for cleanup)
ZADD downloads:completed 1702382500 "550e8400-e29b-41d4-a716-446655440000"
```

### Rate Limiting

```redis
# Key: ratelimit:{userId}:{window}
# TTL: RATE_LIMIT_WINDOW_MS
INCR ratelimit:user123:1702382400
EXPIRE ratelimit:user123:1702382400 60
```

---

## 6. Proxy Configuration

### Nginx Configuration

```nginx
# SSE endpoint - long timeout, no buffering
location /v1/download/stream {
    proxy_pass http://api:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    # SSE-specific settings
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;  # 1 hour
    proxy_connect_timeout 10s;

    # Chunked transfer encoding
    chunked_transfer_encoding on;
}

# Regular API endpoints - standard timeout
location /v1/download {
    proxy_pass http://api:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    proxy_read_timeout 30s;
    proxy_connect_timeout 10s;
}
```

### Cloudflare Configuration

**Option 1: Cloudflare Workers (Recommended)**

```javascript
// worker.js - Proxy SSE through Cloudflare
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // SSE endpoints bypass Cloudflare timeout
    if (url.pathname.startsWith("/v1/download/stream")) {
      const response = await fetch(`${env.ORIGIN_URL}${url.pathname}`, {
        headers: request.headers,
      });

      // Pass through SSE stream
      return new Response(response.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Regular requests
    return fetch(request);
  },
};
```

**Option 2: Polling Only**

- Disable SSE for Cloudflare-proxied domains
- Use polling with 2-5 second intervals
- Cloudflare's 100s timeout is sufficient for polling

**Option 3: Enterprise Plan**

- Increase timeout to 600 seconds
- Enable WebSocket support
- Cost: $200+/month

---

## 7. Frontend Integration (React)

### Custom Hook: useDownload

```typescript
// hooks/useDownload.ts
import { useState, useEffect, useRef } from "react";

interface DownloadStatus {
  jobId: string | null;
  status: "idle" | "queued" | "processing" | "completed" | "failed";
  progress: number;
  downloadUrl: string | null;
  error: string | null;
}

export function useDownload(fileIds: number[]) {
  const [state, setState] = useState<DownloadStatus>({
    jobId: null,
    status: "idle",
    progress: 0,
    downloadUrl: null,
    error: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startDownload = async () => {
    try {
      // 1. Initiate download
      const response = await fetch("/v1/download/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_ids: fileIds }),
      });

      const { jobId, status } = await response.json();
      setState((prev) => ({ ...prev, jobId, status }));

      // 2. Try SSE first
      connectSSE(jobId);

      // 3. Fallback to polling after 5 seconds if SSE fails
      setTimeout(() => {
        if (eventSourceRef.current?.readyState !== EventSource.OPEN) {
          console.log("SSE failed, falling back to polling");
          startPolling(jobId);
        }
      }, 5000);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        status: "failed",
        error: error.message,
      }));
    }
  };

  const connectSSE = (jobId: string) => {
    const eventSource = new EventSource(`/v1/download/stream/${jobId}`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("progress", (event) => {
      const data = JSON.parse(event.data);
      setState((prev) => ({
        ...prev,
        status: "processing",
        progress: data.progress,
      }));
    });

    eventSource.addEventListener("completed", (event) => {
      const data = JSON.parse(event.data);
      setState((prev) => ({
        ...prev,
        status: "completed",
        progress: 100,
        downloadUrl: data.downloadUrl,
      }));
      eventSource.close();
    });

    eventSource.addEventListener("failed", (event) => {
      const data = JSON.parse(event.data);
      setState((prev) => ({
        ...prev,
        status: "failed",
        error: data.error,
      }));
      eventSource.close();
    });

    eventSource.onerror = () => {
      console.error("SSE connection error");
      eventSource.close();
    };
  };

  const startPolling = (jobId: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`/v1/download/status/${jobId}`);
        const data = await response.json();

        setState((prev) => ({
          ...prev,
          status: data.status,
          progress: data.progress,
          downloadUrl: data.downloadUrl,
          error: data.error,
        }));

        if (data.status === "completed" || data.status === "failed") {
          stopPolling();
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    };

    poll(); // Initial poll
    pollingIntervalRef.current = setInterval(poll, 3000); // Poll every 3s
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const cleanup = () => {
    eventSourceRef.current?.close();
    stopPolling();
  };

  useEffect(() => {
    return cleanup;
  }, []);

  return { ...state, startDownload, cleanup };
}
```

### React Component Example

```tsx
// components/DownloadManager.tsx
import { useDownload } from "../hooks/useDownload";

export function DownloadManager({ fileIds }: { fileIds: number[] }) {
  const { status, progress, downloadUrl, error, startDownload } =
    useDownload(fileIds);

  return (
    <div className="download-manager">
      {status === "idle" && (
        <button onClick={startDownload}>Download {fileIds.length} files</button>
      )}

      {(status === "queued" || status === "processing") && (
        <div className="progress">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
          <span>{progress}% complete</span>
        </div>
      )}

      {status === "completed" && downloadUrl && (
        <a href={downloadUrl} download className="download-link">
          Download Ready - Click Here
        </a>
      )}

      {status === "failed" && (
        <div className="error">Download failed: {error}</div>
      )}
    </div>
  );
}
```

---

## 8. Implementation Roadmap

### Phase 1: Backend Infrastructure (Week 1)

**Tasks:**

1. Add Redis to Docker Compose
2. Install BullMQ: `npm install bullmq`
3. Create worker process (`src/worker.ts`)
4. Implement job queue and status tracking
5. Update existing `/v1/download/start` to use queue

**Deliverables:**

- Working async job queue
- Job status persistence in Redis
- Basic worker processing

### Phase 2: API Endpoints (Week 1-2)

**Tasks:**

1. Implement `POST /v1/download/initiate`
2. Implement `GET /v1/download/status/:jobId`
3. Implement `GET /v1/download/stream/:jobId` (SSE)
4. Implement `GET /v1/download/:jobId` (redirect)
5. Add OpenAPI documentation

**Deliverables:**

- Complete API contract
- E2E tests for all endpoints
- Updated API documentation

### Phase 3: Frontend Integration (Week 2)

**Tasks:**

1. Create React app with Vite
2. Implement `useDownload` hook
3. Build download manager UI
4. Add progress indicators
5. Implement SSE with polling fallback

**Deliverables:**

- Working React application
- Real-time progress updates
- Graceful fallback handling

### Phase 4: Production Hardening (Week 3)

**Tasks:**

1. Configure nginx for SSE
2. Add job cleanup (TTL, completed jobs)
3. Implement rate limiting per user
4. Add monitoring and alerts
5. Load testing and optimization

**Deliverables:**

- Production-ready deployment
- Monitoring dashboards
- Performance benchmarks

---

## 9. Error Handling & Edge Cases

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

### S3 Failures

- Retry S3 operations (3 attempts)
- Fallback to error status
- Log to Sentry for investigation

---

## 10. Performance Considerations

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
- Worker concurrency: 10 jobs/worker

Required workers: 1000 / 10 = 100 workers
Redis memory: ~100MB for 10K active jobs
```

### Optimization Strategies

1. **Connection Pooling**
   - Redis: 10 connections per API instance
   - S3: Reuse HTTP connections

2. **Caching**
   - Cache S3 availability checks (5 minutes)
   - Cache presigned URLs (1 hour)

3. **Batching**
   - Process multiple files per job
   - Batch Redis updates (every 5 seconds)

4. **Resource Limits**
   - Max queue size: 100K jobs
   - Max job age: 24 hours
   - Rate limit: 100 requests/minute/user

---

## 11. Monitoring & Observability

### Key Metrics

**Job Metrics:**

- Jobs queued/processing/completed/failed (gauge)
- Job processing time (histogram)
- Queue depth (gauge)
- Worker utilization (gauge)

**API Metrics:**

- SSE connection count (gauge)
- SSE connection duration (histogram)
- Polling request rate (counter)
- API response time (histogram)

**Infrastructure Metrics:**

- Redis memory usage
- Redis connection count
- S3 request rate
- S3 error rate

### Alerts

```yaml
alerts:
  - name: HighQueueDepth
    condition: queue_depth > 10000
    severity: warning

  - name: HighJobFailureRate
    condition: failed_jobs / total_jobs > 0.1
    severity: critical

  - name: WorkerDown
    condition: active_workers == 0
    severity: critical

  - name: RedisDown
    condition: redis_up == 0
    severity: critical
```

---

## 12. Security Considerations

### Authentication & Authorization

- JWT tokens for API authentication
- User-specific job isolation
- Rate limiting per user/IP

### Presigned URL Security

- Short expiration (15 minutes)
- Single-use tokens (optional)
- IP whitelisting (optional)

### Input Validation

- File ID range validation (10K-100M)
- Max file count per job (1000)
- Job ID format validation (UUID)

### DDoS Protection

- Rate limiting at nginx level
- Cloudflare DDoS protection
- Redis-based distributed rate limiting

---

## 13. Cost Analysis

### Infrastructure Costs (Monthly)

| Component   | Specification              | Cost           |
| ----------- | -------------------------- | -------------- |
| API Servers | 2x 2vCPU, 4GB RAM          | $40            |
| Workers     | 4x 2vCPU, 4GB RAM          | $80            |
| Redis       | 1x 2GB memory              | $15            |
| S3 Storage  | 1TB storage, 10TB transfer | $50            |
| **Total**   |                            | **$185/month** |

### Cost Optimization

- Use spot instances for workers (50% savings)
- S3 lifecycle policies (move old files to Glacier)
- Cloudflare caching (reduce S3 transfer costs)

---

## 14. Conclusion

This architecture solves the long-running download problem by:

✅ **Decoupling** request/response from processing  
✅ **Real-time feedback** via SSE with polling fallback  
✅ **Proxy-friendly** with short-lived HTTP requests  
✅ **Scalable** with stateless API and worker processes  
✅ **Resilient** with job persistence and automatic retries  
✅ **User-friendly** with progress indicators and direct S3 downloads

The hybrid SSE + polling approach provides the best balance of real-time updates and compatibility, while the async job queue architecture enables horizontal scaling and graceful handling of variable processing times.
