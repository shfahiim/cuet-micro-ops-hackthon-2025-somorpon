#!/usr/bin/env node
/**
 * E2E Test Suite
 * Tests all API endpoints with real MinIO and Redis
 */

const API_BASE = process.env.API_BASE || "http://localhost:3000";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`✅ ${name}`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error(
      `❌ ${name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function request(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${API_BASE}${path}`;
  return await fetch(url, options);
}

async function runTests(): Promise<void> {
  console.log("🧪 Running E2E Tests...\n");

  // Test 1: Health Check
  await test("Health check returns healthy status", async () => {
    const response = await request("/health");
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    if (data.status !== "healthy") throw new Error("Service not healthy");
    if (data.checks.storage !== "ok") throw new Error("Storage not ok");
  });

  // Test 2: Root endpoint
  await test("Root endpoint returns welcome message", async () => {
    const response = await request("/");
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    if (!data.message) throw new Error("No message in response");
  });

  // Test 3: Download check endpoint
  await test("Download check endpoint works", async () => {
    const response = await request("/v1/download/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: 70000 }),
    });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    if (data.file_id !== 70000) throw new Error("Wrong file_id in response");
  });

  // Test 4: Download initiate endpoint
  await test("Download initiate returns jobId", async () => {
    const response = await request("/v1/download/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_ids: [70000, 70007] }),
    });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    if (!data.jobId) throw new Error("No jobId in response");
    if (data.status !== "queued") throw new Error("Status not queued");
  });

  // Test 5: OpenAPI spec endpoint
  await test("OpenAPI spec is accessible", async () => {
    const response = await request("/openapi");
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    if (!data.openapi) throw new Error("Not a valid OpenAPI spec");
  });

  // Print summary
  console.log("\n" + "=".repeat(50));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(
    `Tests: ${passed} passed, ${failed} failed, ${results.length} total`,
  );

  if (failed > 0) {
    console.log("\nFailed tests:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  ❌ ${r.name}: ${r.error}`);
      });
    process.exit(1);
  } else {
    console.log("\n✅ All tests passed!");
    process.exit(0);
  }
}

runTests();
