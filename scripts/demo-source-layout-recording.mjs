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
const runStamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const videoDir = path.join(rootDir, "outputs", "demo-videos", `source-layout-flow-${runStamp}`);
const rawVideoDir = path.join(videoDir, "raw-video");
const viewport = { width: 1440, height: 980 };
const inputImageArg = process.argv[2] ? path.resolve(process.argv[2]) : null;

const sourceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <rect width="900" height="1200" fill="#f5eddf"/>
  <rect x="74" y="70" width="752" height="1060" rx="38" fill="#fff7ea" stroke="#d3b997" stroke-width="6"/>
  <text x="450" y="176" text-anchor="middle" font-family="Georgia" font-size="78" font-weight="700" fill="#1f1a15">SOURCE POSTER</text>
  <text x="450" y="244" text-anchor="middle" font-family="Arial" font-size="30" fill="#6b5a4c">upload this image, then trace its regions</text>
  <rect x="286" y="350" width="328" height="500" rx="84" fill="#f4d99b" stroke="#715237" stroke-width="12"/>
  <rect x="350" y="476" width="200" height="116" rx="18" fill="#fff8ea" stroke="#886440" stroke-width="5"/>
  <text x="450" y="546" text-anchor="middle" font-family="Arial" font-size="32" font-weight="700" fill="#2c2118">PRODUCT</text>
  <circle cx="680" cy="780" r="92" fill="#1f1a15"/>
  <text x="680" y="772" text-anchor="middle" font-family="Arial" font-size="32" font-weight="700" fill="#fff8ea">BADGE</text>
  <rect x="176" y="956" width="548" height="76" rx="38" fill="#dcc8ae"/>
  <text x="450" y="1005" text-anchor="middle" font-family="Arial" font-size="30" fill="#4f443b">footer copy zone</text>
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

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function installTesterOverlay(page) {
  await page.addStyleTag({
    content: `
      .testerCaption {
        position: fixed;
        left: 18px;
        bottom: 18px;
        z-index: 2147483646;
        max-width: min(760px, calc(100vw - 36px));
        padding: 12px 14px;
        border-radius: 8px;
        background: rgba(20, 17, 14, 0.9);
        color: #fff8ef;
        border: 1px solid rgba(255, 255, 255, 0.22);
        box-shadow: 0 16px 44px rgba(0, 0, 0, 0.28);
        font: 700 15px/1.35 Inter, Arial, sans-serif;
        pointer-events: none;
      }

      .testerCaption span {
        display: block;
        margin-top: 3px;
        color: rgba(255, 248, 239, 0.78);
        font-weight: 500;
        font-size: 13px;
      }

      .testerCursor {
        position: fixed;
        left: 0;
        top: 0;
        z-index: 2147483647;
        width: 22px;
        height: 22px;
        border: 2px solid #0f62fe;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.72);
        box-shadow: 0 0 0 5px rgba(15, 98, 254, 0.16);
        transform: translate(-80px, -80px);
        transition: transform 160ms ease, width 120ms ease, height 120ms ease;
        pointer-events: none;
      }

      .testerCursor.isClicking {
        width: 16px;
        height: 16px;
        background: rgba(15, 98, 254, 0.48);
      }
    `,
  });
  await page.evaluate(() => {
    const caption = document.createElement("div");
    caption.className = "testerCaption";
    caption.innerHTML = "Source layout tester recording started<span>Import image, create layout document, export PNG.</span>";
    document.body.appendChild(caption);

    const cursor = document.createElement("div");
    cursor.className = "testerCursor";
    document.body.appendChild(cursor);
  });
}

async function setCaption(page, title, detail = "") {
  await page.evaluate(
    ({ title: nextTitle, detail: nextDetail }) => {
      const caption = document.querySelector(".testerCaption");
      if (caption) caption.innerHTML = `${nextTitle}<span>${nextDetail}</span>`;
    },
    { title, detail },
  );
  await page.waitForTimeout(650);
}

