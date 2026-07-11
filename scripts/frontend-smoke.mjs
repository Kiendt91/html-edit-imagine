#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import { createServer as createBackendServer } from "../src/backend/server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const screenshotDir = path.join(rootDir, "outputs", "test-runs", `frontend-smoke-${Date.now()}`);
const productSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="760" viewBox="0 0 520 760">
  <rect width="520" height="760" fill="transparent"/>
  <rect x="180" y="40" width="160" height="90" rx="28" fill="#1f1914"/>
  <rect x="210" y="126" width="100" height="110" fill="#d8bd8f"/>
  <rect x="92" y="210" width="336" height="438" rx="82" fill="#f7dfab" stroke="#6f5237" stroke-width="10"/>
  <rect x="156" y="390" width="208" height="126" fill="#fff7e8" stroke="#8a6b44" stroke-width="5"/>
  <text x="260" y="465" text-anchor="middle" font-family="Arial" font-size="34" font-weight="700" fill="#1f1914">UI</text>
</svg>`;
const sourceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <rect width="900" height="1200" fill="#f4eadc"/>
  <text x="450" y="180" text-anchor="middle" font-family="Georgia" font-size="92" font-weight="700" fill="#1f1914">SOURCE AD</text>
  <rect x="290" y="350" width="320" height="520" rx="80" fill="#f8dca4" stroke="#75583a" stroke-width="12"/>
  <circle cx="670" cy="790" r="86" fill="#191512"/>
  <text x="670" y="782" text-anchor="middle" font-family="Arial" font-size="30" font-weight="700" fill="#fffaf0">SALE</text>
  <text x="450" y="1060" text-anchor="middle" font-family="Arial" font-size="42" fill="#5b4d40">Trace this layout</text>
</svg>`;

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function closeNodeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

await fs.mkdir(screenshotDir, { recursive: true });
const productPath = path.join(screenshotDir, "frontend-product.svg");
await fs.writeFile(productPath, productSvg, "utf8");
const sourcePath = path.join(screenshotDir, "frontend-source.svg");
await fs.writeFile(sourcePath, sourceSvg, "utf8");

const backend = createBackendServer();
const backendPort = await listen(backend);
const vite = await createViteServer({
  root: rootDir,
  configFile: false,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 0,
    strictPort: false,
    proxy: {
      "/api": `http://127.0.0.1:${backendPort}`,
      "/renders": `http://127.0.0.1:${backendPort}`,
      "/generated": `http://127.0.0.1:${backendPort}`,
      "/assets": `http://127.0.0.1:${backendPort}`,
    },
  },
});

