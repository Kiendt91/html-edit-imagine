import path from "node:path";
import { exportLayoutToFiles, hashDocument } from "./exporter.mjs";
import { assertValidLayoutDocument } from "./layout-validator.mjs";

function now() {
  return new Date().toISOString();
}

function createJobId(tier, documentHash) {
  return `${tier}-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}-${documentHash}`;
}

export class RenderQueue {
  constructor({ outputDir, rootDir }) {
    this.outputDir = outputDir;
    this.rootDir = rootDir;
    this.jobs = new Map();
    this.cache = new Map();
  }

  listJobs() {
    return [...this.jobs.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  getJob(jobId) {
    return this.jobs.get(jobId) ?? null;
  }

  createJob({ document, prompt = "", tier = "raster-preview", projectId = null }) {
    assertValidLayoutDocument(document);
    const documentHash = hashDocument(document, `${tier}\n${prompt}`);
    const cacheKey = `${tier}:${documentHash}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      const job = {
        ...cached,
        jobId: createJobId(tier, documentHash),
        tier,
        projectId,
        status: "ready",
        cached: true,
        createdAt: now(),
        updatedAt: now(),
      };
      this.jobs.set(job.jobId, job);
      return job;
    }

    const job = {
      jobId: createJobId(tier, documentHash),
      tier,
      projectId,
      documentHash,
      status: "queued",
      cached: false,
      createdAt: now(),
      updatedAt: now(),
      htmlPath: null,
      pngPath: null,
      manifestPath: null,
      promptPath: null,
      error: null,
    };

    this.jobs.set(job.jobId, job);
    this.#run(job, { document, prompt, cacheKey });
    return job;
  }

  async waitForJob(jobId) {
    const job = this.getJob(jobId);
    if (!job) {
      return null;
    }
    if (job.promise) {
      await job.promise;
    }
    return this.getJob(jobId);
  }

  #patchJob(job, patch) {
    Object.assign(job, patch, { updatedAt: now() });
    this.jobs.set(job.jobId, job);
  }

  #run(job, { document, prompt, cacheKey }) {
    const promise = (async () => {
      this.#patchJob(job, { status: "running" });
      try {
        const manifest = await exportLayoutToFiles({
          document,
          prompt,
          outputDir: this.outputDir,
          rootDir: this.rootDir,
          jobId: job.jobId,
          documentHash: job.documentHash,
        });

        const ready = {
          status: "ready",
          htmlPath: manifest.htmlPath,
          cleanHtmlPath: manifest.cleanHtmlPath,
          pngPath: manifest.pngPath,
          cleanPngPath: manifest.cleanPngPath,
          manifestPath: manifest.manifestPath,
          promptPath: manifest.promptPath,
          codexPrompt: manifest.codexPrompt,
          canvas: manifest.canvas,
          cleanExportVerification: manifest.cleanExportVerification,
        };
        this.#patchJob(job, ready);
        this.cache.set(cacheKey, {
          ...ready,
          documentHash: job.documentHash,
          htmlUrlPath: path.basename(path.dirname(manifest.htmlPath)),
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
