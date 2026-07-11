#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "../src/backend/server.mjs";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function postJson(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  assert.ok(response.ok, `${path} failed: ${JSON.stringify(data)}`);
  return data;
}

async function deleteJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`, { method: "DELETE" });
  const data = await response.json();
  assert.ok(response.ok, `${path} failed: ${JSON.stringify(data)}`);
  return data;
}

async function putJson(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  assert.ok(response.ok, `${path} failed: ${JSON.stringify(data)}`);
  return data;
}

const productSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="760" viewBox="0 0 520 760">
  <rect width="520" height="760" fill="transparent"/>
  <rect x="180" y="40" width="160" height="90" rx="28" fill="#1f1914"/>
  <rect x="210" y="126" width="100" height="110" fill="#d8bd8f"/>
  <rect x="92" y="210" width="336" height="438" rx="82" fill="#f7dfab" stroke="#6f5237" stroke-width="10"/>
  <rect x="156" y="390" width="208" height="126" fill="#fff7e8" stroke="#8a6b44" stroke-width="5"/>
  <text x="260" y="465" text-anchor="middle" font-family="Arial" font-size="34" font-weight="700" fill="#1f1914">SMOKE</text>
</svg>`;
const sourceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <rect width="900" height="1200" fill="#f4eadc"/>
  <text x="450" y="180" text-anchor="middle" font-family="Georgia" font-size="92" font-weight="700" fill="#1f1914">SOURCE AD</text>
  <rect x="290" y="350" width="320" height="520" rx="80" fill="#f8dca4" stroke="#75583a" stroke-width="12"/>
  <circle cx="670" cy="790" r="86" fill="#191512"/>
  <text x="670" y="782" text-anchor="middle" font-family="Arial" font-size="30" font-weight="700" fill="#fffaf0">SALE</text>
  <text x="450" y="1060" text-anchor="middle" font-family="Arial" font-size="42" fill="#5b4d40">Trace this layout</text>