await vite.listen();
const frontendUrl = vite.resolvedUrls?.local[0];
assert.ok(frontendUrl, "Vite should expose a local URL");

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  await page.goto(frontendUrl, { waitUntil: "networkidle" });
  await page.getByText("AI Layout Studio").waitFor({ timeout: 15000 });
  await page.getByText(/Vision: mock-vision-layout-v1/i).waitFor({ timeout: 15000 });
  await page.locator(".layoutObject").first().waitFor({ timeout: 15000 });

  const objectCount = await page.locator(".layoutObject").count();
  assert.ok(objectCount >= 6, `Expected at least 6 layout objects, got ${objectCount}`);

  await page.getByRole("button", { name: /Plan/i }).click();
  await page.locator(".layoutObject").first().waitFor({ timeout: 15000 });

  await page.getByRole("button", { name: /Save/i }).click();
  await page.getByText(/Saved project/i).waitFor({ timeout: 15000 });
  await page.locator(".projectCard").first().waitFor({ timeout: 15000 });
  await page.locator(".currentProject .projectOpenButton").first().click();
  await page.getByText(/Loaded project/i).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /Save/i }).click();
  await page.getByText(/Updated project/i).waitFor({ timeout: 15000 });
  await page.locator('.currentProject button[title^="Duplicate"]').click();
  await page.getByText(/Duplicated project/i).waitFor({ timeout: 15000 });

  await page.getByRole("button", { name: /Snap/i }).click();
  await page.getByLabel("Grid size").fill("16");
  const layerButtonCount = await page.locator(".layerButton").count();
  assert.ok(layerButtonCount >= 4, "Layer controls should expose reorder/visibility/lock buttons");
  await page.locator('.layerButton[title="Move layer down"]').first().click();
  await page.getByText("Layout updated.").waitFor({ timeout: 15000 });

  const selectedBox = await page.locator(".selectedObject").boundingBox();
  assert.ok(selectedBox, "Selected object should have a bounding box");
  await page.mouse.move(selectedBox.x + selectedBox.width / 2, selectedBox.y + selectedBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(selectedBox.x + selectedBox.width / 2 + 24, selectedBox.y + selectedBox.height / 2 + 18);
  await page.mouse.up();
  await page.getByText("Layout updated.").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /Undo/i }).click();
  await page.getByText("Undo.").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /Redo/i }).click();
  await page.getByText("Redo.").waitFor({ timeout: 15000 });

  await page.locator(".patchAssistant textarea").fill("Move the product up");
  await page.locator(".patchActions").getByRole("button", { name: /^Preview$/ }).click();
  await page.getByText(/Patch preview ready/i).waitFor({ timeout: 15000 });
  await page.locator(".patchPreview").waitFor({ timeout: 15000 });
  await page.locator(".patchSummaryItem").first().waitFor({ timeout: 15000 });
  await page.locator(".patchActions").getByRole("button", { name: /^Apply/ }).click();
  await page.getByText(/Instruction patch applied/i).waitFor({ timeout: 15000 });

  await page.locator(".assetUploadBox input[type=file]").setInputFiles(productPath);
  await page.locator(".assetImage").first().waitFor({ timeout: 15000 });
  await page.locator(".assetCard").first().waitFor({ timeout: 15000 });
  await page.locator(".assetCard").first().getByRole("button", { name: /^Use$/i }).click();
  await page.getByText(/Placed asset/i).waitFor({ timeout: 15000 });
  assert.equal(await page.locator(".assetCard").first().locator(".dangerMiniButton").isDisabled(), true, "Asset delete should be disabled while used by the current layout");

  await page.getByRole("button", { name: /Export/i }).click();
  const preview = page.locator(".outputPreview");
  await preview.waitFor({ timeout: 30000 });
  const naturalWidth = await preview.evaluate((img) => img instanceof HTMLImageElement ? img.naturalWidth : 0);
  assert.ok(naturalWidth > 100, "Exported preview image should load");

  await page.getByRole("button", { name: /Generate/i }).click();
  const generatedPreview = page.locator(".generatedPreview");
  await generatedPreview.waitFor({ timeout: 30000 });
  const generatedNaturalWidth = await generatedPreview.evaluate((img) => img instanceof HTMLImageElement ? img.naturalWidth : 0);
  assert.ok(generatedNaturalWidth > 100, "Generated preview image should load");

  await page.locator(".sourceImportBox input[type=file]").setInputFiles(sourcePath);
  await page.getByText("Source Image Underlay").waitFor({ timeout: 15000 });
  await page.getByText("Product Layout Area").waitFor({ timeout: 15000 });
  await page.getByText(/locked image/i).waitFor({ timeout: 15000 });
  const underlayImageCount = await page.locator(".assetImage").count();
  assert.ok(underlayImageCount >= 1, "Source underlay should render as an asset image");
  await page.getByRole("button", { name: /Extract Layout/i }).click();
  await page.getByText(/Extracted layout with/i).waitFor({ timeout: 15000 });
  await page.getByText("Extraction review").waitFor({ timeout: 15000 });
  await page.locator(".extractionReview").getByText("Confidence", { exact: true }).waitFor({ timeout: 15000 });

  const screenshotPath = path.join(screenshotDir, "editor.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(JSON.stringify({
    ok: true,
    backendPort,
    frontendUrl,
    objectCount,
    screenshotPath,
  }, null, 2));
} finally {
  await browser.close();
  await vite.close();
  await closeNodeServer(backend);
}
