import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BadgePlus,
  Box,
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  EyeOff,
  Grid3X3,
  Image as ImageIcon,
  ImageUp,
  Layers,
  Lock,
  MousePointer2,
  RefreshCcw,
  Save,
  Sparkles,
  Type,
  Unlock,
  Undo2,
  Redo2,
  Upload,
  Wand2,
} from "lucide-react";
import { analyzeImageLayout, createGenerationJob, createProjectFromImage, createRenderJob, deleteAsset, deleteProject, exportPng, getProviders, getSample, listAssets, listProjects, loadProject, patchLayout, placeProduct, planLayout, planLayoutPatch, saveProject, updateProject, uploadAsset, type ProjectSummary } from "./api";
import { AssetLibrary } from "./editor/AssetLibrary";
import { OutputPanel } from "./editor/OutputPanel";
import { ProjectBrowser } from "./editor/ProjectBrowser";
import { fillToCss, objectStyle, ProductPlaceholder } from "./layoutRender";
import type { AssetRef, GenerationJob, LayoutDocument, LayoutObject, PatchOperation, PatchOperationSummary, RenderJob } from "./types";
import "./styles.css";

type DragState =
  | {
      mode: "move" | "resize";
      objectId: string;
      startX: number;
      startY: number;
      original: LayoutObject;
      handle?: "right" | "bottom" | "corner";
    }
  | null;

type LayoutPatchPlan = {
  provider: string;
  model?: string;
  instruction: string;
  ops: PatchOperation[];
  document: LayoutDocument;
  opSummaries: PatchOperationSummary[];
  warnings: string[];
  confidence: number;
};

const zoomOptions = [0.35, 0.5, 0.65, 0.8, 1];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function selectedObject(document: LayoutDocument | null, selectedId: string | null) {
  return document?.objects.find((object) => object.id === selectedId) ?? null;
}

function sortLayers(document: LayoutDocument) {
  return [...document.objects].sort((a, b) => b.zIndex - a.zIndex);
}

function objectIcon(type: string) {
  if (type === "text") return <Type size={15} />;
  if (type.includes("image") || type === "logo" || type === "icon") return <ImageIcon size={15} />;
  if (type === "badge") return <BadgePlus size={15} />;
  return <Box size={15} />;
}

