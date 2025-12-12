import { Queue } from "bullmq";
import { env } from "./config.ts";

// Job data types
export interface DownloadJobData {
  jobId: string;
  fileIds: number[];
}

export interface DownloadJobResult {
  jobId: string;
  status: "completed" | "failed";
  downloadUrl: string | null;
  totalFiles: number;
  completedFiles: number;
  size: number | null;
  error: string | null;
  completedAt: string;
}

// Create download queue
export const downloadQueue = new Queue<DownloadJobData, DownloadJobResult>(
  "downloads",
  {
    connection: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: {
        age: env.JOB_TTL_SECONDS,
        count: 1000,
      },
      removeOnFail: {
        age: 3600, // 1 hour
      },
    },
  },
);

// Add job to queue
export const addDownloadJob = async (
  jobId: string,
  fileIds: number[],
): Promise<void> => {
  await downloadQueue.add(
    "download",
    { jobId, fileIds },
    {
      jobId, // Use our jobId as the BullMQ job ID
    },
  );
  console.log(`[Queue] Added job ${jobId} with ${String(fileIds.length)} files`);
};

// Close queue connection
export const closeQueue = async (): Promise<void> => {
  await downloadQueue.close();
  console.log("Queue connection closed");
};