</svg>`;

function dataUrlFromSvg(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

const server = createServer();
const port = await listen(server);
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  assert.equal(health.providers.visionLayout, "mock-vision-layout-v1");
  assert.equal(health.providers.imageGeneration, "mock-local");
  assert.equal(health.providers.layoutPatch, "mock-layout-patch-v1");

  const providers = await fetch(`${baseUrl}/api/providers`).then((response) => response.json());
  assert.equal(providers.visionLayout.active, "mock-vision-layout-v1");
  assert.ok(providers.visionLayout.available.includes("openai"));
  assert.equal(providers.imageGeneration.activeDefault, "mock-local");
  assert.equal(providers.layoutPatch.active, "mock-layout-patch-v1");
  assert.ok(providers.layoutPatch.available.includes("openai"));
  assert.ok(providers.imageGeneration.available.includes("openai"));

  const planned = await postJson(baseUrl, "/api/plan-layout", {
    idea: "A luxury skincare serum ad with product in the center",
    style: "clean, luminous, premium",
  });
  assert.equal(planned.document.meta.title, "AI Generated Layout");

  const patched = await postJson(baseUrl, "/api/patch", {
    document: planned.document,
    ops: [
      {
        type: "updateObject",
        id: "headline",
        patch: {
          content: "GLOW RITUAL",
        },
      },
    ],
  });
  assert.equal(patched.document.objects.find((object) => object.id === "headline").content, "GLOW RITUAL");

  const uploaded = await postJson(baseUrl, "/api/assets", {
    name: "smoke-product.svg",
    kind: "product",
    dataUrl: dataUrlFromSvg(productSvg),
  });
  assert.ok(uploaded.asset.id, "uploaded asset should have an id");
  assert.equal(uploaded.asset.kind, "product");
  assert.ok(uploaded.asset.width > 0);

  const assetResponse = await fetch(`${baseUrl}${uploaded.asset.src}`);
  assert.equal(assetResponse.status, 200, "stored asset should be served");

  const disposableAsset = await postJson(baseUrl, "/api/assets", {
    name: "delete-me.svg",
    kind: "icon",
    dataUrl: dataUrlFromSvg(productSvg),
  });
  const deletedAsset = await deleteJson(baseUrl, `/api/assets/${disposableAsset.asset.id}`);
  assert.equal(deletedAsset.asset.id, disposableAsset.asset.id);
  const assetsAfterDelete = await fetch(`${baseUrl}/api/assets`).then((response) => response.json());
  assert.ok(!assetsAfterDelete.assets.some((asset) => asset.id === disposableAsset.asset.id), "deleted asset should leave the asset index");
  const deletedAssetResponse = await fetch(`${baseUrl}${disposableAsset.asset.src}`);
  assert.equal(deletedAssetResponse.status, 404, "deleted asset file should not be served");

  const placed = await postJson(baseUrl, "/api/place-product", {
    document: patched.document,
    assetId: uploaded.asset.id,
    targetObjectId: "product",
  });
  assert.equal(placed.document.objects.find((object) => object.id === "product").assetId, uploaded.asset.id);
  assert.ok(placed.document.assets.some((asset) => asset.id === uploaded.asset.id));

  const productBeforePatch = placed.document.objects.find((object) => object.id === "product");
  const instructionPatch = await postJson(baseUrl, "/api/layout-patches/from-instruction", {
    document: placed.document,
    instruction: "Move the product up",
    selectedObjectIds: ["product"],
  });
  assert.equal(instructionPatch.provider, "mock-layout-patch-v1");
  assert.ok(instructionPatch.ops.some((op) => op.type === "updateObject" && op.id === "product"), "instruction patch should update the selected product");
  assert.ok(instructionPatch.opSummaries.some((summary) => summary.objectId === "product" && summary.details.some((detail) => detail.key === "y")), "instruction patch should include readable product movement summary");
  assert.ok(instructionPatch.confidence > 0.5);
  assert.ok(
    instructionPatch.document.objects.find((object) => object.id === "product").y < productBeforePatch.y,
    "instruction patch should move the product upward",
  );

  const sourceUpload = await postJson(baseUrl, "/api/assets", {
    name: "source-layout.svg",
    kind: "source-layout",
    dataUrl: dataUrlFromSvg(sourceSvg),
  });
  const analysis = await postJson(baseUrl, "/api/image-layout/analyze", {
    assetId: sourceUpload.asset.id,
  });
  assert.equal(analysis.provider, "mock-vision-layout-v1");
  assert.equal(analysis.document.objects[0].id, "source-underlay");
  assert.equal(analysis.document.objects[0].locked, true);
  assert.equal(analysis.document.objects[0].analysisMeta.extractedFromAssetId, sourceUpload.asset.id);
  assert.equal(analysis.document.canvas.width, 900);
  assert.ok(analysis.document.objects.some((object) => object.id === "product-zone"), "analysis should create editable product-zone block");
  assert.equal(analysis.document.objects.find((object) => object.id === "product-zone").type, "rectangle");
  assert.ok(
    analysis.document.objects
      .filter((object) => object.id !== "source-underlay")
      .every((object) => object.analysisMeta?.extractedFromAssetId === sourceUpload.asset.id),
    "extracted blocks should keep source asset metadata",
  );
  assert.ok(
    analysis.document.objects
      .filter((object) => object.type === "text")
      .every((object) => typeof object.analysisMeta?.originalText === "string" && object.analysisMeta.originalText.length > 0),
    "extracted text blocks should keep originalText metadata",
  );
  assert.ok(analysis.document.objects.length > 4, "analysis should create multiple editable layout blocks");

  const sourcePlaced = await postJson(baseUrl, "/api/place-product", {
    document: analysis.document,
    assetId: uploaded.asset.id,
    targetObjectId: "product-zone",
  });
  const sourceProduct = sourcePlaced.document.objects.find((object) => object.id === "product-zone");
  assert.equal(sourceProduct.type, "product-image", "placing a product should convert the extracted product zone into product-image");
  assert.equal(sourceProduct.assetId, uploaded.asset.id);

  const fromImage = await postJson(baseUrl, "/api/projects/from-image", {
    assetId: sourceUpload.asset.id,
    title: "API Source Underlay",
  });
  assert.equal(fromImage.project.document.objects[0].role, "source-underlay");
  assert.equal(fromImage.project.document.meta.sourceAssetId, sourceUpload.asset.id);
  assert.equal(fromImage.project.document.meta.workflow, "source-image-layout-extraction");
  assert.equal(fromImage.project.document.meta.visionProvider, "mock-vision-layout-v1");
  assert.ok(fromImage.project.document.objects.some((object) => object.name === "Product Layout Area"));

  const saved = await postJson(baseUrl, "/api/projects", {
    title: "API Smoke Layout",
    prompt: planned.prompt,
    document: placed.document,
  });
  assert.ok(saved.project.id);

  const project = await fetch(`${baseUrl}/api/projects/${saved.project.id}`).then((response) => response.json());
  assert.equal(project.project.id, saved.project.id);

  const updatedProject = await putJson(baseUrl, `/api/projects/${saved.project.id}`, {
    title: "API Smoke Layout Updated",
    prompt: `${planned.prompt}\nUpdated prompt`,
    document: placed.document,
  });
  assert.equal(updatedProject.project.id, saved.project.id);
  assert.equal(updatedProject.project.title, "API Smoke Layout Updated");
  const updatedProjectLoaded = await fetch(`${baseUrl}/api/projects/${saved.project.id}`).then((response) => response.json());
  assert.equal(updatedProjectLoaded.project.title, "API Smoke Layout Updated");

  const projectPatch = await postJson(baseUrl, `/api/projects/${saved.project.id}/patch`, {
    ops: [
      {
        type: "updateObject",
        id: "footer",
        patch: {
          content: "Dermatologist inspired",
        },
      },
    ],
  });
  assert.equal(projectPatch.project.document.objects.find((object) => object.id === "footer").content, "Dermatologist inspired");

  const renderJob = await postJson(baseUrl, `/api/projects/${saved.project.id}/render-jobs`, {
    tier: "raster-preview",
    wait: true,
  });
  assert.equal(renderJob.status, "ready", renderJob.error ?? "render should be ready");
  assert.ok(renderJob.pngUrl);
  assert.ok(renderJob.cleanPngUrl);

  const exported = await postJson(baseUrl, "/api/export/png", {
    document: placed.document,
    prompt: planned.prompt,
  });
  assert.ok(exported.pngUrl);
  assert.ok(exported.cleanPngUrl);
  const cleanExportResponse = await fetch(`${baseUrl}${exported.cleanPngUrl}`);
  assert.equal(cleanExportResponse.status, 200, "clean export PNG should be served");

  const sourceExported = await postJson(baseUrl, "/api/export/png", {
    document: analysis.document,
    prompt: "Clean source extraction export",
  });
  assert.equal(sourceExported.cleanExportVerification.required, true);
  assert.equal(sourceExported.cleanExportVerification.sourceUnderlayPresentInReference, true);
  assert.equal(sourceExported.cleanExportVerification.sourceUnderlayHidden, true);
  const cleanHtml = await fetch(`${baseUrl}${sourceExported.cleanHtmlUrl}`).then((response) => response.text());
  assert.ok(!cleanHtml.includes('data-object-id="source-underlay"'), "clean export HTML must hide source-underlay");
  const sourceManifest = await fetch(`${baseUrl}${sourceExported.manifestUrl}`).then((response) => response.json());
  assert.equal(sourceManifest.cleanExportVerification.sourceUnderlayHidden, true);

  const generated = await postJson(baseUrl, "/api/generate-image", {
    document: placed.document,
    prompt: planned.prompt,
    wait: true,
  });
  assert.equal(generated.status, "ready", generated.error ?? "generation should be ready");
  assert.equal(generated.provider, "mock-local");
  assert.ok(generated.cleanReferenceUrl);
  assert.ok(generated.imageUrl);
  assert.ok(generated.generationPrompt.includes("mock-local"));
  const generatedImageResponse = await fetch(`${baseUrl}${generated.imageUrl}`);
  assert.equal(generatedImageResponse.status, 200, "generated image should be served");
  const generationManifest = await fetch(`${baseUrl}${generated.manifestUrl}`).then((response) => response.json());
  assert.equal(generationManifest.productAssets[0].id, uploaded.asset.id, "generation manifest should carry product assets");
  assert.ok(generationManifest.layoutContract.primaryProductObjectIds.includes("product"));

  const eventText = await fetch(`${baseUrl}/api/render-jobs/${renderJob.jobId}/events`).then((response) => response.text());
  assert.ok(eventText.includes("event: render-job"), "SSE endpoint should emit render-job event");
  assert.ok(eventText.includes('"status":"ready"'), "SSE endpoint should include ready status");

  const generationEventText = await fetch(`${baseUrl}/api/generate-jobs/${generated.jobId}/events`).then((response) => response.text());
  assert.ok(generationEventText.includes("event: generation-job"), "generation SSE endpoint should emit generation-job event");
  assert.ok(generationEventText.includes('"status":"ready"'), "generation SSE endpoint should include ready status");

  const deletedProject = await deleteJson(baseUrl, `/api/projects/${saved.project.id}`);
  assert.equal(deletedProject.project.id, saved.project.id);
  const deletedProjectResponse = await fetch(`${baseUrl}/api/projects/${saved.project.id}`);
  assert.equal(deletedProjectResponse.status, 404, "deleted project should not load");
  const projectsAfterDelete = await fetch(`${baseUrl}/api/projects`).then((response) => response.json());
  assert.ok(!projectsAfterDelete.projects.some((item) => item.id === saved.project.id), "deleted project should leave project list");

  console.log(JSON.stringify({
    ok: true,
    port,
    projectId: saved.project.id,
    renderJobId: renderJob.jobId,
    generationJobId: generated.jobId,
    pngUrl: renderJob.pngUrl,
    cleanPngUrl: exported.cleanPngUrl,
    generatedImageUrl: generated.imageUrl,
  }, null, 2));
} finally {
  await close(server);
}
