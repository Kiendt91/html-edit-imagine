import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { normalizeLayoutDocument } from "./layout-normalizer.mjs";
import { assertValidLayoutDocument } from "./layout-validator.mjs";
import { applyLayoutPatch } from "./layout-commands.mjs";

function slugify(value, fallback = "project") {
  const slug = String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  return slug || fallback;
}

function now() {
  return new Date().toISOString();
}

export class ProjectStore {
  constructor({ projectsDir }) {
    this.projectsDir = projectsDir;
  }

  async ensureReady() {
    await fs.mkdir(this.projectsDir, { recursive: true });
  }

  projectPath(id) {
    if (!/^[a-z0-9-]+$/i.test(id)) {
      const error = new Error("Invalid project id");
      error.statusCode = 400;
      throw error;
    }
    return path.join(this.projectsDir, `${id}.json`);
  }

  async listProjects() {
    await this.ensureReady();
    const entries = await fs.readdir(this.projectsDir, { withFileTypes: true });
    const projects = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const record = JSON.parse(await fs.readFile(path.join(this.projectsDir, entry.name), "utf8"));
      projects.push({
        id: record.id,
        title: record.title,
        prompt: record.prompt,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        objectCount: record.document?.objects?.length ?? 0,
        canvas: record.document?.canvas,
      });
    }
    return projects.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async getProject(id) {
    try {
      return JSON.parse(await fs.readFile(this.projectPath(id), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        const notFound = new Error(`Project "${id}" was not found`);
        notFound.statusCode = 404;
        throw notFound;
      }
      throw error;
    }
  }

  async saveProject({ id, title, prompt = "", document, renderHistory = [] }) {
    await this.ensureReady();
    const normalized = normalizeLayoutDocument(document);
    assertValidLayoutDocument(normalized);
    const existing = id ? await this.getProject(id).catch(() => null) : null;
    const timestamp = now();
    const projectId = id ?? `${slugify(title ?? normalized.meta?.title)}-${crypto.randomUUID().slice(0, 8)}`;
    const record = {
      id: projectId,
      title: title ?? normalized.meta?.title ?? "Untitled Layout",
      prompt,
      document: normalized,
      renderHistory,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    await fs.writeFile(this.projectPath(projectId), JSON.stringify(record, null, 2), "utf8");
    return record;
  }

  async patchProject(id, ops) {
    const project = await this.getProject(id);
    const { document, appliedOps } = applyLayoutPatch(project.document, ops);
    const saved = await this.saveProject({
      id,
      title: project.title,
      prompt: project.prompt,
      document,
      renderHistory: project.renderHistory ?? [],
    });
    return {
      project: saved,
      appliedOps,
    };
  }

  async appendRender(id, renderRecord) {
    const project = await this.getProject(id);
    const renderHistory = [renderRecord, ...(project.renderHistory ?? [])].slice(0, 30);
    return this.saveProject({
      id,
      title: project.title,
      prompt: project.prompt,
      document: project.document,
      renderHistory,
    });
  }

  async deleteProject(id) {
    const project = await this.getProject(id);
    await fs.rm(this.projectPath(id), { force: true });
    return project;
  }
}
