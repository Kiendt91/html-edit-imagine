import type { AssetRef, GenerationJob, LayoutDocument, PatchOperation, RenderJob } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed: ${response.status}`);
  }
  return data as T;
}

export async function getSample(): Promise<{ document: LayoutDocument; prompt: string }> {
  return request("/api/sample");
}

export async function getProviders(): Promise<{
  visionLayout: { active: string; configured: string; available: string[]; openAiReady: boolean; model: string | null };
  imageGeneration: { activeDefault: string; available: string[]; openAiReady: boolean; model: string | null };
}> {
  return request("/api/providers");
}

export async function planLayout(input: { idea: string; style?: string; canvas?: { width: number; height: number } }): Promise<{ document: LayoutDocument; prompt: string }> {
  return request("/api/plan-layout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function patchLayout(document: LayoutDocument, ops: PatchOperation[]): Promise<{ document: LayoutDocument; appliedOps: PatchOperation[] }> {
  return request("/api/patch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ document, ops }),
  });
}

export async function planLayoutPatch(input: { document: LayoutDocument; instruction: string; selectedObjectIds?: string[] }): Promise<{
  provider: string;
  instruction: string;
  ops: PatchOperation[];
  document: LayoutDocument;
  warnings: string[];
  confidence: number;
}> {
  return request("/api/layout-patches/from-instruction", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function exportPng(document: LayoutDocument, prompt: string): Promise<{
  jobId: string;
  htmlUrl: string;
  pngUrl: string;
  cleanPngUrl?: string;
  codexPrompt: string;
}> {
  return request("/api/export/png", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ document, prompt }),
  });
}

export async function createGenerationJob(document: LayoutDocument, prompt: string): Promise<GenerationJob> {
  return request("/api/generate-image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ document, prompt, wait: true }),
  });
}

export async function createRenderJob(document: LayoutDocument, prompt: string): Promise<RenderJob> {
  return request("/api/render-jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ document, prompt, tier: "raster-preview" }),
  });
}

export async function saveProject(input: { title: string; prompt: string; document: LayoutDocument }): Promise<{ project: { id: string; title: string } }> {
  return request("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateProject(id: string, input: { title: string; prompt: string; document: LayoutDocument }): Promise<{ project: { id: string; title: string; prompt: string; document: LayoutDocument } }> {
  return request(`/api/projects/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export type ProjectSummary = {
  id: string;
  title: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  objectCount: number;
  canvas: { width: number; height: number; unit: "px" };
};

export async function listProjects(): Promise<{ projects: ProjectSummary[] }> {
  return request("/api/projects");
}

export async function loadProject(id: string): Promise<{ project: { id: string; title: string; prompt: string; document: LayoutDocument } }> {
  return request(`/api/projects/${encodeURIComponent(id)}`);
}

export async function deleteProject(id: string): Promise<{ project: { id: string; title: string } }> {
  return request(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function listAssets(): Promise<{ assets: AssetRef[] }> {
  return request("/api/assets");
}

export async function deleteAsset(id: string): Promise<{ asset: AssetRef }> {
  return request(`/api/assets/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function uploadAsset(input: { name: string; kind: AssetRef["kind"]; dataUrl: string }): Promise<{ asset: AssetRef }> {
  return request("/api/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function placeProduct(input: { document: LayoutDocument; assetId: string; targetObjectId?: string }): Promise<{ document: LayoutDocument; appliedOps: PatchOperation[] }> {
  return request("/api/place-product", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function createProjectFromImage(input: { assetId: string; title?: string; prompt?: string; underlayOpacity?: number }): Promise<{
  project: { id: string; title: string; prompt: string; document: LayoutDocument };
  analysis: { provider: string; model?: string; confidence: number; warnings: string[] };
}> {
  return request("/api/projects/from-image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function analyzeImageLayout(input: { assetId: string }): Promise<{ provider: string; model?: string; document: LayoutDocument; confidence: number; warnings: string[] }> {
  return request("/api/image-layout/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
