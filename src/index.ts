import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { httpInstrumentationMiddleware } from "@hono/otel";
import { sentry } from "@hono/sentry";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { Scalar } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { streamSSE } from "hono/streaming";
import { timeout } from "hono/timeout";
import { rateLimiter } from "hono-rate-limiter";
import { env } from "./config.ts";
import { createJobStatus, getJobStatus } from "./job-status.ts";
import { addDownloadJob, closeQueue } from "./queue.ts";
import { closeRedis, redis } from "./redis.ts";
import { checkS3Availability, checkS3Health, closeS3Client } from "./s3.ts";

// Initialize OpenTelemetry SDK
const otelSDK = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "delineate-hackathon-challenge",
  }),
  traceExporter: new OTLPTraceExporter(),
});
otelSDK.start();

const app = new OpenAPIHono();

// Request ID middleware
app.use(async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("x-request-id", requestId);
  await next();
});

// Security headers middleware
app.use(secureHeaders());

// CORS middleware
app.use(
  cors({
    origin: env.CORS_ORIGINS,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposeHeaders: [
      "X-Request-ID",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
    ],
    maxAge: 86400,
  }),
);

// Request timeout middleware (except for SSE endpoints)
app.use("*", async (c, next) => {
  if (c.req.path.includes("/stream")) {
    await next();
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    await timeout(env.REQUEST_TIMEOUT_MS)(c, next);
  }
});

// Rate limiting middleware
app.use(
  rateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: "draft-6",
    keyGenerator: (c) =>
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "anonymous",
  }),
);

// OpenTelemetry middleware
app.use(
  httpInstrumentationMiddleware({
    serviceName: "delineate-hackathon-challenge",
  }),
);

// Sentry middleware
app.use(
  sentry({
    dsn: env.SENTRY_DSN,
  }),
);

// Error response schema
const ErrorResponseSchema = z
  .object({
    error: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
  })
  .openapi("ErrorResponse");

// Error handler
app.onError((err, c) => {
  const sentry = c.get("sentry") as { captureException: (err: Error) => void };
  sentry.captureException(err);
  const requestId = c.get("requestId") as string | undefined;
  return c.json(
    {
      error: "Internal Server Error",
      message:
        env.NODE_ENV === "development"
          ? err.message
          : "An unexpected error occurred",
      requestId,
    },
    500,
  );
});

// Schemas
const MessageResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi("MessageResponse");

const HealthResponseSchema = z
  .object({
    status: z.enum(["healthy", "unhealthy"]),
    checks: z.object({
      storage: z.enum(["ok", "error"]),
      redis: z.enum(["ok", "error"]),
    }),
  })
  .openapi("HealthResponse");

// Download API Schemas
const DownloadInitiateRequestSchema = z
  .object({
    file_ids: z
      .array(z.number().int().min(10000).max(100000000))
      .min(1)
      .max(1000)
      .openapi({ description: "Array of file IDs (10K to 100M)" }),
  })
  .openapi("DownloadInitiateRequest");

const DownloadInitiateResponseSchema = z
  .object({
    jobId: z.string().openapi({ description: "Unique job identifier" }),
    status: z.enum(["queued"]),
    totalFileIds: z.number().int(),
    estimatedTimeSeconds: z.number().int().optional(),
  })
  .openapi("DownloadInitiateResponse");

const JobStatusResponseSchema = z
  .object({
    jobId: z.string(),
    status: z.enum(["queued", "processing", "completed", "failed"]),
    progress: z.number().int().min(0).max(100),
    completedFiles: z.number().int(),
    totalFiles: z.number().int(),
    downloadUrl: z.string().nullable(),
    size: z.number().int().nullable(),
    error: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    completedAt: z.string().nullable(),
  })
  .openapi("JobStatusResponse");

const DownloadCheckRequestSchema = z
  .object({
    file_id: z
      .number()
      .int()
      .min(10000)
      .max(100000000)
      .openapi({ description: "Single file ID to check (10K to 100M)" }),
  })
  .openapi("DownloadCheckRequest");

const DownloadCheckResponseSchema = z
  .object({
    file_id: z.number().int(),
    available: z.boolean(),
    s3Key: z
      .string()
      .nullable()
      .openapi({ description: "S3 object key if available" }),
    size: z
      .number()
      .int()
      .nullable()
      .openapi({ description: "File size in bytes" }),
  })
  .openapi("DownloadCheckResponse");

