/**
 * E2E Test Runner
 * Starts the server, runs tests, and cleans up
 */

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectDir = join(__dirname, "..");

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function waitForServer(
  url: string,
  maxAttempts = 30,
  interval = 1000,
): Promise<void> {
  console.log(`${colors.yellow}Waiting for server at ${url}...${colors.reset}`);

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`${colors.green}✅ Server is ready!${colors.reset}`);
        return;
      }
    } catch {
      // Server not ready yet
    }

    if (i < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  throw new Error("Server failed to start within timeout");
}

async function startServer(): Promise<ChildProcess> {
  console.log(`${colors.yellow}Starting server...${colors.reset}`);

  // Check if .env file exists, use --env-file only if it does
  const envFileArg =
    process.env.CI !== "true" && (await fileExists(join(projectDir, ".env")))
      ? ["--env-file=.env"]
      : [];

  const server = spawn(
    "node",
    [...envFileArg, "--experimental-transform-types", "src/index.ts"],
    {
      cwd: projectDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    },
  );

  server.stdout.on("data", (data: Buffer) => {
    const output = data.toString().trim();
    if (output) console.log(`[server] ${output}`);
  });

  server.stderr.on("data", (data: Buffer) => {
    const output = data.toString().trim();
    // Filter out experimental warning
    if (output && !output.includes("ExperimentalWarning")) {
      console.error(`[server] ${output}`);
    }
  });

  return server;
}

async function runTests(): Promise<number> {
  console.log(`${colors.yellow}Running E2E tests...${colors.reset}`);

  return new Promise((resolve) => {
    const tests = spawn(
      "node",
      ["--experimental-transform-types", "scripts/e2e-test.ts"],
      {
        cwd: projectDir,
        stdio: "inherit",
        env: {
          ...process.env,
          API_BASE: process.env.API_BASE ?? "http://localhost:3000",
        },
      },
    );

    tests.on("close", (code) => {
      // Exit code 0 = success, non-zero = failure
      resolve(code ?? 1);
    });

    tests.on("error", (err) => {
      console.error(`Failed to start test process: ${err.message}`);
      resolve(1);
    });
  });
}

async function main(): Promise<void> {
  const server: ChildProcess = await startServer();

  try {
    // Wait for server to be ready
    await waitForServer("http://localhost:3000/health");

    // Run tests
    const exitCode = await runTests();

    // Cleanup
    console.log(`${colors.yellow}Stopping server...${colors.reset}`);
    server.kill();

    if (exitCode === 0) {
      console.log(`${colors.green}✅ All tests passed!${colors.reset}`);
    } else {
      console.error(`${colors.red}❌ Tests failed!${colors.reset}`);
      throw new Error("Tests failed");
    }
  } catch (error) {
    console.error(
      `${colors.red}❌ Error: ${error instanceof Error ? error.message : String(error)}${colors.reset}`,
    );

    server.kill();
    throw error;
  }
}

void main();
