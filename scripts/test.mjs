/**
 * Runs every *.test.ts under src/ with the Node test runner and tsx.
 * No Vite/Vitest dependency, so it works on any Node >= 20.
 *   pnpm test
 */
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.test\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

const files = walk(path.resolve("src"));
if (files.length === 0) {
  console.log("No test files found.");
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "--import",
    "./src/test/setup.ts",
    // `server-only` exports nothing under the react-server condition.
    "--conditions=react-server",
    "--test",
    "--test-reporter=spec",
    ...files,
  ],
  { stdio: "inherit", env: { ...process.env, NODE_ENV: "test" } },
);
process.exit(result.status ?? 1);
