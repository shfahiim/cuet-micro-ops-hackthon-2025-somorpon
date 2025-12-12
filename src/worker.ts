import { Worker } from "bullmq";
import { env } from "./config.ts";
import {
  markJobCompleted,
  markJobFailed,
  markJobProcessing,
  publishJobUpdate,
  updateJobProgress,
} from "./job-status.ts";
import type { DownloadJobData, DownloadJobResult } from "./queue.ts";
import { closeRedis } from "./redis.ts";
import {
  checkS3Availability,
  generatePresignedUrl,
  closeS3Client,
} from "./s3.ts";

// Random delay helper for simulating long-running downloads
const getRandomDelay = (): number => {
  if (!env.DOWNLOAD_DELAY_ENABLED) return 0;
  const min = env.DOWNLOAD_DELAY_MIN_MS;
  const max = env.DOWNLOAD_DELAY_MAX_MS;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Process download job
const processDownloadJob = async (
  jobData: DownloadJobData,
): Promise<DownloadJobResult> => {
  const { jobId, fileIds } = jobData;
  const startTime = Date.now();

  console.log(
    `[Worker] Processing job ${jobId} with ${String(fileIds.length)} files`,
  );

  // Mark job as processing
  await markJobProcessing(jobId);
  await publishJobUpdate(jobId, "progress", {
    progress: 0,
    completedFiles: 0,
    totalFiles: fileIds.length,
  });

  // Simulate processing delay
  const delayMs = getRandomDelay();
  const delaySec = (delayMs / 1000).toFixed(1);
  console.log(`[Worker] Job ${jobId} will take ${delaySec}s to process`);
  await sleep(delayMs);

  // Process each file
  let completedFiles = 0;
  let totalSize = 0;
  const availableFiles: { fileId: number; s3Key: string; size: number }[] = [];

  for (const fileId of fileIds) {
    const result = await checkS3Availability(fileId);

    if (result.available && result.s3Key && result.size) {
      availableFiles.push({
        fileId,
        s3Key: result.s3Key,
        size: result.size,
      });
      totalSize += result.size;
    }

    completedFiles++;

    // Update progress
    await updateJobProgress(jobId, completedFiles);
    await publishJobUpdate(jobId, "progress", {
      progress: Math.round((completedFiles / fileIds.length) * 100),
      completedFiles,
      totalFiles: fileIds.length,
    });

    console.log(
      `[Worker] Job ${jobId}: Processed ${String(completedFiles)}/${String(fileIds.length)} files`,
    );
  }

  const processingTimeMs = Date.now() - startTime;

  // Check if any files were available
  if (availableFiles.length === 0) {
    const error = "No files available for download";
    await markJobFailed(jobId, error);
    await publishJobUpdate(jobId, "failed", { error });

    console.log(
      `[Worker] Job ${jobId} failed: ${error} (${String(processingTimeMs)}ms)`,
    );

    return {
      jobId,
      status: "failed",
      downloadUrl: null,
      totalFiles: fileIds.length,
      completedFiles,
      size: null,
      error,
      completedAt: new Date().toISOString(),
    };
  }

  // Generate presigned URL for the first available file
  // In a real implementation, you would create a ZIP of all files
  const firstFile = availableFiles[0];
  const downloadUrl = await generatePresignedUrl(firstFile.s3Key);

  // Mark job as completed
  await markJobCompleted(jobId, downloadUrl, totalSize);
  await publishJobUpdate(jobId, "completed", {
    downloadUrl,
    size: totalSize,
    availableFiles: availableFiles.length,
  });

  console.log(
    `[Worker] Job ${jobId} completed: ${String(availableFiles.length)}/${String(fileIds.length)} files available (${String(processingTimeMs)}ms)`,
  );

  return {
    jobId,
    status: "completed",
    downloadUrl,
    totalFiles: fileIds.length,
    completedFiles,
    size: totalSize,
    error: null,
    completedAt: new Date().toISOString(),
  };
};

// Create worker
const worker = new Worker<DownloadJobData, DownloadJobResult>(
  "downloads",
  async (job) => {
    const jobIdStr: string = job.id?.toString() ?? "unknown";
    console.log(`[Worker] Starting job ${jobIdStr}`);
    return await processDownloadJob(job.data);
  },
  {
    connection: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
    },
    concurrency: 5, // Process 5 jobs concurrently
  },
);

// Worker event handlers
worker.on("completed", (job) => {
  const jobIdStr: string = job.id?.toString() ?? "unknown";
  console.log(`[Worker] ✅ Job ${jobIdStr} completed`);
});

worker.on("failed", (job, err) => {
  const jobIdStr = job?.id?.toString() ?? "unknown";
  console.error(`[Worker] ❌ Job ${jobIdStr} failed:`, err);
});

worker.on("error", (err) => {
  console.error("[Worker] ❌ Worker error:", err);
});

console.log("🚀 Worker started and waiting for jobs...");
console.log(`Environment: ${env.NODE_ENV}`);
console.log(`Redis: ${env.REDIS_HOST}:${String(env.REDIS_PORT)}`);
console.log(`Concurrency: 5 jobs`);

// Graceful shutdown
const gracefulShutdown = async (signal: string): Promise<never> => {
  console.log(`\n${signal} received. Shutting down worker...`);

  await worker.close();
  console.log("Worker closed");

  await closeRedis();
  closeS3Client();

  console.log("Graceful shutdown completed");
  // eslint-disable-next-line n/no-process-exit
  process.exit(0);
};

process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});
