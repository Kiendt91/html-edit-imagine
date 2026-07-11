#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function findProjectRoot(startDir) {
  let current = startDir;

  while (true) {
    const harnessFile = path.join(current, "harness", "layout-harness.mjs");
    if (fs.existsSync(harnessFile)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

const root = findProjectRoot(process.cwd());
if (!root) {
  console.error("Could not find harness/layout-harness.mjs in this directory tree.");
  process.exit(1);
}

const harness = path.join(root, "harness", "layout-harness.mjs");
const result = spawnSync(process.execPath, [harness, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
