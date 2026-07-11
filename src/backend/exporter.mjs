import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { renderLayoutHtml } from "./html-renderer.mjs";
import { assertValidLayoutDocument } from "./layout-validator.mjs";

export function hashDocument(document, prompt = "") {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(document))
    .update("\n")
    .update(prompt)
    .digest("hex")
    .slice(0, 16);
}

export function buildCodexImagePrompt({ prompt, pngPath, document }) {
  const title = document.meta?.title ?? "AI layout";
  return [
    `Use the layout reference image at: ${pngPath}`,
    "",
    `Project: ${title}`,
    "",
    "Create a polished final advertisement based on the composition.",
    "Preserve the relative placement, scale, and hierarchy of the HTML layout reference.",
    "Keep the main product centered, keep headline/logo/badge zones readable, and render the scene as a premium finished image.",
    "",
    `Style prompt: ${prompt}`,
  ].join("\n");
}

function verifyCleanExportContract({ document, html, cleanHtml }) {
  const isSourceExtraction = document.meta?.workflow === "source-image-layout-extraction";
  const sourceUnderlayPresentInReference = html.includes('data-object-id="source-underlay"');
  const sourceUnderlayHidden = !cleanHtml.includes('data-object-id="source-underlay"');
  const objectGuidesHidden = !cleanHtml.includes("attr(data-role)");
  const verification = {
    workflow: document.meta?.workflow ?? null,
    required: isSourceExtraction,
    sourceUnderlayPresentInReference,
    sourceUnderlayHidden,
    objectGuidesHidden,
  };

  if (isSourceExtraction && (!sourceUnderlayPresentInReference || !sourceUnderlayHidden)) {
    const error = new Error("Clean export verification failed: source-underlay must be present in guided reference and hidden in clean export.");
    error.verification = verification;
    throw error;
  }

  return verification;
}

async function screenshotCanvas(page, htmlPath, pngPath) {
  await page.goto(`file:///${htmlPath.replaceAll("\\", "/")}`, { waitUntil: "networkidle" });
  const canvas = page.locator("#layout-canvas");
  await canvas.screenshot({ path: pngPath });
}

export async function exportLayoutToFiles({ document, prompt = "", outputDir, rootDir = process.cwd(), jobId, documentHash }) {
  assertValidLayoutDocument(document);

  const resolvedDocumentHash = documentHash ?? hashDocument(document, prompt);
  const resolvedJobId = jobId ?? `render-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}-${resolvedDocumentHash}`;
  const jobDir = path.join(outputDir, resolvedJobId);
  await fs.mkdir(jobDir, { recursive: true });

  const html = renderLayoutHtml(document, { prompt, rootDir, showObjectGuides: true });
  const cleanHtml = renderLayoutHtml(document, { prompt, rootDir, showObjectGuides: false });
  const cleanExportVerification = verifyCleanExportContract({ document, html, cleanHtml });
  const htmlPath = path.join(jobDir, "layout.html");
  const cleanHtmlPath = path.join(jobDir, "layout-clean.html");
  const pngPath = path.join(jobDir, "layout-reference.png");
  const cleanPngPath = path.join(jobDir, "layout-clean.png");
  const manifestPath = path.join(jobDir, "manifest.json");
  const promptPath = path.join(jobDir, "codex-image-prompt.md");

  await fs.writeFile(htmlPath, html, "utf8");
  await fs.writeFile(cleanHtmlPath, cleanHtml, "utf8");

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: {
        width: Math.max(1440, document.canvas.width + 680),
        height: Math.max(1100, document.canvas.height + 120),
        deviceScaleFactor: 1,
      },
    });
    await screenshotCanvas(page, htmlPath, pngPath);
    await screenshotCanvas(page, cleanHtmlPath, cleanPngPath);
    await page.close();
  } finally {
    await browser.close();
  }

  const codexPrompt = buildCodexImagePrompt({ prompt, pngPath: cleanPngPath, document });
  await fs.writeFile(promptPath, codexPrompt, "utf8");

  const manifest = {
    jobId: resolvedJobId,
    documentHash: resolvedDocumentHash,
    createdAt: new Date().toISOString(),
    title: document.meta?.title ?? null,
    prompt,
    htmlPath,
    cleanHtmlPath,
    pngPath,
    cleanPngPath,
    promptPath,
    codexPrompt,
    canvas: document.canvas,
    cleanExportVerification,
  };

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  return {
    ...manifest,
    manifestPath,
  };
}
