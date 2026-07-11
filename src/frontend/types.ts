export type Fill =
  | { type: "solid"; color: string }
  | { type: "linear-gradient"; from: string; to: string }
  | { type: "radial-gradient"; inner: string; outer: string };

export type CanvasSpec = {
  width: number;
  height: number;
  unit: "px";
  background?: Fill;
};

export type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LayoutObjectAnalysisMeta = {
  extractedFromAssetId?: string;
  extractionConfidence?: number;
  sourceBBox?: Box;
  originalText?: string;
  sourceProvider?: string;
  reviewStatus?: "needs-review" | "accepted" | "rejected";
};

export type LayoutObject = {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  locked?: boolean;
  visible?: boolean;
  role?: string;
  content?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  fit?: "contain" | "cover" | "fill";
  assetId?: string;
  subjectLock?: boolean;
  promptRole?: "primary-product";
  crop?: Box;
  fill?: Fill;
  analysisMeta?: LayoutObjectAnalysisMeta;
};

export type AssetRef = {
  id: string;
  type: "image";
  kind?: "source-layout" | "product" | "logo" | "icon" | "background" | "reference";
  name: string;
  src: string;
  filePath?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  analysis?: {
    hasAlpha?: boolean;
    dominantColors?: string[];
    subjectBBox?: Box;
    backgroundKind?: "transparent" | "plain" | "complex" | "unknown";
    suggestedFit?: "contain" | "cover";
  };
};

export type LayoutDocument = {
  version: string;
  canvas: CanvasSpec;
  assets: AssetRef[];
  objects: LayoutObject[];
  guides?: Array<Record<string, unknown>>;
  meta?: {
    title?: string;
    [key: string]: unknown;
  };
};

export type PatchOperation =
  | { type: "updateObject"; id: string; patch: Partial<LayoutObject> }
  | { type: "addObject"; object: Partial<LayoutObject> }
  | { type: "removeObject"; id: string }
  | { type: "reorderObject"; id: string; zIndex: number }
  | { type: "setCanvas"; canvas: Partial<CanvasSpec> }
  | { type: "replaceAsset"; asset: AssetRef };

export type RenderJob = {
  jobId: string;
  tier: string;
  documentHash: string;
  status: "queued" | "running" | "ready" | "failed";
  cached: boolean;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  htmlUrl: string | null;
  cleanHtmlUrl?: string | null;
  pngUrl: string | null;
  cleanPngUrl?: string | null;
  codexPrompt: string | null;
};

export type GenerationJob = {
  jobId: string;
  provider: string;
  providerMode?: string | null;
  providerModel?: string | null;
  documentHash: string;
  status: "queued" | "exporting-reference" | "generating" | "ready" | "failed";
  createdAt: string;
  updatedAt: string;
  error: string | null;
  referenceUrl: string | null;
  cleanReferenceUrl: string | null;
  imageUrl: string | null;
  generationPrompt: string | null;
};
