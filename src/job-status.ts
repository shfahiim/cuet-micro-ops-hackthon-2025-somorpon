/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { env } from "./config.ts";
import { redis } from "./redis.ts";

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

const JOB_KEY_PREFIX = "job:";

// Get job key
const getJobKey = (jobId: string): string => `${JOB_KEY_PREFIX}${jobId}`;

// Create initial job status
export const createJobStatus = async (
  jobId: string,
  fileIds: number[],
): Promise<void> => {
  const now = new Date().toISOString();
  const jobData: JobStatus = {
    jobId,
    status: "queued",
    fileIds,
    progress: 0,
    completedFiles: 0,
    totalFiles: fileIds.length,
    downloadUrl: null,
    size: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  await redis.setex(
    getJobKey(jobId),
    env.JOB_TTL_SECONDS,
    JSON.stringify(jobData),
  );
};

// Get job status
export const getJobStatus = async (
  jobId: string,
): Promise<JobStatus | null> => {
  const data: string | null = await redis.get(getJobKey(jobId));
  if (!data) return null;
  return JSON.parse(data) as JobStatus;
};

// Update job status
export const updateJobStatus = async (
  jobId: string,
  updates: Partial<JobStatus>,
): Promise<void> => {
  const current = await getJobStatus(jobId);
  if (!current) {
    throw new Error(`Job ${jobId} not found`);
  }

  const updated: JobStatus = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  // Calculate progress
  if (updated.totalFiles > 0) {
    updated.progress = Math.round(
      (updated.completedFiles / updated.totalFiles) * 100,
    );
  }

  await redis.setex(
    getJobKey(jobId),
    env.JOB_TTL_SECONDS,
    JSON.stringify(updated),
  );
};

// Mark job as processing
export const markJobProcessing = async (jobId: string): Promise<void> => {
  await updateJobStatus(jobId, { status: "processing" });
};

// Mark job as completed
export const markJobCompleted = async (
  jobId: string,
  downloadUrl: string,
  size: number,
): Promise<void> => {
  await updateJobStatus(jobId, {
    status: "completed",
    downloadUrl,
    size,
    completedAt: new Date().toISOString(),
    progress: 100,
  });
};

// Mark job as failed
export const markJobFailed = async (
  jobId: string,
  error: string,
): Promise<void> => {
  await updateJobStatus(jobId, {
    status: "failed",
    error,
    completedAt: new Date().toISOString(),
  });
};

// Update job progress
export const updateJobProgress = async (
  jobId: string,
  completedFiles: number,
): Promise<void> => {
  await updateJobStatus(jobId, { completedFiles });
};

// Publish SSE event for job update
export const publishJobUpdate = async (
  jobId: string,
  eventType: "progress" | "completed" | "failed",
  data: Record<string, unknown>,
): Promise<void> => {
  const channel = `job:${jobId}:updates`;
  const message = JSON.stringify({ event: eventType, data });
  await redis.publish(channel, message);
};
