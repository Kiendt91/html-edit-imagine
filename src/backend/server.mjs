import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderLayoutHtml } from "./html-renderer.mjs";
import { sampleLayout, samplePrompt } from "./sample-layout.mjs";
import { assertValidLayoutDocument, validateLayoutDocument } from "./layout-validator.mjs";
import { exportLayoutToFiles } from "./exporter.mjs";
import { applyLayoutPatch } from "./layout-commands.mjs";
import { planLayoutFromIdea } from "./planner.mjs";
import { ProjectStore } from "./project-store.mjs";
import { RenderQueue } from "./render-queue.mjs";
import { AssetStore } from "./asset-store.mjs";
import { normalizeLayoutDocument } from "./layout-normalizer.mjs";
import { ImageGenerationQueue } from "./generation-queue.mjs";
import { createVisionLayoutProvider, sourceImageTitle } from "./vision-layout-provider.mjs";
import { createLayoutPatchProvider } from "./layout-patch-provider.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const outputDir = path.join(rootDir, "outputs", "renders");
const generatedDir = path.join(rootDir, "outputs", "generated");
const projectsDir = path.join(rootDir, "data", "projects");
const assetsDir = path.join(rootDir, "data", "assets");
const port = Number(process.env.PORT ?? 4317);
const projectStore = new ProjectStore({ projectsDir });
const renderQueue = new RenderQueue({ outputDir, rootDir });
const generationQueue = new ImageGenerationQueue({ generatedDir, rootDir });
const assetStore = new AssetStore({ assetsDir });
const visionLayoutProvider = createVisionLayoutProvider({ rootDir });
const layoutPatchProvider = createLayoutPatchProvider();

function send(res, status, body, headers = {}) {
  const isBuffer = Buffer.isBuffer(body);
  const payload = isBuffer ? body : typeof body === "string" ? body : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": isBuffer ? "application/octet-stream" : typeof body === "string" ? "text/html; charset=utf-8" : "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(payload);
}

function sendJson(res, status, body) {
  send(res, status, body, { "content-type": "application/json; charset=utf-8" });
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function publicRenderUrl(filePath) {
  if (!filePath) {
    return null;
  }
  const relative = path.relative(outputDir, filePath).replaceAll("\\", "/");
  return `/renders/${relative}`;
}

function publicGeneratedUrl(filePath) {
  if (!filePath) {
    return null;
  }
  const relative = path.relative(generatedDir, filePath).replaceAll("\\", "/");
  return `/generated/${relative}`;
}

function renderJobResponse(job) {
  if (!job) {
    return null;
  }
  return {
    jobId: job.jobId,
    tier: job.tier,
    projectId: job.projectId ?? null,
    documentHash: job.documentHash,
    status: job.status,
    cached: Boolean(job.cached),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error ?? null,
    htmlPath: job.htmlPath,
    cleanHtmlPath: job.cleanHtmlPath,
    pngPath: job.pngPath,
    cleanPngPath: job.cleanPngPath,
    manifestPath: job.manifestPath,
    promptPath: job.promptPath,
    htmlUrl: publicRenderUrl(job.htmlPath),
    cleanHtmlUrl: publicRenderUrl(job.cleanHtmlPath),
    pngUrl: publicRenderUrl(job.pngPath),
    cleanPngUrl: publicRenderUrl(job.cleanPngPath),
    manifestUrl: publicRenderUrl(job.manifestPath),
    promptUrl: publicRenderUrl(job.promptPath),
    codexPrompt: job.codexPrompt ?? null,
    cleanExportVerification: job.cleanExportVerification ?? null,
  };
}

function generationJobResponse(job) {
  if (!job) {
    return null;
  }
  return {
    jobId: job.jobId,
    provider: job.provider,
    providerMode: job.providerMode ?? null,
    providerModel: job.providerModel ?? null,
    projectId: job.projectId ?? null,
    documentHash: job.documentHash,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error ?? null,
    htmlPath: job.htmlPath,
    cleanHtmlPath: job.cleanHtmlPath,
    referencePngPath: job.referencePngPath,
    cleanReferencePngPath: job.cleanReferencePngPath,
    imagePath: job.imagePath,
    manifestPath: job.manifestPath,
    promptPath: job.promptPath,
    htmlUrl: publicGeneratedUrl(job.htmlPath),
    cleanHtmlUrl: publicGeneratedUrl(job.cleanHtmlPath),
    referenceUrl: publicGeneratedUrl(job.referencePngPath),
    cleanReferenceUrl: publicGeneratedUrl(job.cleanReferencePngPath),
    imageUrl: publicGeneratedUrl(job.imagePath),
    manifestUrl: publicGeneratedUrl(job.manifestPath),
    promptUrl: publicGeneratedUrl(job.promptPath),
    generationPrompt: job.generationPrompt ?? null,
  };
}

function assetContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml; charset=utf-8";
  return "application/octet-stream";
}

