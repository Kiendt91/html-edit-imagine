import fs from "node:fs/promises";
import path from "node:path";
import { appendFileToForm, openAiForm } from "./openai-client.mjs";

export function productAssetsFromDocument(document) {
  const productAssetIds = new Set(
    document.objects
      .filter((object) => object.type === "product-image" || object.role === "product" || object.promptRole === "primary-product")
      .map((object) => object.assetId)
      .filter(Boolean),
  );
  return (document.assets ?? []).filter((asset) => productAssetIds.has(asset.id));
}

export function sourceAssetsFromDocument(document) {
  const sourceAssetIds = new Set(
    [
      document.meta?.sourceAssetId,
      ...document.objects
        .filter((object) => object.role === "source-underlay" || object.analysisMeta?.extractedFromAssetId)
        .map((object) => object.assetId ?? object.analysisMeta?.extractedFromAssetId),
    ].filter(Boolean),
  );
  return (document.assets ?? []).filter((asset) => sourceAssetIds.has(asset.id));
}

export function buildGenerationPrompt({ prompt, document, cleanPngPath, productAssets }) {
  const title = document.meta?.title ?? "AI layout";
  const productLines =
    productAssets.length > 0
      ? productAssets.map((asset) => `- Preserve product asset: ${asset.name} (${asset.filePath ?? asset.src})`).join("\n")
      : "- No separate product asset was attached; use the layout reference as the subject guide.";

  return [
    `Project: ${title}`,
    "",
    `Clean composition reference: ${cleanPngPath}`,
    "",
    "Generate a polished final image from this layout.",
    "Keep the relative positions, scale, and hierarchy of the clean reference.",
    "Do not render editor outlines, layer labels, selection boxes, or UI controls.",
    "Keep text zones readable unless the selected image model is instructed to stylize text.",
    "",
    "Subject assets:",
    productLines,
    "",
    `Style prompt: ${prompt}`,
  ].join("\n");
}

function providerNote(providerId) {
  if (providerId === "mock-local") {
    return "mock-local copies layout-clean.png to generated-image.png so the end-to-end job contract can be tested before adding or enabling a real AI provider.";
  }
  return "OpenAI image provider generated the image from the clean layout reference and prompt package.";
}

export class MockImageGenerationProvider {
  id = "mock-local";
  mode = "stub";

  async generate({ exportManifest, imagePath }) {
    await fs.copyFile(exportManifest.cleanPngPath, imagePath);
    return {
      imagePath,
      providerMode: this.mode,
      note: providerNote(this.id),
      outputFormat: "png",
    };
  }
}

export class OpenAIImageGenerationProvider {
  constructor({
    rootDir,
    model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5",
    quality = process.env.OPENAI_IMAGE_QUALITY ?? "auto",
    size = process.env.OPENAI_IMAGE_SIZE ?? "auto",
  }) {
    this.id = "openai-image";
    this.mode = "api";
    this.rootDir = rootDir;
    this.model = model;
    this.quality = quality;
    this.size = size;
  }

  async generate({ document, exportManifest, imagePath, generationPrompt, productAssets }) {
    const form = new FormData();
    form.append("model", this.model);
    form.append("prompt", generationPrompt);
    form.append("quality", this.quality);
    form.append("size", this.size);
    form.append("output_format", "png");
    await appendFileToForm(form, "image", exportManifest.cleanPngPath, "image/png", "layout-clean.png");

    for (const asset of productAssets) {
      if (asset.filePath) {
        await appendFileToForm(
          form,
          "image",
          path.resolve(this.rootDir, asset.filePath),
          asset.mimeType ?? "image/png",
          asset.name || `${asset.id}.png`,
        );
      }
    }

    const response = await openAiForm("/images/edits", form);
    const image = response.data?.[0];
    if (image?.b64_json) {
      await fs.writeFile(imagePath, Buffer.from(image.b64_json, "base64"));
    } else if (image?.url) {
      const imageResponse = await fetch(image.url);
      if (!imageResponse.ok) {
        throw new Error(`OpenAI image URL download failed: ${imageResponse.status}`);
      }
      await fs.writeFile(imagePath, Buffer.from(await imageResponse.arrayBuffer()));
    } else {
      throw new Error("OpenAI image response did not include b64_json or url output.");
    }

    return {
      imagePath,
      providerMode: this.mode,
      note: providerNote(this.id),
      outputFormat: response.output_format ?? "png",
      model: this.model,
      quality: response.quality ?? this.quality,
      size: response.size ?? this.size,
      usage: response.usage ?? null,
      layoutWorkflow: document.meta?.workflow ?? null,
    };
  }
}

export function createImageGenerationProvider({ provider = process.env.IMAGE_GENERATION_PROVIDER ?? "mock-local", rootDir } = {}) {
  if (provider === "openai") {
    return new OpenAIImageGenerationProvider({ rootDir });
  }
  if (provider === "mock" || provider === "mock-local") {
    return new MockImageGenerationProvider();
  }
  const error = new Error(`Unsupported image generation provider "${provider}"`);
  error.statusCode = 400;
  throw error;
}
