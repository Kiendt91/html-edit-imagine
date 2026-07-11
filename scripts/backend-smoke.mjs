#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateLayoutDocument } from "../src/backend/layout-validator.mjs";
import { applyLayoutPatch } from "../src/backend/layout-commands.mjs";
import { planLayoutFromIdea } from "../src/backend/planner.mjs";
import { ProjectStore } from "../src/backend/project-store.mjs";
import { RenderQueue } from "../src/backend/render-queue.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const testRoot = path.join(rootDir, "outputs", "test-runs", `backend-smoke-${Date.now()}`);
const projectsDir = path.join(testRoot, "projects");
const rendersDir = path.join(testRoot, "renders");

await fs.mkdir(testRoot, { recursive: true });

const planned = planLayoutFromIdea({
  idea: "Create a premium coffee advertisement with a centered product and bold headline",
  canvas: { width: 1200, height: 900 },
  style: "warm studio lighting",
});

assert.equal(validateLayoutDocument(planned.document).length, 0, "planner output should be valid");
assert.equal(planned.document.canvas.width, 1200, "planner should respect canvas width");
assert.equal(planned.document.canvas.height, 900, "planner should respect canvas height");

const patched = applyLayoutPatch(planned.document, [
  {
    type: "updateObject",
    id: "headline",
    patch: {
      content: "BOLD MORNING",
      y: 92,
    },
  },
  {
    type: "addObject",
    object: {
      name: "Small Offer",
      type: "badge",
      x: 850,
      y: 700,
      width: 220,
      height: 84,
      rotation: -3,
      opacity: 1,
      zIndex: 50,
      content: "NEW",
    },
  },
]);

assert.equal(validateLayoutDocument(patched.document).length, 0, "patched document should be valid");
assert.equal(patched.document.objects.find((object) => object.id === "headline").content, "BOLD MORNING");
assert.ok(patched.document.objects.some((object) => object.name === "Small Offer"), "addObject should add badge");

const store = new ProjectStore({ projectsDir });
const saved = await store.saveProject({
  title: "Backend Smoke Layout",
  prompt: planned.prompt,
  document: patched.document,
});
const loaded = await store.getProject(saved.id);
assert.equal(loaded.id, saved.id, "saved project should load by id");
assert.equal((await store.listProjects()).length, 1, "project list should include saved project");

const projectPatch = await store.patchProject(saved.id, [
  {
    type: "updateObject",
    id: "footer",
    patch: {
      content: "Available now",
    },
  },
]);
assert.equal(projectPatch.project.document.objects.find((object) => object.id === "footer").content, "Available now");

const queue = new RenderQueue({ outputDir: rendersDir, rootDir });
const job = queue.createJob({
  document: projectPatch.project.document,
  prompt: projectPatch.project.prompt,
  tier: "raster-preview",
  projectId: saved.id,
});
const finalJob = await queue.waitForJob(job.jobId);
assert.equal(finalJob.status, "ready", finalJob.error ?? "render should be ready");
assert.ok(finalJob.pngPath, "render job should produce pngPath");
assert.ok((await fs.stat(finalJob.pngPath)).size > 1000, "rendered PNG should not be empty");

const cachedJob = queue.createJob({
  document: projectPatch.project.document,
  prompt: projectPatch.project.prompt,
  tier: "raster-preview",
  projectId: saved.id,
});
assert.equal(cachedJob.status, "ready", "second identical render should be returned from cache");
assert.equal(cachedJob.cached, true, "second identical render should be marked cached");

console.log(JSON.stringify({
  ok: true,
  projectId: saved.id,
  renderJobId: finalJob.jobId,
  pngPath: finalJob.pngPath,
  cachedJobId: cachedJob.jobId,
}, null, 2));
