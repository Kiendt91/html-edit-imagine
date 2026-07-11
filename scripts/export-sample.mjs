#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportLayoutToFiles } from "../src/backend/exporter.mjs";
import { sampleLayout, samplePrompt } from "../src/backend/sample-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "outputs", "renders");

const manifest = await exportLayoutToFiles({
  document: sampleLayout,
  prompt: samplePrompt,
  outputDir,
  rootDir,
});

console.log(JSON.stringify({
  jobId: manifest.jobId,
  htmlPath: manifest.htmlPath,
  pngPath: manifest.pngPath,
  manifestPath: manifest.manifestPath,
  promptPath: manifest.promptPath,
}, null, 2));
