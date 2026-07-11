import fs from "node:fs/promises";
import path from "node:path";
import { exportLayoutToFiles, hashDocument } from "./exporter.mjs";
import { assertValidLayoutDocument } from "./layout-validator.mjs";
import { buildGenerationPrompt, createImageGenerationProvider, productAssetsFromDocument, sourceAssetsFromDocument } from "./image-generation-provider.mjs";

function now() {
  return new Date().toISOString();
}

function createJobId(documentHash) {
  return `generate-image-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}-${documentHash}`;
}

export class ImageGenerationQueue {
  constructor({ generatedDir, rootDir }) {
    this.generatedDir = generatedDir;
    this.rootDir = rootDir;
    this.jobs = new Map();
    this.defaultProvider = process.env.IMAGE_GENERATION_PROVIDER ?? "mock-local";
  }

  listJobs() {
    return [...this.jobs.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  getJob(jobId) {
    return this.jobs.get(jobId) ?? null;
  }

  createJob({ document, prompt = "", projectId = null, provider = this.defaultProvider }) {
    assertValidLayoutDocument(document);
    const providerAdapter = createImageGenerationProvider({ provider, rootDir: this.rootDir });
    const documentHash = hashDocument(document, `generate-image\n${providerAdapter.id}\n${prompt}`);
    const job = {
      jobId: createJobId(documentHash),
      provider: providerAdapter.id,
      projectId,
      documentHash,
      status: "queued",
      createdAt: now(),
      updatedAt: now(),
      htmlPath: null,
      cleanHtmlPath: null,
      referencePngPath: null,
      cleanReferencePngPath: null,
      imagePath: null,
      manifestPath: null,
      promptPath: null,
      generationPrompt: null,
      error: null,
    };

    this.jobs.set(job.jobId, job);
    this.#run(job, { document, prompt, providerAdapter });
    return job;
  }

  async waitForJob(jobId) {
    const job = this.getJob(jobId);
    if (!job) return null;
    if (job.promise) await job.promise;
    return this.getJob(jobId);
  }

  #patchJob(job, patch) {
    Object.assign(job, patch, { updatedAt: now() });
    this.jobs.set(job.jobId, job);
  }

  #run(job, { document, prompt, providerAdapter }) {
    const promise = (async () => {
      try {
        this.#patchJob(job, { status: "exporting-reference" });
        const exportManifest = await exportLayoutToFiles({
          document,
          prompt,
          outputDir: this.generatedDir,
          rootDir: this.rootDir,
          jobId: job.jobId,
          documentHash: job.documentHash,
        });

        this.#patchJob(job, {
          htmlPath: exportManifest.htmlPath,
          cleanHtmlPath: exportManifest.cleanHtmlPath,
          referencePngPath: exportManifest.pngPath,
          cleanReferencePngPath: exportManifest.cleanPngPath,
        });

        this.#patchJob(job, { status: "generating" });
        const jobDir = path.join(this.generatedDir, job.jobId);
        await fs.mkdir(jobDir, { recursive: true });
        const imagePath = path.join(jobDir, "generated-image.png");
        const productAssets = productAssetsFromDocument(document);
        const sourceAssets = sourceAssetsFromDocument(document);
        const generationPromptBase = buildGenerationPrompt({
          prompt,
          document,
          cleanPngPath: exportManifest.cleanPngPath,
          productAssets,
        });
        const generationPrompt = [
          generationPromptBase,
          "",
          providerAdapter.id === "mock-local"
            ? "Provider note: mock-local copies the clean reference to prove the pipeline before enabling a real image model."
            : `Provider note: ${providerAdapter.id} will use the clean reference and subject assets as image inputs.`,
        ].join("\n");
        const promptPath = path.join(jobDir, "generation-prompt.md");
        const manifestPath = path.join(jobDir, "generation-manifest.json");
        await fs.writeFile(promptPath, generationPrompt, "utf8");
        const providerResult = await providerAdapter.generate({
          document,
          prompt,
          exportManifest,
          imagePath,
          generationPrompt,
          productAssets,
          sourceAssets,
        });

        const generationManifest = {
          jobId: job.jobId,
          provider: job.provider,
          providerMode: providerResult.providerMode,
          providerModel: providerResult.model ?? null,
          status: "ready",
          createdAt: job.createdAt,
          updatedAt: now(),
          documentHash: job.documentHash,
          prompt,
          generationPrompt,
          referencePngPath: exportManifest.pngPath,
          cleanReferencePngPath: exportManifest.cleanPngPath,
          cleanExportVerification: exportManifest.cleanExportVerification,
          productAssets,
          sourceAssets,
          layoutContract: {
            workflow: document.meta?.workflow ?? null,
            sourceAssetId: document.meta?.sourceAssetId ?? null,
            primaryProductObjectIds: document.objects
              .filter((object) => object.type === "product-image" || object.role === "product" || object.promptRole === "primary-product")
              .map((object) => object.id),
          },
          imagePath: providerResult.imagePath,
          outputFormat: providerResult.outputFormat ?? "png",
          usage: providerResult.usage ?? null,
          note: providerResult.note,
        };
        await fs.writeFile(manifestPath, JSON.stringify(generationManifest, null, 2), "utf8");

        this.#patchJob(job, {
          status: "ready",
          imagePath: providerResult.imagePath,
          manifestPath,
          promptPath,
          generationPrompt,
          providerMode: providerResult.providerMode,
          providerModel: providerResult.model ?? null,
        });
      } catch (error) {
        this.#patchJob(job, {
          status: "failed",
          error: error.message,
        });
      } finally {
        delete job.promise;
      }
    })();
    job.promise = promise;
  }
}
