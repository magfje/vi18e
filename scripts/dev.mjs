#!/usr/bin/env node
/**
 * Dev launcher: starts Vite renderer server + tsdown main/preload watcher,
 * waits for Vite to be ready, then launches Electron.
 */
import { spawn } from "child_process";

const VITE_PORT = 5173;
const VITE_URL = `http://localhost:${VITE_PORT}`;

const procs = [];

function run(cmd, args, env = {}) {
  const p = spawn(cmd, args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  procs.push(p);
  p.on("close", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[dev] ${cmd} exited with code ${code}`);
      killAll();
    }
  });
  return p;
}

function killAll() {
  for (const p of procs) {
    try {
      p.kill();
    } catch {
      /* already dead */
    }
  }
  process.exit(0);
}

process.on("SIGINT", killAll);
process.on("SIGTERM", killAll);

// Start Vite dev server (renderer)
run("bunx", ["vite", "--port", String(VITE_PORT)]);

// Start tsdown in watch mode (main + preload)
run("bunx", ["tsdown", "--watch"]);

// Wait for Vite to be ready, then launch Electron
async function waitForVite(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

console.log("[dev] Waiting for Vite dev server...");
await waitForVite(VITE_URL);
console.log("[dev] Vite ready — launching Electron");

run("bunx", ["electron", "."], { VITE_DEV_SERVER_URL: VITE_URL });