async function locatorCenter(locator) {
  const box = await locator.boundingBox();
  assert.ok(box, "Expected locator to have a visible bounding box");
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

async function moveCursor(page, x, y) {
  await page.evaluate(
    ({ x: nextX, y: nextY }) => {
      const cursor = document.querySelector(".testerCursor");
      if (cursor) cursor.style.transform = `translate(${nextX - 11}px, ${nextY - 11}px)`;
    },
    { x, y },
  );
  await page.mouse.move(x, y);
  await page.waitForTimeout(180);
}

async function clickLocator(page, locator) {
  const { x, y } = await locatorCenter(locator);
  await moveCursor(page, x, y);
  await page.evaluate(() => document.querySelector(".testerCursor")?.classList.add("isClicking"));
  await page.mouse.click(x, y);
  await page.waitForTimeout(140);
  await page.evaluate(() => document.querySelector(".testerCursor")?.classList.remove("isClicking"));
}

async function copyImageFromPage(page, src, fileName) {
  const absoluteUrl = new URL(src, page.url()).href;
  const response = await fetch(absoluteUrl);
  assert.ok(response.ok, `Expected exported image to load from ${absoluteUrl}`);
  const outputPath = path.join(videoDir, fileName);
  await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  return outputPath;
}

await fs.mkdir(rawVideoDir, { recursive: true });
let sourcePath;
if (inputImageArg) {
  await fs.access(inputImageArg);
  const extension = path.extname(inputImageArg) || ".img";
  sourcePath = path.join(videoDir, `source-layout-input${extension}`);
  await fs.copyFile(inputImageArg, sourcePath);
} else {
  sourcePath = path.join(videoDir, "source-layout-input.svg");
  await fs.writeFile(sourcePath, sourceSvg, "utf8");
}

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
let context;
let videoHandle;
let exportPath = "";

try {
  context = await browser.newContext({
    viewport,
    recordVideo: {
      dir: rawVideoDir,
      size: viewport,
    },
  });
  const page = await context.newPage();
  videoHandle = page.video();

  await page.goto(frontendUrl, { waitUntil: "networkidle" });
  await page.getByText("AI Layout Studio").waitFor({ timeout: 15000 });
  await page.locator(".layoutObject").first().waitFor({ timeout: 15000 });
  await installTesterOverlay(page);

  await setCaption(page, "Step 1 - Open source image workflow", "Tester uses the Import layout image control on the left panel.");
  await wait(900);

  await setCaption(page, "Step 2 - Upload a poster image", "The image is stored as a source-layout asset before it becomes layout state.");
  const uploadInput = page.locator(".sourceImportBox input[type=file]");
  const uploadCenter = await locatorCenter(uploadInput);
  await moveCursor(page, uploadCenter.x, uploadCenter.y);
  await uploadInput.setInputFiles(sourcePath);
  await page.getByText("Source Image Underlay").waitFor({ timeout: 15000 });
  await page.getByText("Product Layout Area").waitFor({ timeout: 15000 });
  await page.getByText(/locked image/i).waitFor({ timeout: 15000 });
  await wait(1200);

  await setCaption(page, "Step 3 - LayoutDocument is created", "The uploaded image is now a faint underlay, with editable HTML layout blocks above it.");
  await clickLocator(page, page.locator(".layerList li").filter({ hasText: "Product Layout Area" }));
  await wait(1200);

  await setCaption(page, "Step 4 - Extract editable layout blocks", "The MVP heuristic returns a table of HTML regions: headline, product, motion, accents, and background.");
  await clickLocator(page, page.getByRole("button", { name: /Extract Layout/i }));
  await page.getByText(/Extracted layout confidence/i).waitFor({ timeout: 15000 });
  await page.getByText("Headline Left Block").waitFor({ timeout: 15000 });
  await wait(1200);

  await setCaption(page, "Step 5 - Export the HTML layout", "Clean export hides the original underlay and renders only the extracted HTML layout blocks.");
  await clickLocator(page, page.getByRole("button", { name: /^Export$/i }));
  const preview = page.locator(".outputPreview");
  await preview.waitFor({ timeout: 30000 });
  const previewSrc = await preview.getAttribute("src");
  assert.ok(previewSrc, "Exported PNG preview should expose a src");
  exportPath = await copyImageFromPage(page, previewSrc, "source-layout-export.png");
  await wait(1400);

  await setCaption(page, "Step 6 - Tester result: PASS", "Image input became an editable HTML layout document and exported successfully.");
  await page.screenshot({ path: path.join(videoDir, "final-screen.png"), fullPage: true });
  await wait(1700);
} finally {
  if (context) await context.close();
  await browser.close();
  await vite.close();
  await closeNodeServer(backend);
}

assert.ok(videoHandle, "Video handle should exist");
const rawVideoPath = await videoHandle.path();
const finalVideoPath = path.join(videoDir, "source-layout-flow.webm");
await fs.rename(rawVideoPath, finalVideoPath);

const videoStats = await fs.stat(finalVideoPath);
assert.ok(videoStats.size > 10_000, "Recorded video should not be empty");

const reportPath = path.join(videoDir, "REPORT.md");
await fs.writeFile(
  reportPath,
  `# Source Image To Layout Tester Recording

Generated: ${new Date().toISOString()}

## Result

PASS

## Scenario

Tester uploads a source image, the app creates a locked source underlay plus editable HTML layout blocks, runs the current heuristic extraction, and exports the resulting layout PNG.

## Artifacts

- Video: ${path.relative(rootDir, finalVideoPath).replaceAll("\\", "/")}
- Input image: ${path.relative(rootDir, sourcePath).replaceAll("\\", "/")}
- Exported layout PNG: ${path.relative(rootDir, exportPath).replaceAll("\\", "/")}
- Final screen: ${path.relative(rootDir, path.join(videoDir, "final-screen.png")).replaceAll("\\", "/")}

## Runtime

- Frontend: ${frontendUrl}
- Backend: http://127.0.0.1:${backendPort}
`,
  "utf8",
);

console.log(JSON.stringify({
  ok: true,
  videoPath: finalVideoPath,
  exportedLayoutPath: exportPath,
  finalScreenPath: path.join(videoDir, "final-screen.png"),
  reportPath,
  bytes: videoStats.size,
}, null, 2));