function productPlacementOps({ document, asset, targetObjectId }) {
  const normalized = normalizeLayoutDocument(document);
  const target =
    normalized.objects.find((object) => object.id === targetObjectId) ??
    normalized.objects.find((object) => object.type === "product-image" || object.role === "product");
  if (!target) {
    const error = new Error("No product-image object was found");
    error.statusCode = 400;
    throw error;
  }
  return [
    {
      type: "replaceAsset",
      asset,
    },
    {
      type: "updateObject",
      id: target.id,
      patch: {
        type: "product-image",
        assetId: asset.id,
        fit: "contain",
        subjectLock: true,
        promptRole: "primary-product",
      },
    },
  ];
}

function renderAppShell() {
  const documentJson = JSON.stringify(sampleLayout, null, 2);
  const promptJson = JSON.stringify(samplePrompt);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Layout Studio Backend MVP</title>
  <style>
    :root { font-family: Inter, Arial, sans-serif; color: #201b16; background: #f4f1ec; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; }
    main { display: grid; grid-template-columns: 420px 1fr; min-height: 100vh; }
    aside { padding: 18px; border-right: 1px solid rgba(0,0,0,0.12); background: #fffaf2; }
    h1 { font-size: 22px; margin: 0 0 12px; }
    p { color: #5e544b; line-height: 1.45; }
    textarea { width: 100%; min-height: 300px; resize: vertical; font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace; border: 1px solid rgba(0,0,0,0.16); border-radius: 6px; padding: 10px; background: #fff; }
    input { width: 100%; height: 40px; border: 1px solid rgba(0,0,0,0.16); border-radius: 6px; padding: 0 10px; }
    label { display: block; font-weight: 700; margin: 14px 0 8px; }
    .buttons { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
    button { height: 38px; border: 0; border-radius: 6px; background: #201b16; color: #fffaf2; padding: 0 14px; font-weight: 800; cursor: pointer; }
    button.secondary { background: #d8c8b7; color: #201b16; }
    section { display: grid; grid-template-rows: 1fr auto; min-width: 0; }
    iframe { width: 100%; height: 100%; min-height: 740px; border: 0; background: #202020; }
    pre { margin: 0; padding: 12px; background: #201b16; color: #fffaf2; max-height: 180px; overflow: auto; font-size: 12px; }
    .hint { font-size: 13px; }
    @media (max-width: 980px) { main { grid-template-columns: 1fr; } iframe { min-height: 560px; } }
  </style>
</head>
<body>
  <main>
    <aside>
      <h1>AI Layout Studio Backend MVP</h1>
      <p class="hint">Render HTML from LayoutDocument, export the HTML canvas to PNG, then produce a Codex image prompt manifest.</p>
      <label for="idea">Idea</label>
      <input id="idea" value="Luxury perfume ad with centered bottle, headline, logo, and limited-drop badge">
      <label for="prompt">Prompt</label>
      <input id="prompt" value="">
      <label for="document">LayoutDocument JSON</label>
      <textarea id="document"></textarea>
      <div class="buttons">
        <button class="secondary" id="plan">Plan Layout</button>
        <button id="preview">Render HTML</button>
        <button id="export">Export PNG</button>
        <button class="secondary" id="queue">Queue Render</button>
        <button class="secondary" id="save">Save Project</button>
        <button class="secondary" id="reset">Reset sample</button>
      </div>
    </aside>
    <section>
      <iframe id="previewFrame" title="HTML layout preview"></iframe>
      <pre id="result">Ready.</pre>
    </section>
  </main>
  <script>
    const sampleDocument = ${documentJson};
    const samplePrompt = ${promptJson};
    const documentBox = document.querySelector("#document");
    const promptBox = document.querySelector("#prompt");
    const ideaBox = document.querySelector("#idea");
    const frame = document.querySelector("#previewFrame");
    const result = document.querySelector("#result");

    function reset() {
      documentBox.value = JSON.stringify(sampleDocument, null, 2);
      promptBox.value = samplePrompt;
    }

    async function postJson(url, body) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const text = await response.text();
      const type = response.headers.get("content-type") || "";
      if (!response.ok) {
        throw new Error(text);
      }
      return type.includes("application/json") ? JSON.parse(text) : text;
    }

    async function renderPreview() {
      const layout = JSON.parse(documentBox.value);
      const html = await postJson("/api/render-html", { document: layout, prompt: promptBox.value });
      frame.srcdoc = html;
      result.textContent = "HTML rendered in iframe.";
    }

    async function exportPng() {
      const layout = JSON.parse(documentBox.value);
      const data = await postJson("/api/export/png", { document: layout, prompt: promptBox.value });
      result.textContent = JSON.stringify(data, null, 2);
      frame.src = data.htmlUrl;
    }

    async function planLayout() {
      const data = await postJson("/api/plan-layout", { idea: ideaBox.value, style: "premium editorial advertising" });
      documentBox.value = JSON.stringify(data.document, null, 2);
      promptBox.value = data.prompt;
      await renderPreview();
      result.textContent = JSON.stringify({ planner: data.planner }, null, 2);
    }

    async function queueRender() {
      const layout = JSON.parse(documentBox.value);
      const data = await postJson("/api/render-jobs", { document: layout, prompt: promptBox.value, tier: "raster-preview", wait: true });
      result.textContent = JSON.stringify(data, null, 2);
      if (data.htmlUrl) frame.src = data.htmlUrl;
    }

    async function saveProject() {
      const layout = JSON.parse(documentBox.value);
      const data = await postJson("/api/projects", { title: layout.meta?.title || "Untitled Layout", document: layout, prompt: promptBox.value });
      result.textContent = JSON.stringify(data, null, 2);
    }

    document.querySelector("#plan").addEventListener("click", () => planLayout().catch((error) => result.textContent = error.message));
    document.querySelector("#preview").addEventListener("click", () => renderPreview().catch((error) => result.textContent = error.message));
    document.querySelector("#export").addEventListener("click", () => exportPng().catch((error) => result.textContent = error.message));
    document.querySelector("#queue").addEventListener("click", () => queueRender().catch((error) => result.textContent = error.message));
    document.querySelector("#save").addEventListener("click", () => saveProject().catch((error) => result.textContent = error.message));
    document.querySelector("#reset").addEventListener("click", () => { reset(); renderPreview(); });
    reset();
    renderPreview();
  </script>
</body>
</html>`;
}

async function serveRenderFile(req, res, pathname) {
  const relative = decodeURIComponent(pathname.replace(/^\/renders\//, ""));
  const target = path.resolve(outputDir, relative);
  if (!target.startsWith(outputDir)) {
    sendJson(res, 403, { error: "Forbidden path" });
    return;
  }

  try {
    const body = await fs.readFile(target);
    const ext = path.extname(target).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : ext === ".json" ? "application/json; charset=utf-8" : ext === ".md" ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8";
    send(res, 200, body, { "content-type": contentType });
  } catch {
    sendJson(res, 404, { error: "Render file not found" });
  }
}

async function serveGeneratedFile(req, res, pathname) {
  const relative = decodeURIComponent(pathname.replace(/^\/generated\//, ""));
  const target = path.resolve(generatedDir, relative);
  if (!target.startsWith(generatedDir)) {
    sendJson(res, 403, { error: "Forbidden path" });
    return;
  }

  try {
    const body = await fs.readFile(target);
    const ext = path.extname(target).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : ext === ".json" ? "application/json; charset=utf-8" : ext === ".md" ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8";
    send(res, 200, body, { "content-type": contentType });
  } catch {
    sendJson(res, 404, { error: "Generated file not found" });
  }
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
  const projectPatchMatch = pathname.match(/^\/api\/projects\/([^/]+)\/patch$/);
  const projectRenderMatch = pathname.match(/^\/api\/projects\/([^/]+)\/render-jobs$/);
  const renderJobMatch = pathname.match(/^\/api\/render-jobs\/([^/]+)$/);
  const renderJobEventsMatch = pathname.match(/^\/api\/render-jobs\/([^/]+)\/events$/);
  const generationJobMatch = pathname.match(/^\/api\/generate-jobs\/([^/]+)$/);
  const generationJobEventsMatch = pathname.match(/^\/api\/generate-jobs\/([^/]+)\/events$/);
  const assetMatch = pathname.match(/^\/api\/assets\/([^/]+)$/);
  const assetFileMatch = pathname.match(/^\/assets\/([^/]+)\/(.+)$/);

  try {
    if (req.method === "GET" && pathname === "/") {
      send(res, 200, renderAppShell());
      return;
    }

    if (req.method === "GET" && pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        service: "ai-layout-studio-backend",
        version: "0.1.0",
        providers: {
          visionLayout: visionLayoutProvider.id,
          imageGeneration: generationQueue.defaultProvider,
        },
        renderJobs: renderQueue.listJobs().length,
        generationJobs: generationQueue.listJobs().length,
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/providers") {
      sendJson(res, 200, {
        visionLayout: {
          active: visionLayoutProvider.id,
          configured: process.env.VISION_LAYOUT_PROVIDER ?? "mock",
          available: ["mock", "openai"],
          openAiReady: Boolean(process.env.OPENAI_API_KEY),
          model: visionLayoutProvider.model ?? null,
        },
        imageGeneration: {
          activeDefault: generationQueue.defaultProvider,
          available: ["mock-local", "openai"],
          openAiReady: Boolean(process.env.OPENAI_API_KEY),
          model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5",
        },
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/sample") {
      sendJson(res, 200, { document: sampleLayout, prompt: samplePrompt });
      return;
    }

    if (req.method === "GET" && pathname === "/api/assets") {
      sendJson(res, 200, { assets: await assetStore.listAssets() });
      return;
    }

    if (req.method === "DELETE" && assetMatch) {
      sendJson(res, 200, { asset: await assetStore.deleteAsset(assetMatch[1]) });
      return;
    }

    if (req.method === "POST" && pathname === "/api/assets") {
      const body = await readJson(req);
      const asset = await assetStore.createAsset({
        name: body.name,
        kind: body.kind ?? "product",
        dataUrl: body.dataUrl,
      });
      sendJson(res, 201, { asset });
      return;
    }

    if (req.method === "GET" && assetFileMatch) {
      const target = await assetStore.resolveAssetPath(assetFileMatch[1], decodeURIComponent(assetFileMatch[2]));
      const body = await fs.readFile(target);
      send(res, 200, body, { "content-type": assetContentType(target), "cache-control": "public, max-age=31536000, immutable" });
      return;
    }

    if (req.method === "GET" && pathname === "/preview/sample") {
      const html = renderLayoutHtml(sampleLayout, { prompt: samplePrompt, rootDir });
      send(res, 200, html);
      return;
    }

    if (req.method === "POST" && pathname === "/api/validate") {
      const body = await readJson(req);
      sendJson(res, 200, { errors: validateLayoutDocument(body.document) });
      return;
    }

    if (req.method === "POST" && pathname === "/api/plan-layout") {
      const body = await readJson(req);
      sendJson(res, 200, planLayoutFromIdea({
        idea: body.idea ?? "",
        canvas: body.canvas,
        style: body.style ?? "",
      }));
      return;
    }

    if (req.method === "POST" && pathname === "/api/patch") {
      const body = await readJson(req);
      sendJson(res, 200, applyLayoutPatch(body.document, body.ops));
      return;
    }

    if (req.method === "POST" && pathname === "/api/layout-patches/from-instruction") {
      const body = await readJson(req);
      sendJson(res, 200, layoutPatchProvider.planPatch({
        document: body.document,
        instruction: body.instruction ?? "",
        selectedObjectIds: Array.isArray(body.selectedObjectIds) ? body.selectedObjectIds : [],
      }));
      return;
    }

    if (req.method === "POST" && pathname === "/api/place-product") {
      const body = await readJson(req);
      const asset = await assetStore.getAsset(body.assetId);
      const ops = productPlacementOps({
        document: body.document,
        asset,
        targetObjectId: body.targetObjectId,
      });
      sendJson(res, 200, applyLayoutPatch(body.document, ops));
      return;
    }

    if (req.method === "POST" && pathname === "/api/image-layout/analyze") {
      const body = await readJson(req);
      const asset = await assetStore.getAsset(body.assetId);
      sendJson(res, 200, await visionLayoutProvider.analyzeLayout({
        asset,
        underlayOpacity: body.underlayOpacity ?? 0.22,
      }));
      return;
    }

    if (req.method === "GET" && pathname === "/api/projects") {
      sendJson(res, 200, { projects: await projectStore.listProjects() });
      return;
    }

    if (req.method === "POST" && pathname === "/api/projects/from-image") {
      const body = await readJson(req);
      const asset = await assetStore.getAsset(body.assetId);
      const analysis = await visionLayoutProvider.analyzeLayout({
        asset,
        underlayOpacity: body.underlayOpacity ?? 0.22,
      });
      const document = analysis.document;
      const project = await projectStore.saveProject({
        title: body.title ?? document.meta?.title ?? sourceImageTitle(asset),
        prompt: body.prompt ?? `Use ${asset.name} as a source layout reference. Preserve the extracted HTML layout regions and refine them into an editable composition.`,
        document,
      });
      sendJson(res, 201, {
        project,
        analysis,
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/projects") {
      const body = await readJson(req);
      const planned = body.document ? null : planLayoutFromIdea({ idea: body.idea ?? "", canvas: body.canvas, style: body.style ?? "" });
      const project = await projectStore.saveProject({
        title: body.title ?? planned?.document?.meta?.title,
        prompt: body.prompt ?? planned?.prompt ?? "",
        document: body.document ?? planned?.document,
      });
      sendJson(res, 201, { project });
      return;
    }

    if (req.method === "GET" && projectMatch) {
      sendJson(res, 200, { project: await projectStore.getProject(projectMatch[1]) });
      return;
    }

    if (req.method === "DELETE" && projectMatch) {
      sendJson(res, 200, { project: await projectStore.deleteProject(projectMatch[1]) });
      return;
    }

    if (req.method === "PUT" && projectMatch) {
      const body = await readJson(req);
      const existing = await projectStore.getProject(projectMatch[1]);
      const project = await projectStore.saveProject({
        id: projectMatch[1],
        title: body.title ?? existing.title,
        prompt: body.prompt ?? existing.prompt,
        document: body.document ?? existing.document,
        renderHistory: body.renderHistory ?? existing.renderHistory ?? [],
      });
      sendJson(res, 200, { project });
      return;
    }

    if (req.method === "POST" && projectPatchMatch) {
      const body = await readJson(req);
      sendJson(res, 200, await projectStore.patchProject(projectPatchMatch[1], body.ops));
      return;
    }

    if (req.method === "POST" && pathname.match(/^\/api\/projects\/([^/]+)\/place-product$/)) {
      const projectId = pathname.match(/^\/api\/projects\/([^/]+)\/place-product$/)[1];
      const body = await readJson(req);
      const project = await projectStore.getProject(projectId);
      const asset = await assetStore.getAsset(body.assetId);
      const ops = productPlacementOps({
        document: project.document,
        asset,
        targetObjectId: body.targetObjectId,
      });
      sendJson(res, 200, await projectStore.patchProject(projectId, ops));
      return;
    }

    if (req.method === "POST" && pathname === "/api/render-html") {
      const body = await readJson(req);
      assertValidLayoutDocument(body.document);
      const html = renderLayoutHtml(body.document, { prompt: body.prompt ?? "", rootDir });
      send(res, 200, html);
      return;
    }

    if (req.method === "POST" && pathname === "/api/export/png") {
      const body = await readJson(req);
      const manifest = await exportLayoutToFiles({
        document: body.document,
        prompt: body.prompt ?? "",
        outputDir,
        rootDir,
      });
      sendJson(res, 200, {
        jobId: manifest.jobId,
        documentHash: manifest.documentHash,
        htmlPath: manifest.htmlPath,
        cleanHtmlPath: manifest.cleanHtmlPath,
        pngPath: manifest.pngPath,
        cleanPngPath: manifest.cleanPngPath,
        manifestPath: manifest.manifestPath,
        promptPath: manifest.promptPath,
        htmlUrl: publicRenderUrl(manifest.htmlPath),
        cleanHtmlUrl: publicRenderUrl(manifest.cleanHtmlPath),
        pngUrl: publicRenderUrl(manifest.pngPath),
        cleanPngUrl: publicRenderUrl(manifest.cleanPngPath),
        manifestUrl: publicRenderUrl(manifest.manifestPath),
        promptUrl: publicRenderUrl(manifest.promptPath),
        codexPrompt: manifest.codexPrompt,
        cleanExportVerification: manifest.cleanExportVerification,
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/generate-jobs") {
      sendJson(res, 200, { jobs: generationQueue.listJobs().map(generationJobResponse) });
      return;
    }

    if (req.method === "POST" && pathname === "/api/generate-image") {
      const body = await readJson(req);
      const job = generationQueue.createJob({
        document: body.document,
        prompt: body.prompt ?? "",
        provider: body.provider ?? "mock-local",
        projectId: body.projectId ?? null,
      });
      const finalJob = body.wait ? await generationQueue.waitForJob(job.jobId) : job;
      sendJson(res, body.wait ? 200 : 202, generationJobResponse(finalJob));
      return;
    }

    if (req.method === "GET" && generationJobMatch) {
      const job = generationQueue.getJob(generationJobMatch[1]);
      if (!job) {
        sendJson(res, 404, { error: "Generation job not found" });
        return;
      }
      sendJson(res, 200, generationJobResponse(job));
      return;
    }

    if (req.method === "GET" && generationJobEventsMatch) {
      const job = generationQueue.getJob(generationJobEventsMatch[1]);
      if (!job) {
        sendJson(res, 404, { error: "Generation job not found" });
        return;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
      });
      const sendEvent = () => {
        const currentJob = generationQueue.getJob(generationJobEventsMatch[1]);
        res.write(`event: generation-job\n`);
        res.write(`data: ${JSON.stringify(generationJobResponse(currentJob))}\n\n`);
        if (!currentJob || currentJob.status === "ready" || currentJob.status === "failed") {
          clearInterval(timer);
          res.end();
        }
      };
      const timer = setInterval(sendEvent, 250);
      req.on("close", () => clearInterval(timer));
      sendEvent();
      return;
    }

    if (req.method === "GET" && pathname === "/api/render-jobs") {
      sendJson(res, 200, { jobs: renderQueue.listJobs().map(renderJobResponse) });
      return;
    }

    if (req.method === "POST" && pathname === "/api/render-jobs") {
      const body = await readJson(req);
      const job = renderQueue.createJob({
        document: body.document,
        prompt: body.prompt ?? "",
        tier: body.tier ?? "raster-preview",
        projectId: body.projectId ?? null,
      });
      const finalJob = body.wait ? await renderQueue.waitForJob(job.jobId) : job;
      sendJson(res, body.wait ? 200 : 202, renderJobResponse(finalJob));
      return;
    }

    if (req.method === "GET" && renderJobMatch) {
      const job = renderQueue.getJob(renderJobMatch[1]);
      if (!job) {
        sendJson(res, 404, { error: "Render job not found" });
        return;
      }
      sendJson(res, 200, renderJobResponse(job));
      return;
    }

    if (req.method === "GET" && renderJobEventsMatch) {
      const job = renderQueue.getJob(renderJobEventsMatch[1]);
      if (!job) {
        sendJson(res, 404, { error: "Render job not found" });
        return;
      }
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
      });
      const sendEvent = () => {
        const currentJob = renderQueue.getJob(renderJobEventsMatch[1]);
        res.write(`event: render-job\n`);
        res.write(`data: ${JSON.stringify(renderJobResponse(currentJob))}\n\n`);
        if (!currentJob || currentJob.status === "ready" || currentJob.status === "failed") {
          clearInterval(timer);
          res.end();
        }
      };
      const timer = setInterval(sendEvent, 250);
      req.on("close", () => clearInterval(timer));
      sendEvent();
      return;
    }

    if (req.method === "POST" && projectRenderMatch) {
      const body = await readJson(req);
      const project = await projectStore.getProject(projectRenderMatch[1]);
      const job = renderQueue.createJob({
        document: project.document,
        prompt: body.prompt ?? project.prompt ?? "",
        tier: body.tier ?? "raster-preview",
        projectId: project.id,
      });
      const finalJob = body.wait ? await renderQueue.waitForJob(job.jobId) : job;
      if (finalJob?.status === "ready") {
        await projectStore.appendRender(project.id, renderJobResponse(finalJob));
      }
      sendJson(res, body.wait ? 200 : 202, renderJobResponse(finalJob));
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/renders/")) {
      await serveRenderFile(req, res, pathname);
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/generated/")) {
      await serveGeneratedFile(req, res, pathname);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    const status = error.statusCode ?? 500;
    sendJson(res, status, {
      error: error.message,
      details: error.errors ?? undefined,
    });
  }
}

export function createServer() {
  return http.createServer((req, res) => {
    handle(req, res);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(generatedDir, { recursive: true });
  await projectStore.ensureReady();
  await assetStore.ensureReady();
  createServer().listen(port, () => {
    console.log(`AI Layout Studio backend listening on http://localhost:${port}`);
  });
}
