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
const videoDir = path.join(rootDir, "outputs", "demo-videos", `tester-flow-${runStamp}`);
const rawVideoDir = path.join(videoDir, "raw-video");
const viewport = { width: 1440, height: 980 };

const testerIdea = "Premium coffee product poster with centered package, strong headline, badge, and warm editorial styling";
const productSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="760" viewBox="0 0 520 760">
  <rect width="520" height="760" fill="transparent"/>
  <rect x="132" y="70" width="256" height="612" rx="44" fill="#39281c"/>
  <rect x="154" y="104" width="212" height="544" rx="32" fill="#f0d9ad"/>
  <rect x="186" y="210" width="148" height="176" rx="74" fill="#6a482e"/>
  <text x="260" y="468" text-anchor="middle" font-family="Arial" font-size="40" font-weight="700" fill="#2b2018">BOLD</text>
  <text x="260" y="510" text-anchor="middle" font-family="Arial" font-size="34" fill="#6a482e">COFFEE</text>
  <rect x="176" y="548" width="168" height="42" rx="21" fill="#211812"/>
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
    caption.innerHTML = "Tester recording started<span>Walking from idea to exported image.</span>";
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
      if (caption) {
        caption.innerHTML = `${nextTitle}<span>${nextDetail}</span>`;
      }
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
    box,
  };
}