function fallbackPatchSummary(op: PatchOperation, index: number): PatchOperationSummary {
  if (op.type === "updateObject") {
    return {
      index,
      type: op.type,
      objectId: op.id,
      objectName: op.id,
      label: `Update ${op.id}`,
      details: Object.entries(op.patch).map(([key, value]) => ({ key, from: "current", to: String(value) })),
    };
  }
  if (op.type === "addObject") {
    return {
      index,
      type: op.type,
      objectId: op.object.id ?? null,
      objectName: op.object.name ?? op.object.id ?? "New object",
      label: `Add ${op.object.name ?? op.object.id ?? "new object"}`,
      details: [],
    };
  }
  if (op.type === "setCanvas") {
    return {
      index,
      type: op.type,
      objectId: null,
      objectName: "Canvas",
      label: "Update canvas",
      details: Object.entries(op.canvas).map(([key, value]) => ({ key, from: "current", to: String(value) })),
    };
  }
  const objectId = "id" in op ? op.id : op.asset.id;
  return {
    index,
    type: op.type,
    objectId,
    objectName: objectId,
    label: `${op.type} ${objectId}`,
    details: [],
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function cloneDocument(document: LayoutDocument) {
  return JSON.parse(JSON.stringify(document)) as LayoutDocument;
}

function App() {
  const [document, setDocument] = useState<LayoutDocument | null>(null);
  const [prompt, setPrompt] = useState("");
  const [idea, setIdea] = useState("Luxury perfume ad with centered bottle, top headline, logo, and limited-drop badge");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.5);
  const [status, setStatus] = useState("Loading sample...");
  const [renderJob, setRenderJob] = useState<RenderJob | null>(null);
  const [generationJob, setGenerationJob] = useState<GenerationJob | null>(null);
  const [exportedPng, setExportedPng] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [codexPrompt, setCodexPrompt] = useState("");
  const [drag, setDrag] = useState<DragState>(null);
  const [providerSummary, setProviderSummary] = useState("Providers loading...");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [assets, setAssets] = useState<AssetRef[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [historyPast, setHistoryPast] = useState<LayoutDocument[]>([]);
  const [historyFuture, setHistoryFuture] = useState<LayoutDocument[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridSize, setGridSize] = useState(20);
  const [patchInstruction, setPatchInstruction] = useState("Move the product up and make the headline bigger");
  const [patchPlan, setPatchPlan] = useState<LayoutPatchPlan | null>(null);
  const [selectedPatchIndexes, setSelectedPatchIndexes] = useState<number[]>([]);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const selected = selectedObject(document, selectedId);

  const rememberDocument = useCallback((snapshot: LayoutDocument | null) => {
    if (!snapshot) return;
    setHistoryPast((past) => [...past.slice(-39), cloneDocument(snapshot)]);
    setHistoryFuture([]);
  }, []);

  const resetOutputs = useCallback(() => {
    setExportedPng(null);
    setGeneratedImage(null);
    setRenderJob(null);
    setGenerationJob(null);
    setCodexPrompt("");
  }, []);

  const refreshProjects = useCallback(async () => {
    const result = await listProjects();
    setProjects(result.projects);
  }, []);

  const refreshAssets = useCallback(async () => {
    const result = await listAssets();
    setAssets(result.assets);
  }, []);

  const snapValue = useCallback(
    (value: number) => {
      if (!snapEnabled) return Math.round(value);
      return Math.round(value / gridSize) * gridSize;
    },
    [gridSize, snapEnabled],
  );

  useEffect(() => {
    getProviders()
      .then((providers) => {
        setProviderSummary(`Vision: ${providers.visionLayout.active}. Patch: ${providers.layoutPatch.active}. Generation: ${providers.imageGeneration.activeDefault}.`);
      })
      .catch(() => setProviderSummary("Providers unavailable."));
    getSample()
      .then((sample) => {
        setDocument(sample.document);
        setPrompt(sample.prompt);
        setSelectedId(sample.document.objects.find((object) => object.role === "product")?.id ?? sample.document.objects[0]?.id ?? null);
        setStatus("Sample loaded.");
      })
      .catch((error) => setStatus(error.message));
    void refreshProjects();
    void refreshAssets();
  }, [refreshAssets, refreshProjects]);

  const commitOps = useCallback(
    async (ops: PatchOperation[], optimisticDocument?: LayoutDocument, historySnapshot?: LayoutDocument) => {
      if (!document) return;
      const snapshot = historySnapshot ?? document;
      rememberDocument(snapshot);
      setPatchPlan(null);
      setSelectedPatchIndexes([]);
      if (optimisticDocument) {
        setDocument(optimisticDocument);
      }
      try {
        const patched = await patchLayout(optimisticDocument ?? document, ops);
        setDocument(patched.document);
        setStatus("Layout updated.");
      } catch (error) {
        setDocument(snapshot);
        setStatus(error instanceof Error ? error.message : "Patch failed.");
      }
    },
    [document, rememberDocument],
  );

  const updateObjectLocal = useCallback((id: string, patch: Partial<LayoutObject>) => {
    setDocument((current) => {
      if (!current) return current;
      return {
        ...current,
        objects: current.objects.map((object) => (object.id === id ? { ...object, ...patch } : object)),
      };
    });
  }, []);

  const updateSelected = useCallback(
    (patch: Partial<LayoutObject>) => {
      if (!selected || !document) return;
      if (selected.locked) {
        const safeKeys = new Set(["locked", "visible", "opacity", "name"]);
        const unsafeKey = Object.keys(patch).find((key) => !safeKeys.has(key));
        if (unsafeKey) {
          setStatus("Unlock this object before changing geometry or content.");
          return;
        }
      }
      const optimistic = {
        ...document,
        objects: document.objects.map((object) => (object.id === selected.id ? { ...object, ...patch } : object)),
      };
      void commitOps([{ type: "updateObject", id: selected.id, patch }], optimistic);
    },
    [commitOps, document, selected],
  );

  const handlePointerDown = (event: React.PointerEvent, object: LayoutObject, mode: "move" | "resize", handle?: "right" | "bottom" | "corner") => {
    if (object.locked) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(object.id);
    setDrag({
      mode,
      objectId: object.id,
      startX: event.clientX,
      startY: event.clientY,
      original: { ...object },
      handle,
    });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag || !document) return;
    const dx = (event.clientX - drag.startX) / zoom;
    const dy = (event.clientY - drag.startY) / zoom;
    const original = drag.original;
    if (drag.mode === "move") {
      updateObjectLocal(drag.objectId, {
        x: clamp(snapValue(original.x + dx), 0, document.canvas.width - original.width),
        y: clamp(snapValue(original.y + dy), 0, document.canvas.height - original.height),
      });
    } else {
      const patch: Partial<LayoutObject> = {};
      if (drag.handle === "right" || drag.handle === "corner") {
        patch.width = clamp(snapValue(original.width + dx), 24, document.canvas.width - original.x);
      }
      if (drag.handle === "bottom" || drag.handle === "corner") {
        patch.height = clamp(snapValue(original.height + dy), 24, document.canvas.height - original.y);
      }
      updateObjectLocal(drag.objectId, patch);
    }
  };

  const onPointerUp = () => {
    if (!drag || !document) return;
    const current = document.objects.find((object) => object.id === drag.objectId);
    setDrag(null);
    if (!current) return;
    const patch =
      drag.mode === "move"
        ? { x: current.x, y: current.y }
        : { width: current.width, height: current.height };
    const beforeDrag = {
      ...document,
      objects: document.objects.map((object) => (object.id === drag.objectId ? drag.original : object)),
    };
    void commitOps([{ type: "updateObject", id: current.id, patch }], document, beforeDrag);
  };

  const undo = useCallback(() => {
    if (!document || historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    setHistoryPast((past) => past.slice(0, -1));
    setHistoryFuture((future) => [cloneDocument(document), ...future.slice(0, 39)]);
    setDocument(previous);
    setPatchPlan(null);
    setSelectedId((id) => previous.objects.find((object) => object.id === id)?.id ?? previous.objects[0]?.id ?? null);
    setStatus("Undo.");
  }, [document, historyPast]);

  const redo = useCallback(() => {
    if (!document || historyFuture.length === 0) return;
    const next = historyFuture[0];
    setHistoryFuture((future) => future.slice(1));
    setHistoryPast((past) => [...past.slice(-39), cloneDocument(document)]);
    setDocument(next);
    setPatchPlan(null);
    setSelectedId((id) => next.objects.find((object) => object.id === id)?.id ?? next.objects[0]?.id ?? null);
    setStatus("Redo.");
  }, [document, historyFuture]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  const updateObjectById = useCallback(
    async (id: string, patch: Partial<LayoutObject>) => {
      if (!document) return;
      const optimistic = {
        ...document,
        objects: document.objects.map((object) => (object.id === id ? { ...object, ...patch } : object)),
      };
      await commitOps([{ type: "updateObject", id, patch }], optimistic);
    },
    [commitOps, document],
  );

  const reorderLayer = useCallback(
    async (id: string, direction: "up" | "down") => {
      if (!document) return;
      const object = document.objects.find((item) => item.id === id);
      if (!object) return;
      const sorted = [...document.objects].sort((a, b) => a.zIndex - b.zIndex);
      const index = sorted.findIndex((item) => item.id === id);
      const target = direction === "up" ? sorted[index + 1] : sorted[index - 1];
      if (!target) return;
      const optimistic = {
        ...document,
        objects: document.objects.map((item) => {
          if (item.id === object.id) return { ...item, zIndex: target.zIndex };
          if (item.id === target.id) return { ...item, zIndex: object.zIndex };
          return item;
        }),
      };
      await commitOps(
        [
          { type: "reorderObject", id: object.id, zIndex: target.zIndex },
          { type: "reorderObject", id: target.id, zIndex: object.zIndex },
        ],
        optimistic,
      );
    },
    [commitOps, document],
  );

  const addText = async () => {
    if (!document) return;
    const zIndex = Math.max(...document.objects.map((object) => object.zIndex), 0) + 10;
    await commitOps([
      {
        type: "addObject",
        object: {
          name: "New Text",
          type: "text",
          x: 120,
          y: 120,
          width: 420,
          height: 92,
          rotation: 0,
          opacity: 1,
          zIndex,
          content: "New copy",
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: 42,
          fontWeight: 700,
          color: "#201b16",
          align: "center",
        },
      },
    ]);
  };

  const deleteSelected = async () => {
    if (!selected || !document) return;
    if (selected.locked) {
      setStatus("Unlock this object before deleting it.");
      return;
    }
    const next = {
      ...document,
      objects: document.objects.filter((object) => object.id !== selected.id),
    };
    setSelectedId(next.objects[0]?.id ?? null);
    await commitOps([{ type: "removeObject", id: selected.id }], next);
  };

  const useExistingAsset = async (asset: AssetRef) => {
    if (!document) return;
    if (asset.kind === "source-layout") {
      setStatus("Source layout assets are used for extraction, not product placement.");
      return;
    }
    const target =
      selected && (selected.type === "product-image" || selected.role === "product")
        ? selected
        : document.objects.find((object) => object.type === "product-image" || object.role === "product");
    if (!target) {
      setStatus("No product slot is available for this asset.");
      return;
    }
    if (target.locked) {
      setStatus("Unlock the target product slot before placing an asset.");
      return;
    }
    rememberDocument(document);
    setStatus("Placing existing asset...");
    try {
      const placed = await placeProduct({
        document,
        assetId: asset.id,
        targetObjectId: target.id,
      });
      setDocument(placed.document);
      setSelectedId(target.id);
      resetOutputs();
      setStatus(`Placed asset: ${asset.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Place asset failed.");
    }
  };

  const removeAssetFromLibrary = async (asset: AssetRef) => {
    if (document?.assets.some((item) => item.id === asset.id) || document?.objects.some((object) => object.assetId === asset.id)) {
      setStatus("This asset is used by the current layout. Remove it from the layout before deleting it.");
      return;
    }
    try {
      await deleteAsset(asset.id);
      await refreshAssets();
      setStatus(`Deleted asset ${asset.name}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Delete asset failed.");
    }
  };

  const runPlanner = async () => {
    setStatus("Planning layout...");
    try {
      const planned = await planLayout({ idea, style: "premium editorial advertising", canvas: document?.canvas });
      rememberDocument(document);
      setDocument(planned.document);
      setPrompt(planned.prompt);
      setSelectedId(planned.document.objects.find((object) => object.role === "product")?.id ?? planned.document.objects[0]?.id ?? null);
      setCurrentProjectId(null);
      setHistoryFuture([]);
      setExportedPng(null);
      setGeneratedImage(null);
      setRenderJob(null);
      setGenerationJob(null);
      setStatus("Planner created a layout.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Planner failed.");
    }
  };

  const saveCurrentProject = async () => {
    if (!document) return;
    setStatus("Saving project...");
    try {
      const input = { title: document.meta?.title ?? "Untitled Layout", prompt, document };
      const result = currentProjectId ? await updateProject(currentProjectId, input) : await saveProject(input);
      setCurrentProjectId(result.project.id);
      await refreshProjects();
      setStatus(currentProjectId ? `Updated project ${result.project.id}.` : `Saved project ${result.project.id}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed.");
    }
  };

  const duplicateSavedProject = async (id: string) => {
    try {
      const source = await loadProject(id);
      const duplicateTitle = `${source.project.title} Copy`;
      const duplicateDocument = {
        ...cloneDocument(source.project.document),
        meta: {
          ...(source.project.document.meta ?? {}),
          title: duplicateTitle,
        },
      };
      const result = await saveProject({
        title: duplicateTitle,
        prompt: source.project.prompt ?? "",
        document: duplicateDocument,
      });
      setDocument(duplicateDocument);
      setPrompt(source.project.prompt ?? "");
      setCurrentProjectId(result.project.id);
      setSelectedId(duplicateDocument.objects.find((object) => object.role === "product")?.id ?? duplicateDocument.objects[0]?.id ?? null);
      setHistoryPast([]);
      setHistoryFuture([]);
      resetOutputs();
      await refreshProjects();
      setStatus(`Duplicated project ${result.project.id}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Duplicate project failed.");
    }
  };

  const loadSavedProject = async (id: string) => {
    try {
      const result = await loadProject(id);
      setDocument(result.project.document);
      setPrompt(result.project.prompt ?? "");
      setCurrentProjectId(result.project.id);
      setSelectedId(result.project.document.objects.find((object) => object.role === "product")?.id ?? result.project.document.objects[0]?.id ?? null);
      setHistoryPast([]);
      setHistoryFuture([]);
      setPatchPlan(null);
      resetOutputs();
      setStatus(`Loaded project ${result.project.title}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Load project failed.");
    }
  };

  const removeSavedProject = async (id: string) => {
    try {
      await deleteProject(id);
      if (currentProjectId === id) setCurrentProjectId(null);
      await refreshProjects();
      setStatus(`Deleted project ${id}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Delete project failed.");
    }
  };

  const exportCurrentPng = async () => {
    if (!document) return;
    setStatus("Exporting PNG...");
    try {
      const result = await exportPng(document, prompt);
      setExportedPng(result.cleanPngUrl ?? result.pngUrl);
      setCodexPrompt(result.codexPrompt);
      setStatus(`Export ready: ${result.jobId}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed.");
    }
  };

  const queueRender = async () => {
    if (!document) return;
    setStatus("Queueing render job...");
    setExportedPng(null);
    setGeneratedImage(null);
    try {
      const job = await createRenderJob(document, prompt);
      setRenderJob(job);
      const events = new EventSource(`/api/render-jobs/${job.jobId}/events`);
      events.addEventListener("render-job", (event) => {
        const nextJob = JSON.parse((event as MessageEvent).data) as RenderJob;
        setRenderJob(nextJob);
        setStatus(`Render job ${nextJob.status}.`);
        if (nextJob.status === "ready" || nextJob.status === "failed") {
          events.close();
          if (nextJob.cleanPngUrl || nextJob.pngUrl) setExportedPng(nextJob.cleanPngUrl ?? nextJob.pngUrl);
          if (nextJob.codexPrompt) setCodexPrompt(nextJob.codexPrompt);
        }
      });
      events.onerror = () => {
        events.close();
      };
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Render queue failed.");
    }
  };

  const generateFinalImage = async () => {
    if (!document) return;
    setStatus("Generating final image...");
    setGenerationJob(null);
    setGeneratedImage(null);
    try {
      const job = await createGenerationJob(document, prompt);
      setGenerationJob(job);
      if (job.cleanReferenceUrl) setExportedPng(job.cleanReferenceUrl);
      if (job.imageUrl) setGeneratedImage(job.imageUrl);
      if (job.generationPrompt) setCodexPrompt(job.generationPrompt);
      setStatus(job.status === "ready" ? `Generated image ready: ${job.jobId}` : `Generation job ${job.status}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Generate failed.");
    }
  };

  const uploadProductForSelected = async (file: File) => {
    if (!document || !selected) return;
    if (selected.type !== "product-image" && selected.role !== "product") {
      setStatus("Select a product slot before placing a product asset.");
      return;
    }
    setStatus("Uploading product image...");
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const { asset } = await uploadAsset({
        name: file.name,
        kind: "product",
        dataUrl,
      });
      const placed = await placeProduct({
        document,
        assetId: asset.id,
        targetObjectId: selected.id,
      });
      rememberDocument(document);
      setDocument(placed.document);
      setSelectedId(selected.id);
      resetOutputs();
      await refreshAssets();
      setStatus(`Product asset placed: ${asset.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Product upload failed.");
    }
  };

  const importSourceImage = async (file: File) => {
    setStatus("Importing source layout image...");
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const { asset } = await uploadAsset({
        name: file.name,
        kind: "source-layout",
        dataUrl,
      });
      const result = await createProjectFromImage({
        assetId: asset.id,
        title: `${file.name.replace(/\.[^.]+$/, "")} Layout`,
      });
      rememberDocument(document);
      setDocument(result.project.document);
      setPrompt(result.project.prompt);
      setCurrentProjectId(result.project.id);
      setHistoryFuture([]);
      resetOutputs();
      await refreshAssets();
      await refreshProjects();
      setSelectedId(result.project.document.objects.find((object) => object.id === "product-zone")?.id ?? "source-underlay");
      setStatus(`Source image converted by ${result.analysis.provider}. ${result.analysis.warnings[0] ?? ""}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Source image import failed.");
    }
  };

  const analyzeCurrentSource = async () => {
    if (!document?.meta?.sourceAssetId || typeof document.meta.sourceAssetId !== "string") {
      setStatus("No source image asset found on this project.");
      return;
    }
    try {
      const result = await analyzeImageLayout({ assetId: document.meta.sourceAssetId });
      rememberDocument(document);
      setDocument(result.document);
      setSelectedId(result.document.objects.find((object) => object.id === "product-zone")?.id ?? result.document.objects[0]?.id ?? null);
      resetOutputs();
      setStatus(`Extracted layout with ${result.provider}: ${Math.round(result.confidence * 100)}% confidence. ${result.warnings[0] ?? ""}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Image analysis failed.");
    }
  };

  const togglePatchSelection = useCallback((index: number) => {
    setSelectedPatchIndexes((current) => {
      if (current.includes(index)) return current.filter((item) => item !== index);
      return [...current, index].sort((a, b) => a - b);
    });
  }, []);

  const previewInstructionPatch = async () => {
    if (!document || patchInstruction.trim().length === 0) return;
    setStatus("Planning layout patch...");
    try {
      const plan = await planLayoutPatch({
        document,
        instruction: patchInstruction,
        selectedObjectIds: selectedId ? [selectedId] : [],
      });
      setPatchPlan(plan);
      setSelectedPatchIndexes(plan.ops.map((_, index) => index));
      setStatus(`Patch preview ready: ${plan.ops.length} ops from ${plan.provider}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Patch assistant failed.");
    }
  };

  const applyInstructionPatch = async () => {
    if (!document || !patchPlan || patchPlan.ops.length === 0) return;
    const selectedOps = patchPlan.ops.filter((_, index) => selectedPatchIndexes.includes(index));
    if (selectedOps.length === 0) {
      setStatus("Choose at least one patch operation to apply.");
      return;
    }
    const snapshot = document;
    const useFullPreview = selectedOps.length === patchPlan.ops.length;
    rememberDocument(snapshot);
    if (useFullPreview) {
      setDocument(patchPlan.document);
    }
    setPatchPlan(null);
    setSelectedPatchIndexes([]);
    resetOutputs();
    try {
      const patched = await patchLayout(snapshot, selectedOps);
      setDocument(patched.document);
      setSelectedId((id) => patched.document.objects.find((object) => object.id === id)?.id ?? patched.document.objects[0]?.id ?? null);
      setStatus(`Instruction patch applied: ${selectedOps.length} ops.`);
    } catch (error) {
      setDocument(snapshot);
      setStatus(error instanceof Error ? error.message : "Apply patch failed.");
    }
  };

  const layers = useMemo(() => (document ? sortLayers(document) : []), [document]);
  const selectedPatchCount = patchPlan ? patchPlan.ops.filter((_, index) => selectedPatchIndexes.includes(index)).length : 0;
  const patchSummaries = patchPlan?.opSummaries?.length ? patchPlan.opSummaries : patchPlan?.ops.map(fallbackPatchSummary) ?? [];

  if (!document) {
    return <div className="loadingScreen">{status}</div>;
  }

  return (
    <div className="appShell">
      <header className="topBar">
        <div className="brandBlock">
          <div className="brandMark">
            <Sparkles size={18} />
          </div>
          <div>
            <strong>AI Layout Studio</strong>
            <span>{document.meta?.title ?? "Untitled Layout"}</span>
          </div>
        </div>
        <div className="topActions">
          <button onClick={undo} disabled={historyPast.length === 0} title="Undo">
            <Undo2 size={16} />
            Undo
          </button>
          <button onClick={redo} disabled={historyFuture.length === 0} title="Redo">
            <Redo2 size={16} />
            Redo
          </button>
          <button onClick={runPlanner} title="Plan layout from idea">
            <Wand2 size={16} />
            Plan
          </button>
          <button onClick={addText} title="Add text object">
            <Type size={16} />
            Text
          </button>
          <button onClick={saveCurrentProject} title="Save project">
            <Save size={16} />
            Save
          </button>
          <button onClick={queueRender} title="Queue render preview">
            <RefreshCcw size={16} />
            Render
          </button>
          <button className="primary" onClick={exportCurrentPng} title="Export PNG">
            <Download size={16} />
            Export
          </button>
          <button className="accent" onClick={generateFinalImage} title="Generate final image">
            <Sparkles size={16} />
            Generate
          </button>
        </div>
      </header>

      <main className="editorGrid">
        <aside className="panel layersPanel">
          <div className="panelTitle">
            <Layers size={16} />
            <span>Layers</span>
          </div>
          <div className="ideaBlock">
            <label>Idea</label>
            <textarea value={idea} onChange={(event) => setIdea(event.target.value)} />
          </div>
          <div className="patchAssistant">
            <div className="assetUploadTitle">
              <Wand2 size={16} />
              <span>Patch Assistant</span>
            </div>
            <textarea value={patchInstruction} onChange={(event) => setPatchInstruction(event.target.value)} placeholder="Move the product up and make the headline bigger" />
            <div className="patchActions">
              <button onClick={() => void previewInstructionPatch()}>Preview</button>
              <button onClick={() => void applyInstructionPatch()} disabled={!patchPlan || patchPlan.ops.length === 0 || selectedPatchCount === 0}>
                Apply {patchPlan && patchPlan.ops.length > 0 ? selectedPatchCount : ""}
              </button>
            </div>
            {patchPlan && (
              <div className="patchPreview">
                <div className="reviewStats">
                  <span>Provider</span>
                  <strong>{patchPlan.provider}</strong>
                  <span>Confidence</span>
                  <strong>{Math.round(patchPlan.confidence * 100)}%</strong>
                  <span>Ops</span>
                  <strong>{patchPlan.ops.length}</strong>
                </div>
                {patchPlan.warnings.length > 0 && <p>{patchPlan.warnings.join(" ")}</p>}
                <ol className="patchSummaryList">
                  {patchSummaries.map((summary) => {
                    const checked = selectedPatchIndexes.includes(summary.index);
                    const details = summary.details.map((detail) => `${detail.key}: ${detail.from} -> ${detail.to}`).join("; ");
                    return (
                      <li key={summary.index} className={checked ? "patchSummaryItem" : "patchSummaryItem skipped"}>
                        <label>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePatchSelection(summary.index)}
                            aria-label={`Apply patch operation ${summary.index + 1}`}
                          />
                          <span>
                            <strong>{summary.label}</strong>
                            {details && <em>{details}</em>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </div>
          <div className="sourceImportBox">
            <div className="assetUploadTitle">
              <ImageUp size={16} />
              <span>Import layout image</span>
            </div>
            <div className="providerSummary">{providerSummary}</div>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void importSourceImage(file);
                event.currentTarget.value = "";
              }}
            />
            <button onClick={analyzeCurrentSource} title="Extract editable layout blocks from the current source image">
              Extract Layout
            </button>
          </div>
          <ProjectBrowser
            projects={projects}
            currentProjectId={currentProjectId}
            onRefresh={() => void refreshProjects()}
            onLoad={(id) => void loadSavedProject(id)}
            onDuplicate={(id) => void duplicateSavedProject(id)}
            onDelete={(id) => void removeSavedProject(id)}
          />
          <ol className="layerList">
            {layers.map((object) => (
              <li key={object.id} className={object.id === selectedId ? "selectedLayer" : ""} onClick={() => setSelectedId(object.id)}>
                <span className="layerIcon">{objectIcon(object.type)}</span>
                <span className="layerName">{object.name}</span>
                <span className="layerType">{object.locked ? "locked " : ""}{object.type}</span>
                <div className="layerControls">
                  <button
                    className="layerButton"
                    onClick={(event) => {
                      event.stopPropagation();
                      void reorderLayer(object.id, "up");
                    }}
                    title="Move layer up"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    className="layerButton"
                    onClick={(event) => {
                      event.stopPropagation();
                      void reorderLayer(object.id, "down");
                    }}
                    title="Move layer down"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    className="layerButton"
                    onClick={(event) => {
                      event.stopPropagation();
                      void updateObjectById(object.id, { visible: object.visible === false ? true : false });
                    }}
                    title="Toggle layer visibility"
                  >
                    {object.visible === false ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button
                    className="layerButton"
                    onClick={(event) => {
                      event.stopPropagation();
                      void updateObjectById(object.id, { locked: !object.locked });
                    }}
                    title="Toggle layer lock"
                  >
                    {object.locked ? <Lock size={13} /> : <Unlock size={13} />}
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </aside>

        <section className="stagePanel">
          <div className="stageToolbar">
            <div className="statusLine">
              <MousePointer2 size={15} />
              <span>{status}</span>
            </div>
            <div className="zoomControls">
              {zoomOptions.map((option) => (
                <button key={option} className={zoom === option ? "activeZoom" : ""} onClick={() => setZoom(option)}>
                  {Math.round(option * 100)}%
                </button>
              ))}
            </div>
            <div className="snapControls">
              <button className={snapEnabled ? "activeSnap" : ""} onClick={() => setSnapEnabled((value) => !value)} title="Toggle snap grid">
                <Grid3X3 size={14} />
                Snap
              </button>
              <input
                aria-label="Grid size"
                type="number"
                min="4"
                max="120"
                step="2"
                value={gridSize}
                onChange={(event) => setGridSize(clamp(Number(event.target.value) || 20, 4, 120))}
              />
            </div>
          </div>
          <div className="stageScroll" ref={stageRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}>
            <div
              className="layoutCanvas"
              style={{
                width: document.canvas.width,
                height: document.canvas.height,
                transform: `scale(${zoom})`,
                background: fillToCss(document.canvas.background, "#f6efe5"),
              }}
              onPointerDown={() => setSelectedId(null)}
            >
              {[...document.objects]
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((object) => (
                  <LayoutObjectNode key={object.id} object={object} document={document} selected={object.id === selectedId} onPointerDown={handlePointerDown} />
                ))}
            </div>
          </div>
        </section>

        <aside className="panel propertiesPanel">
          <div className="panelTitle">
            <Box size={16} />
            <span>Properties</span>
          </div>
          {selected ? (
            <Properties object={selected} updateObject={updateSelected} deleteObject={deleteSelected} uploadProduct={uploadProductForSelected} />
          ) : (
            <div className="emptyState">Select a layout object.</div>
          )}
          <AssetLibrary
            assets={assets}
            document={document}
            onRefresh={() => void refreshAssets()}
            onUse={(asset) => void useExistingAsset(asset)}
            onDelete={(asset) => void removeAssetFromLibrary(asset)}
          />
          <OutputPanel renderJob={renderJob} generationJob={generationJob} generatedImage={generatedImage} exportedPng={exportedPng} codexPrompt={codexPrompt} />
        </aside>
      </main>
    </div>
  );
}

function LayoutObjectNode({
  object,
  document,
  selected,
  onPointerDown,
}: {
  object: LayoutObject;
  document: LayoutDocument;
  selected: boolean;
  onPointerDown: (event: React.PointerEvent, object: LayoutObject, mode: "move" | "resize", handle?: "right" | "bottom" | "corner") => void;
}) {
  const baseStyle = objectStyle(object);
  const className = `layoutObject ${selected ? "selectedObject" : ""} object-${object.type}`;

  return (
    <div className={className} style={baseStyle} data-role={object.role ?? object.type} onPointerDown={(event) => onPointerDown(event, object, "move")}>
      <ObjectContent object={object} document={document} />
      {selected && !object.locked && (
        <>
          <button className="resizeHandle right" onPointerDown={(event) => onPointerDown(event, object, "resize", "right")} title="Resize width" />
          <button className="resizeHandle bottom" onPointerDown={(event) => onPointerDown(event, object, "resize", "bottom")} title="Resize height" />
          <button className="resizeHandle corner" onPointerDown={(event) => onPointerDown(event, object, "resize", "corner")} title="Resize" />
        </>
      )}
    </div>
  );
}

function ObjectContent({ object, document }: { object: LayoutObject; document: LayoutDocument }) {
  const asset = object.assetId ? document.assets.find((item) => item.id === object.assetId) : null;
  if (asset?.src && ["image", "product-image", "logo", "icon"].includes(object.type)) {
    return <img className="assetImage" src={asset.src} alt={asset.name} style={{ objectFit: object.fit ?? "contain" }} />;
  }
  if (object.type === "text") {
    return (
      <div
        className="textObject"
        style={{
          fontFamily: object.fontFamily ?? "Inter, Arial, sans-serif",
          fontSize: object.fontSize,
          fontWeight: object.fontWeight,
          color: object.color,
          textAlign: object.align,
          lineHeight: object.lineHeight,
          justifyContent: object.align === "right" ? "flex-end" : object.align === "left" ? "flex-start" : "center",
        }}
      >
        {object.content}
      </div>
    );
  }
  if (object.type === "product-image") {
    return <ProductPlaceholder label={object.content ?? "PRODUCT"} />;
  }
  if (object.type === "logo") {
    return <div className="logoObject">{object.content ?? object.name}</div>;
  }
  if (object.type === "badge") {
    return (
      <div className="badgeObject" style={{ background: fillToCss(object.fill, "#1d1813") }}>
        {object.content ?? object.name}
      </div>
    );
  }
  if (object.type === "circle") {
    return <div className="circleObject" style={{ background: fillToCss(object.fill, "rgba(255,255,255,0.65)") }} />;
  }
  return <div className="shapeObject" style={{ background: fillToCss(object.fill, "rgba(255,255,255,0.48)") }}>{object.content}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange, min }: { value: number; onChange: (value: number) => void; min?: number }) {
  return <input type="number" value={Number.isFinite(value) ? value : 0} min={min} onChange={(event) => onChange(Number(event.target.value))} />;
}

function Properties({
  object,
  updateObject,
  deleteObject,
  uploadProduct,
}: {
  object: LayoutObject;
  updateObject: (patch: Partial<LayoutObject>) => void;
  deleteObject: () => void;
  uploadProduct: (file: File) => void;
}) {
  return (
    <div className="properties">
      <Field label="Name">
        <input value={object.name} onChange={(event) => updateObject({ name: event.target.value })} />
      </Field>
      {object.role === "source-underlay" && (
        <div className="noticeBox">
          This is a locked source-image underlay for tracing layout blocks above it.
        </div>
      )}
      {object.analysisMeta && object.role !== "source-underlay" && (
        <div className={`extractionReview ${object.analysisMeta.reviewStatus ?? "needs-review"}`}>
          <div className="assetUploadTitle">
            <Wand2 size={16} />
            <span>Extraction review</span>
          </div>
          <div className="reviewStats">
            <span>Confidence</span>
            <strong>{Math.round((object.analysisMeta.extractionConfidence ?? 0) * 100)}%</strong>
            <span>Status</span>
            <strong>{object.analysisMeta.reviewStatus ?? "needs-review"}</strong>
          </div>
          {object.analysisMeta.sourceBBox && (
            <code>
              bbox {object.analysisMeta.sourceBBox.x}, {object.analysisMeta.sourceBBox.y}, {object.analysisMeta.sourceBBox.width} x {object.analysisMeta.sourceBBox.height}
            </code>
          )}
          {object.analysisMeta.originalText && <p>OCR: {object.analysisMeta.originalText}</p>}
          {object.analysisMeta.sourceProvider && <p>Provider: {object.analysisMeta.sourceProvider}</p>}
          <div className="reviewActions">
            <button
              onClick={() =>
                updateObject({
                  analysisMeta: {
                    ...object.analysisMeta,
                    reviewStatus: "accepted",
                  },
                })
              }
            >
              Accept
            </button>
            <button
              onClick={() =>
                updateObject({
                  visible: false,
                  analysisMeta: {
                    ...object.analysisMeta,
                    reviewStatus: "rejected",
                  },
                })
              }
            >
              Reject
            </button>
          </div>
        </div>
      )}
      <div className="fieldGrid">
        <Field label="X">
          <NumberInput value={object.x} onChange={(x) => updateObject({ x })} />
        </Field>
        <Field label="Y">
          <NumberInput value={object.y} onChange={(y) => updateObject({ y })} />
        </Field>
        <Field label="W">
          <NumberInput value={object.width} min={1} onChange={(width) => updateObject({ width })} />
        </Field>
        <Field label="H">
          <NumberInput value={object.height} min={1} onChange={(height) => updateObject({ height })} />
        </Field>
      </div>
      <div className="fieldGrid">
        <Field label="Rotate">
          <NumberInput value={object.rotation} onChange={(rotation) => updateObject({ rotation })} />
        </Field>
        <Field label="Opacity">
          <input type="range" min="0" max="1" step="0.05" value={object.opacity} onChange={(event) => updateObject({ opacity: Number(event.target.value) })} />
        </Field>
      </div>
      {object.content !== undefined && (
        <Field label="Content">
          <textarea value={object.content} onChange={(event) => updateObject({ content: event.target.value })} />
        </Field>
      )}
      {object.type === "text" && (
        <>
          <div className="fieldGrid">
            <Field label="Font size">
              <NumberInput value={object.fontSize ?? 32} min={1} onChange={(fontSize) => updateObject({ fontSize })} />
            </Field>
            <Field label="Weight">
              <NumberInput value={object.fontWeight ?? 500} min={100} onChange={(fontWeight) => updateObject({ fontWeight })} />
            </Field>
          </div>
          <Field label="Color">
            <input type="color" value={object.color ?? "#201b16"} onChange={(event) => updateObject({ color: event.target.value })} />
          </Field>
          <Field label="Align">
            <select value={object.align ?? "left"} onChange={(event) => updateObject({ align: event.target.value as LayoutObject["align"] })}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </Field>
        </>
      )}
      {(object.type === "product-image" || object.role === "product") && (
        <div className="assetUploadBox">
          <div className="assetUploadTitle">
            <Upload size={16} />
            <span>Product asset</span>
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) uploadProduct(file);
              event.currentTarget.value = "";
            }}
          />
          <p>Upload a product image to replace the placeholder inside this product slot.</p>
          {object.assetId && <code>{object.assetId}</code>}
        </div>
      )}
      <div className="toggleRow">
        <button onClick={() => updateObject({ visible: object.visible === false ? true : false })} title="Toggle visibility">
          {object.visible === false ? <EyeOff size={16} /> : <Eye size={16} />}
          {object.visible === false ? "Hidden" : "Visible"}
        </button>
        <button onClick={() => updateObject({ locked: !object.locked })} title="Toggle lock">
          {object.locked ? <Lock size={16} /> : <Unlock size={16} />}
          {object.locked ? "Locked" : "Unlocked"}
        </button>
      </div>
      <button className="dangerButton" onClick={deleteObject} disabled={object.locked}>
        Delete Object
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