// Routes
const rootRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["General"],
  summary: "Root endpoint",
  description: "Returns a welcome message",
  responses: {
    200: {
      description: "Successful response",
      content: {
        "application/json": {
          schema: MessageResponseSchema,
        },
      },
    },
  },
});

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["Health"],
  summary: "Health check endpoint",
  description: "Returns the health status of the service and its dependencies",
  responses: {
    200: {
      description: "Service is healthy",
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
    },
    503: {
      description: "Service is unhealthy",
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
    },
  },
});

app.openapi(rootRoute, (c) => {
  return c.json({ message: "Hello Hono!" }, 200);
});

app.openapi(healthRoute, async (c) => {
  const storageHealthy = await checkS3Health();
  let redisHealthy = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await redis.ping();
    redisHealthy = true;
  } catch {
    redisHealthy = false;
  }

  const status = storageHealthy && redisHealthy ? "healthy" : "unhealthy";
  const httpStatus = status === "healthy" ? 200 : 503;

  return c.json(
    {
      status,
      checks: {
        storage: storageHealthy ? "ok" : "error",
        redis: redisHealthy ? "ok" : "error",
      },
    },
    httpStatus,
  );
});

// Download API Routes
const downloadInitiateRoute = createRoute({
  method: "post",
  path: "/v1/download/initiate",
  tags: ["Download"],
  summary: "Initiate async download job",
  description:
    "Initiates an asynchronous download job and returns immediately with a jobId. Use /v1/download/status/:jobId to poll for status or /v1/download/stream/:jobId for real-time updates.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: DownloadInitiateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Download job initiated",
      content: {
        "application/json": {
          schema: DownloadInitiateResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(downloadInitiateRoute, async (c) => {
  const { file_ids } = c.req.valid("json");
  const jobId = crypto.randomUUID();

  // Create job status in Redis
  await createJobStatus(jobId, file_ids);

  // Add job to queue
  await addDownloadJob(jobId, file_ids);

  // Estimate time based on file count (rough estimate)
  const estimatedTimeSeconds = Math.ceil(file_ids.length * 2);

  return c.json(
    {
      jobId,
      status: "queued" as const,
      totalFileIds: file_ids.length,
      estimatedTimeSeconds,
    },
    200,
  );
});

// Job status polling endpoint
const downloadStatusRoute = createRoute({
  method: "get",
  path: "/v1/download/status/:jobId",
  tags: ["Download"],
  summary: "Get job status (polling)",
  description:
    "Polls the status of a download job. Use this as a fallback when SSE is not available.",
  request: {
    params: z.object({
      jobId: z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: "Job status",
      content: {
        "application/json": {
          schema: JobStatusResponseSchema,
        },
      },
    },
    404: {
      description: "Job not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(downloadStatusRoute, async (c) => {
  const { jobId } = c.req.valid("param");
  const status = await getJobStatus(jobId);

  if (!status) {
    return c.json(
      {
        error: "Not Found",
        message: `Job ${jobId} not found or expired`,
      },
      404,
    );
  }

  return c.json(status, 200);
});

// SSE streaming endpoint
const downloadStreamRoute = createRoute({
  method: "get",
  path: "/v1/download/stream/:jobId",
  tags: ["Download"],
  summary: "Stream job updates (SSE)",
  description:
    "Server-Sent Events stream for real-time job updates. Sends progress, completed, and failed events.",
  request: {
    params: z.object({
      jobId: z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: "SSE stream",
      content: {
        "text/event-stream": {
          schema: z.object({}),
        },
      },
    },
    404: {
      description: "Job not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(downloadStreamRoute, async (c) => {
  const { jobId } = c.req.valid("param");

  // Check if job exists
  const initialStatus = await getJobStatus(jobId);
  if (!initialStatus) {
    return c.json(
      {
        error: "Not Found",
        message: `Job ${jobId} not found or expired`,
      },
      404,
    );
  }

  return streamSSE(c, async (stream) => {
    const channel = `job:${jobId}:updates`;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const subscriber = redis.duplicate();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await subscriber.subscribe(channel);

    // Send initial status
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify(initialStatus),
    });

    // Send heartbeat every 30 seconds
    const heartbeatInterval = setInterval(() => {
      void stream.writeSSE({
        event: "heartbeat",
        data: JSON.stringify({ timestamp: new Date().toISOString() }),
      });
    }, 30000);

    // Listen for updates
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    subscriber.on("message", (ch: string, message: string) => {
      if (ch === channel) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const update = JSON.parse(message);
        void stream.writeSSE({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          event: update.event as string,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          data: JSON.stringify(update.data),
        });

        // Close stream on completion or failure
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (update.event === "completed" || update.event === "failed") {
          clearInterval(heartbeatInterval);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          void subscriber.quit();
          void stream.close();
        }
      }
    });

    // Cleanup on client disconnect
    stream.onAbort(() => {
      clearInterval(heartbeatInterval);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      void subscriber.quit();
    });
  });
});

// Direct download endpoint (redirects to presigned URL)
const downloadFileRoute = createRoute({
  method: "get",
  path: "/v1/download/:jobId",
  tags: ["Download"],
  summary: "Download file",
  description:
    "Redirects to the presigned S3 URL for direct download. Only works for completed jobs.",
  request: {
    params: z.object({
      jobId: z.string().min(1),
    }),
  },
  responses: {
    302: {
      description: "Redirect to download URL",
    },
    404: {
      description: "Job not found or not completed",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(downloadFileRoute, async (c) => {
  const { jobId } = c.req.valid("param");
  const status = await getJobStatus(jobId);

  if (!status) {
    return c.json(
      {
        error: "Not Found",
        message: `Job ${jobId} not found or expired`,
      },
      404,
    );
  }

  if (status.status !== "completed" || !status.downloadUrl) {
    return c.json(
      {
        error: "Not Ready",
        message: `Job ${jobId} is not completed yet. Current status: ${status.status}`,
      },
      404,
    );
  }

  return c.redirect(status.downloadUrl, 302);
});

// Legacy check endpoint (for backward compatibility)
const downloadCheckRoute = createRoute({
  method: "post",
  path: "/v1/download/check",
  tags: ["Download"],
  summary: "Check download availability",
  description:
    "Checks if a single ID is available for download in S3. Add ?sentry_test=true to trigger an error for Sentry testing.",
  request: {
    query: z.object({
      sentry_test: z.string().optional().openapi({
        description:
          "Set to 'true' to trigger an intentional error for Sentry testing",
      }),
    }),
    body: {
      content: {
        "application/json": {
          schema: DownloadCheckRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Availability check result",
      content: {
        "application/json": {
          schema: DownloadCheckResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

app.openapi(downloadCheckRoute, async (c) => {
  const { sentry_test } = c.req.valid("query");
  const { file_id } = c.req.valid("json");

  // Intentional error for Sentry testing
  if (sentry_test === "true") {
    throw new Error(
      `Sentry test error triggered for file_id=${String(file_id)} - This should appear in Sentry!`,
    );
  }

  const s3Result = await checkS3Availability(file_id);
  return c.json(
    {
      file_id,
      ...s3Result,
    },
    200,
  );
});

// OpenAPI spec endpoint
app.doc("/openapi", {
  openapi: "3.0.0",
  info: {
    title: "Delineate Hackathon Challenge API",
    version: "2.0.0",
    description:
      "Async download API with job queue, SSE streaming, and polling support",
  },
  servers: [
    { url: "http://localhost:3000", description: "Local server" },
    { url: "https://your-domain.com", description: "Production server" },
  ],
});

// Scalar API docs
app.get("/docs", Scalar({ url: "/openapi" }));

// Graceful shutdown handler
const gracefulShutdown =
  (server: ServerType) =>
  async (signal: string): Promise<never> => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);

    server.close(() => {
      console.log("HTTP server closed");
    });

    // Shutdown OpenTelemetry
    await otelSDK.shutdown();
    console.log("OpenTelemetry SDK shut down");

    // Close connections
    await closeQueue();
    await closeRedis();
    closeS3Client();

    console.log("Graceful shutdown completed");
    // eslint-disable-next-line n/no-process-exit
    process.exit(0);
  };

// Start server
const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(
      `🚀 Server is running on http://localhost:${String(info.port)}`,
    );
    console.log(`Environment: ${env.NODE_ENV}`);
    console.log(`API docs: http://localhost:${String(info.port)}/docs`);
    console.log(`OpenAPI spec: http://localhost:${String(info.port)}/openapi`);
    console.log(`Redis: ${env.REDIS_HOST}:${String(env.REDIS_PORT)}`);
  },
);

// Register shutdown handlers
const shutdown = gracefulShutdown(server);
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
