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
const demoDir = path.join(rootDir, "outputs", "demo-tests", `demo-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}`);

const productSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="760" viewBox="0 0 520 760">
  <rect width="520" height="760" fill="transparent"/>
  <rect x="178" y="42" width="164" height="86" rx="28" fill="#181512"/>
  <rect x="208" y="126" width="104" height="116" fill="#c8a16d"/>
  <rect x="86" y="214" width="348" height="440" rx="86" fill="#f1d48f" stroke="#5e4430" stroke-width="10"/>
  <rect x="150" y="386" width="220" height="136" rx="12" fill="#fff8e8" stroke="#765a3d" stroke-width="5"/>
  <text x="260" y="454" text-anchor="middle" font-family="Arial" font-size="32" font-weight="700" fill="#1a1714">DEMO</text>
  <text x="260" y="494" text-anchor="middle" font-family="Arial" font-size="22" fill="#6b4e34">PRODUCT</text>
</svg>`;

const sourceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <rect width="900" height="1200" fill="#f3eadb"/>
  <text x="450" y="164" text-anchor="middle" font-family="Georgia" font-size="88" font-weight="700" fill="#1c1814">SOURCE AD</text>
  <rect x="112" y="238" width="676" height="58" rx="29" fill="#d6c2aa"/>
  <rect x="288" y="360" width="324" height="510" rx="82" fill="#f1d48f" stroke="#6a4c31" stroke-width="12"/>
  <circle cx="690" cy="804" r="88" fill="#191512"/>
  <text x="690" y="797" text-anchor="middle" font-family="Arial" font-size="30" font-weight="700" fill="#fff8ed">SALE</text>
  <text x="450" y="1064" text-anchor="middle" font-family="Arial" font-size="42" fill="#54483d">Trace this layout</text>
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

async function screenshot(page, fileName) {
  const filePath = path.join(demoDir, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function copyImageFromPage(page, src, fileName) {
  const absoluteUrl = new URL(src, page.url()).href;
  const response = await fetch(absoluteUrl);
  assert.ok(response.ok, `Expected exported image to load from ${absoluteUrl}`);
  const outputPath = path.join(demoDir, fileName);
  await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  return outputPath;
}

await fs.mkdir(demoDir, { recursive: true });
const productPath = path.join(demoDir, "demo-product.svg");
const sourcePath = path.join(demoDir, "demo-source-layout.svg");
await fs.writeFile(productPath, productSvg, "utf8");
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

const artifacts = [];
const assertions = [];
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  await page.goto(frontendUrl, { waitUntil: "networkidle" });
  await page.getByText("AI Layout Studio").waitFor({ timeout: 15000 });
  await page.locator(".layoutObject").first().waitFor({ timeout: 15000 });

  artifacts.push(["01 editor loaded", await screenshot(page, "01-editor-loaded.png")]);
  assertions.push("Editor loads the sample LayoutDocument and renders DOM layout objects.");

  await page.locator(".ideaBlock textarea").fill("Premium coffee product poster with centered package, strong headline, badge, and warm editorial styling");
  await page.getByRole("button", { name: /^Plan$/i }).click();
  await page.getByText("Planner created a layout.").waitFor({ timeout: 15000 });
  await page.locator('[data-role="headline"]').waitFor({ timeout: 15000 });
  artifacts.push(["02 planner result", await screenshot(page, "02-planner-result.png")]);
  assertions.push("Planner endpoint returns a validated LayoutDocument and prompt.");

  await page.locator(".layerList li").filter({ hasText: "Headline" }).click();
  await page.locator(".properties textarea").fill("EDITOR DEMO");
  await page.locator(".textObject").filter({ hasText: "EDITOR DEMO" }).first().waitFor({ timeout: 15000 });
  artifacts.push(["03 text property edited", await screenshot(page, "03-text-property-edited.png")]);
  assertions.push("Properties panel edits text content and commits it through patch commands.");

  await page.locator(".layerList li").filter({ hasText: "Perfume Bottle" }).click();
  const productBoxBefore = await page.locator(".selectedObject").boundingBox();
  assert.ok(productBoxBefore, "Selected product object should have a bounding box before dragging");
  await page.mouse.move(productBoxBefore.x + productBoxBefore.width / 2, productBoxBefore.y + productBoxBefore.height / 2);
  await page.mouse.down();
  await page.mouse.move(productBoxBefore.x + productBoxBefore.width / 2 + 36, productBoxBefore.y + productBoxBefore.height / 2 + 24);
  await page.mouse.up();
  const productBoxAfter = await page.locator(".selectedObject").boundingBox();
  assert.ok(productBoxAfter, "Selected product object should have a bounding box after dragging");
  assert.ok(Math.abs(productBoxAfter.x - productBoxBefore.x) > 4 || Math.abs(productBoxAfter.y - productBoxBefore.y) > 4, "Dragging should move the selected product object");
  artifacts.push(["04 product moved", await screenshot(page, "04-product-moved.png")]);
  assertions.push("Canvas direct manipulation moves the selected product object in document coordinates.");

  await page.locator(".assetUploadBox input[type=file]").setInputFiles(productPath);
  await page.locator(".assetImage").first().waitFor({ timeout: 15000 });
  artifacts.push(["05 product asset placed", await screenshot(page, "05-product-asset-placed.png")]);
  assertions.push("Product image upload stores an asset and replaces the product-image placeholder.");

  await page.getByRole("button", { name: /^Export$/i }).click();
  const preview = page.locator(".outputPreview");
  await preview.waitFor({ timeout: 30000 });
  const naturalWidth = await preview.evaluate((img) => (img instanceof HTMLImageElement ? img.naturalWidth : 0));
  assert.ok(naturalWidth > 100, "Exported PNG preview should load in the output panel");
  const previewSrc = await preview.getAttribute("src");
  assert.ok(previewSrc, "Exported PNG preview should expose a src");
  artifacts.push(["06 export preview", await screenshot(page, "06-export-preview.png")]);
  artifacts.push(["06 exported png", await copyImageFromPage(page, previewSrc, "06-exported-layout.png")]);
  assertions.push("PNG export renders the current DOM layout through the backend exporter.");

  await page.locator(".sourceImportBox input[type=file]").setInputFiles(sourcePath);
  await page.getByText("Source Image Underlay").waitFor({ timeout: 15000 });
  await page.getByText("Product Layout Area").waitFor({ timeout: 15000 });
  await page.getByText(/locked image/i).waitFor({ timeout: 15000 });
  artifacts.push(["07 source layout imported", await screenshot(page, "07-source-layout-imported.png")]);
  assertions.push("Source layout image import creates a project with a locked underlay and editable HTML layout blocks.");

  await page.getByRole("button", { name: /Extract Layout/i }).click();
  await page.getByText(/Extracted layout confidence/i).waitFor({ timeout: 15000 });
  artifacts.push(["08 layout extraction", await screenshot(page, "08-layout-extraction.png")]);
  assertions.push("Layout extraction endpoint returns confidence and editable HTML region blocks.");

  const reportPath = path.join(demoDir, "REPORT.md");
  const relativeArtifacts = artifacts.map(([label, artifactPath]) => `- ${label}: ${path.relative(rootDir, artifactPath).replaceAll("\\", "/")}`).join("\n");
  const report = `# AI Layout Studio Demo Walkthrough

Generated: ${new Date().toISOString()}

## Result

PASS

## Runtime

- Frontend: ${frontendUrl}
- Backend: http://127.0.0.1:${backendPort}

## Features Covered

${assertions.map((item) => `- ${item}`).join("\n")}

## Artifacts

${relativeArtifacts}
`;
  await fs.writeFile(reportPath, report, "utf8");
  artifacts.push(["report", reportPath]);

  console.log(JSON.stringify({
    ok: true,
    demoDir,
    reportPath,
    frontendUrl,
    backendPort,
    artifacts: artifacts.map(([label, artifactPath]) => ({ label, path: artifactPath })),
  }, null, 2));
} finally {
  await browser.close();
  await vite.close();
  await closeNodeServer(backend);
}
