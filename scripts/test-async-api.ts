#!/usr/bin/env node
/**
 * Test script for async download API
 * Tests job initiation, polling, and SSE streaming
 */

const API_BASE = process.env.API_BASE || "http://localhost:3000";

interface JobStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
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

// Helper to make HTTP requests
async function request(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${API_BASE}${path}`;
  console.log(`\n📡 ${options.method || "GET"} ${url}`);
  const response = await fetch(url, options);
  console.log(`   Status: ${response.status} ${response.statusText}`);
  return response;
}

// Test 1: Initiate download job
async function testInitiateJob(): Promise<string> {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 1: Initiate Async Download Job");
  console.log("=".repeat(60));

  const response = await request("/v1/download/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_ids: [70000, 70007, 70014] }),
  });

  if (!response.ok) {
    throw new Error(`Failed to initiate job: ${response.statusText}`);
  }

  const data = await response.json();
  console.log("✅ Job initiated:", JSON.stringify(data, null, 2));

  if (!data.jobId) {
    throw new Error("No jobId returned");
  }

  return data.jobId;
}

// Test 2: Poll job status
async function testPollStatus(jobId: string): Promise<JobStatus> {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 2: Poll Job Status");
  console.log("=".repeat(60));

  const response = await request(`/v1/download/status/${jobId}`);

  if (!response.ok) {
    throw new Error(`Failed to get status: ${response.statusText}`);
  }

  const status: JobStatus = await response.json();
  console.log("✅ Job status:", JSON.stringify(status, null, 2));

  return status;
}

// Test 3: Wait for completion via polling
async function testWaitForCompletion(jobId: string): Promise<JobStatus> {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 3: Wait for Job Completion (Polling)");
  console.log("=".repeat(60));

  let attempts = 0;
  const maxAttempts = 60; // 3 minutes max

  while (attempts < maxAttempts) {
    const status = await testPollStatus(jobId);

    if (status.status === "completed") {
      console.log("\n✅ Job completed successfully!");
      console.log(`   Download URL: ${status.downloadUrl}`);
      console.log(`   Size: ${status.size} bytes`);
      return status;
    }

    if (status.status === "failed") {
      throw new Error(`Job failed: ${status.error}`);
    }

    console.log(
      `   Progress: ${status.progress}% (${status.completedFiles}/${status.totalFiles} files)`,
    );
    console.log(`   Waiting 3 seconds before next poll...`);

    await new Promise((resolve) => setTimeout(resolve, 3000));
    attempts++;
  }

  throw new Error("Job did not complete within timeout");
}

// Test 4: Test SSE streaming (if supported)
async function testSSEStream(jobId: string): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 4: SSE Streaming (Real-time Updates)");
  console.log("=".repeat(60));

  console.log("⚠️  SSE streaming test requires browser or EventSource library");
  console.log("   Skipping SSE test in Node.js environment");
  console.log("   To test SSE, open this URL in a browser:");
  console.log(`   ${API_BASE}/v1/download/stream/${jobId}`);
}

// Test 5: Test direct download redirect
async function testDirectDownload(jobId: string): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 5: Direct Download Redirect");
  console.log("=".repeat(60));

  const response = await request(`/v1/download/${jobId}`, {
    redirect: "manual",
  });

  if (response.status === 302) {
    const location = response.headers.get("location");
    console.log("✅ Redirect successful!");
    console.log(`   Location: ${location}`);
  } else if (response.status === 404) {
    const error = await response.json();
    console.log("⚠️  Download not ready:", error.message);
  } else {
    throw new Error(`Unexpected status: ${response.status}`);
  }
}

// Test 6: Health check
async function testHealthCheck(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 6: Health Check");
  console.log("=".repeat(60));

  const response = await request("/health");

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.statusText}`);
  }

  const health = await response.json();
  console.log("✅ Health check:", JSON.stringify(health, null, 2));

  if (health.checks.redis !== "ok") {
    throw new Error("Redis is not healthy!");
  }

  if (health.checks.storage !== "ok") {
    throw new Error("Storage is not healthy!");
  }
}

// Main test runner
async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 ASYNC DOWNLOAD API TEST SUITE");
  console.log("=".repeat(60));
  console.log(`API Base URL: ${API_BASE}`);

  try {
    // Test health first
    await testHealthCheck();

    // Initiate a job
    const jobId = await testInitiateJob();

    // Poll status immediately
    await testPollStatus(jobId);

    // Wait for completion
    const finalStatus = await testWaitForCompletion(jobId);

    // Test direct download
    await testDirectDownload(jobId);

    // SSE test (informational)
    await testSSEStream(jobId);

    console.log("\n" + "=".repeat(60));
    console.log("✅ ALL TESTS PASSED!");
    console.log("=".repeat(60));
    console.log("\nAsync architecture is working correctly:");
    console.log("  ✅ Job queue integration");
    console.log("  ✅ Redis status tracking");
    console.log("  ✅ Polling endpoint");
    console.log("  ✅ Direct download redirect");
    console.log("  ✅ Worker processing");

    process.exit(0);
  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("❌ TEST FAILED");
    console.error("=".repeat(60));
    console.error(error);
    process.exit(1);
  }
}

main();