async function moveCursor(page, x, y) {
  await page.evaluate(
    ({ x: nextX, y: nextY }) => {
      const cursor = document.querySelector(".testerCursor");
      if (cursor) {
        cursor.style.transform = `translate(${nextX - 11}px, ${nextY - 11}px)`;
      }
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

async function dragLocator(page, locator, dx, dy) {
  const { x, y } = await locatorCenter(locator);
  await moveCursor(page, x, y);
  await page.evaluate(() => document.querySelector(".testerCursor")?.classList.add("isClicking"));
  await page.mouse.down();
  await moveCursor(page, x + dx / 2, y + dy / 2);
  await moveCursor(page, x + dx, y + dy);
  await page.mouse.up();
  await page.evaluate(() => document.querySelector(".testerCursor")?.classList.remove("isClicking"));
  await page.waitForTimeout(500);
}

async function typeIntoLocator(page, locator, value) {
  await clickLocator(page, locator);
  await page.keyboard.press("Control+A");
  await page.keyboard.type(value, { delay: 12 });
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
const productPath = path.join(videoDir, "tester-product.svg");
await fs.writeFile(productPath, productSvg, "utf8");

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
let page;
let videoHandle;
let finalImagePath = "";
let generatedImagePath = "";

try {
  context = await browser.newContext({
    viewport,
    recordVideo: {
      dir: rawVideoDir,
      size: viewport,
    },
  });
  page = await context.newPage();
  videoHandle = page.video();

  await page.goto(frontendUrl, { waitUntil: "networkidle" });
  await page.getByText("AI Layout Studio").waitFor({ timeout: 15000 });
  await page.locator(".layoutObject").first().waitFor({ timeout: 15000 });
  await installTesterOverlay(page);

  await setCaption(page, "Step 1 - Open the editor", "Tester confirms the sample LayoutDocument renders on the HTML canvas.");
  await wait(900);

  await setCaption(page, "Step 2 - Enter an image idea", "The idea is typed into the left panel, then sent to the layout planner.");
  await typeIntoLocator(page, page.locator(".ideaBlock textarea"), testerIdea);
  await clickLocator(page, page.getByRole("button", { name: /^Plan$/i }));
  await page.getByText("Planner created a layout.").waitFor({ timeout: 15000 });
  await page.locator('[data-role="headline"]').waitFor({ timeout: 15000 });
  await wait(900);

  await setCaption(page, "Step 3 - Edit text in the selected layout region", "Tester selects the headline layer and changes the content in Properties.");
  await clickLocator(page, page.locator(".layerList li").filter({ hasText: "Headline" }));
  await typeIntoLocator(page, page.locator(".properties textarea"), "MORNING RITUAL");
  await page.locator(".textObject").filter({ hasText: "MORNING RITUAL" }).first().waitFor({ timeout: 15000 });
  await wait(700);

  await setCaption(page, "Step 4 - Move and resize a canvas object", "Tester directly manipulates the product slot on the HTML canvas.");
  await clickLocator(page, page.locator(".layerList li").filter({ hasText: "Perfume Bottle" }));
  await dragLocator(page, page.locator(".selectedObject"), 42, 28);
  await dragLocator(page, page.locator(".resizeHandle.corner"), 34, 44);
  await wait(700);

  await setCaption(page, "Step 5 - Upload a product asset", "The product-image placeholder is replaced by an uploaded image asset.");
  const uploadInput = page.locator(".assetUploadBox input[type=file]");
  const { x: uploadX, y: uploadY } = await locatorCenter(uploadInput);
  await moveCursor(page, uploadX, uploadY);
  await uploadInput.setInputFiles(productPath);
  await page.locator(".assetImage").first().waitFor({ timeout: 15000 });
  await wait(1100);

  await setCaption(page, "Step 6 - Export the final reference image", "The backend renders the current layout to a PNG and shows it in Output.");
  await clickLocator(page, page.getByRole("button", { name: /^Export$/i }));
  const preview = page.locator(".outputPreview");
  await preview.waitFor({ timeout: 30000 });
  const naturalWidth = await preview.evaluate((img) => (img instanceof HTMLImageElement ? img.naturalWidth : 0));
  assert.ok(naturalWidth > 100, "Exported PNG preview should load");
  const previewSrc = await preview.getAttribute("src");
  assert.ok(previewSrc, "Exported PNG preview should expose a src");
  finalImagePath = await copyImageFromPage(page, previewSrc, "final-exported-image.png");
  await wait(1300);

  await setCaption(page, "Step 7 - Generate the final image job", "The MVP uses mock-local generation now: clean reference in, generated image artifact out.");
  await clickLocator(page, page.getByRole("button", { name: /^Generate$/i }));
  const generatedPreview = page.locator(".generatedPreview");
  await generatedPreview.waitFor({ timeout: 30000 });
  const generatedNaturalWidth = await generatedPreview.evaluate((img) => (img instanceof HTMLImageElement ? img.naturalWidth : 0));
  assert.ok(generatedNaturalWidth > 100, "Generated image preview should load");
  const generatedSrc = await generatedPreview.getAttribute("src");
  assert.ok(generatedSrc, "Generated image preview should expose a src");
  generatedImagePath = await copyImageFromPage(page, generatedSrc, "generated-image.png");
  await wait(1300);

  await setCaption(page, "Step 8 - Tester result: PASS", "Idea, layout edit, asset placement, clean export, and generate job all completed.");
  await page.screenshot({ path: path.join(videoDir, "final-screen.png"), fullPage: true });
  await wait(1800);
} finally {
  if (context) {
    await context.close();
  }
  await browser.close();
  await vite.close();
  await closeNodeServer(backend);
}

assert.ok(videoHandle, "Video handle should exist");
const rawVideoPath = await videoHandle.path();
const finalVideoPath = path.join(videoDir, "tester-flow.webm");
await fs.rename(rawVideoPath, finalVideoPath);

const videoStats = await fs.stat(finalVideoPath);
assert.ok(videoStats.size > 10_000, "Recorded video should not be empty");

const reportPath = path.join(videoDir, "REPORT.md");
const report = `# AI Layout Studio Tester Recording

Generated: ${new Date().toISOString()}

## Result

PASS

## Scenario

Tester records the app flow from an image idea to an exported reference PNG.

## Steps

1. Open the editor and confirm the DOM canvas loads.
2. Type an image idea and run Plan.
3. Select the headline layout region and edit its text.
4. Move and resize the product slot directly on the canvas.
5. Upload a product image asset into the product slot.
6. Export the edited layout to PNG.
7. Run the generate image job.
8. Confirm the output panel shows the generated image.

## Artifacts

- Video: ${path.relative(rootDir, finalVideoPath).replaceAll("\\", "/")}
- Final screen: ${path.relative(rootDir, path.join(videoDir, "final-screen.png")).replaceAll("\\", "/")}
- Final exported image: ${path.relative(rootDir, finalImagePath).replaceAll("\\", "/")}
- Generated image: ${path.relative(rootDir, generatedImagePath).replaceAll("\\", "/")}

## Runtime

- Frontend: ${frontendUrl}
- Backend: http://127.0.0.1:${backendPort}
`;
await fs.writeFile(reportPath, report, "utf8");

console.log(JSON.stringify({
  ok: true,
  videoPath: finalVideoPath,
  finalImagePath,
  generatedImagePath,
  finalScreenPath: path.join(videoDir, "final-screen.png"),
  reportPath,
  bytes: videoStats.size,
}, null, 2));
