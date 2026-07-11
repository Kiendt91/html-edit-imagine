import { normalizeLayoutDocument } from "./layout-normalizer.mjs";
import { assetDataUrl, openAiJson, responseJson } from "./openai-client.mjs";

function pct(value, ratio) {
  return Math.round(value * ratio);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function slugify(value, fallback = "object") {
  const slug = String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  return slug || fallback;
}

export function sourceImageTitle(asset) {
  const base = asset.name?.replace(/\.[^.]+$/, "") || "Source Layout";
  return `${base} Layout`;
}

function analysisMeta(assetId, confidence, sourceBBox, extra = {}) {
  return {
    extractedFromAssetId: assetId,
    extractionConfidence: confidence,
    sourceBBox,
    ...extra,
  };
}

function extractedObject({ object, sourceAssetId, source = "mock-vision-heuristic" }) {
  return {
    id: object.id,
    type: object.type,
    role: object.role ?? object.type,
    bbox: { x: object.x, y: object.y, width: object.width, height: object.height },
    text: object.type === "text" ? object.content : undefined,
    originalText: object.analysisMeta?.originalText,
    description:
      object.id === "source-underlay"
        ? "Locked source image underlay for visual reference."
        : `Editable HTML layout region: ${object.name}.`,
    confidence: object.analysisMeta?.extractionConfidence ?? 0.5,
    source: object.id === "source-underlay" ? "source-image" : source,
    sourceAssetId,
  };
}

function sourceLayoutObjects({ asset, width, height, underlayOpacity }) {
  return [
    {
      id: "source-underlay",
      name: "Source Image Underlay",
      type: "image",
      x: 0,
      y: 0,
      width,
      height,
      rotation: 0,
      opacity: underlayOpacity,
      zIndex: -100,
      locked: true,
      visible: true,
      role: "source-underlay",
      assetId: asset.id,
      fit: "fill",
      analysisMeta: analysisMeta(asset.id, 1, { x: 0, y: 0, width, height }),
    },
    {
      id: "layout-background",
      name: "Extracted Background",
      type: "rectangle",
      x: 0,
      y: 0,
      width,
      height,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
      locked: false,
      visible: true,
      role: "background",
      fill: {
        type: "linear-gradient",
        from: "#290806",
        to: "#68120e",
      },
      analysisMeta: analysisMeta(asset.id, 0.52, { x: 0, y: 0, width, height }),
    },
    {
      id: "headline-top-left",
      name: "Headline Left Block",
      type: "text",
      x: pct(width, 0.08),
      y: pct(height, 0.07),
      width: pct(width, 0.58),
      height: pct(height, 0.17),
      rotation: -5,
      opacity: 1,
      zIndex: 40,
      locked: false,
      visible: true,
      role: "headline",
      content: "BUNG VI",
      fontFamily: "Impact, Arial Black, Arial, sans-serif",
      fontSize: Math.max(44, pct(width, 0.11)),
      fontWeight: 900,
      color: "#f3cc68",
      align: "center",
      lineHeight: 0.92,
      analysisMeta: analysisMeta(
        asset.id,
        0.58,
        { x: pct(width, 0.08), y: pct(height, 0.07), width: pct(width, 0.58), height: pct(height, 0.17) },
        { originalText: "BUNG VI" },
      ),
    },
    {
      id: "headline-right-stack",
      name: "Right Text Stack",
      type: "text",
      x: pct(width, 0.61),
      y: pct(height, 0.05),
      width: pct(width, 0.32),
      height: pct(height, 0.34),
      rotation: -5,
      opacity: 1,
      zIndex: 42,
      locked: false,
      visible: true,
      role: "headline",
      content: "CAY\nNGON",
      fontFamily: "Impact, Arial Black, Arial, sans-serif",
      fontSize: Math.max(42, pct(width, 0.105)),
      fontWeight: 900,
      color: "#f3cc68",
      align: "center",
      lineHeight: 0.9,
      analysisMeta: analysisMeta(
        asset.id,
        0.56,
        { x: pct(width, 0.61), y: pct(height, 0.05), width: pct(width, 0.32), height: pct(height, 0.34) },
        { originalText: "CAY\nNGON" },
      ),
    },
    {
      id: "flame-motion-zone",
      name: "Motion Flame Zone",
      type: "rectangle",
      x: pct(width, 0.04),
      y: pct(height, 0.44),
      width: pct(width, 0.88),
      height: pct(height, 0.36),
      rotation: -8,
      opacity: 0.88,
      zIndex: 12,
      locked: false,
      visible: true,
      role: "decoration",
      fill: {
        type: "radial-gradient",
        inner: "rgba(255, 120, 20, 0.82)",
        outer: "rgba(255, 190, 48, 0.05)",
      },
      analysisMeta: analysisMeta(asset.id, 0.48, {
        x: pct(width, 0.04),
        y: pct(height, 0.44),
        width: pct(width, 0.88),
        height: pct(height, 0.36),
      }),
    },
    {
      id: "product-zone",
      name: "Product Layout Area",
      type: "rectangle",
      x: pct(width, 0.31),
      y: pct(height, 0.27),
      width: pct(width, 0.37),
      height: pct(height, 0.55),
      rotation: 0,
      opacity: 1,
      zIndex: 55,
      locked: false,
      visible: true,
      role: "product",
      content: "PRODUCT",
      subjectLock: true,
      promptRole: "primary-product",
      fill: {
        type: "linear-gradient",
        from: "rgba(255, 79, 38, 0.7)",
        to: "rgba(255, 188, 86, 0.22)",
      },
      analysisMeta: analysisMeta(asset.id, 0.62, {
        x: pct(width, 0.31),
        y: pct(height, 0.27),
        width: pct(width, 0.37),
        height: pct(height, 0.55),
      }),
    },
    {
      id: "ingredient-accent-left",
      name: "Ingredient Accent Left",
      type: "circle",
      x: pct(width, 0.07),
      y: pct(height, 0.68),
      width: pct(width, 0.2),
      height: pct(width, 0.2),
      rotation: 0,
      opacity: 0.78,
      zIndex: 30,
      locked: false,
      visible: true,
      role: "ingredient-accent",
      fill: {
        type: "solid",
        color: "rgba(244, 74, 28, 0.72)",
      },
      analysisMeta: analysisMeta(asset.id, 0.45, {
        x: pct(width, 0.07),
        y: pct(height, 0.68),
        width: pct(width, 0.2),
        height: pct(width, 0.2),
      }),
    },
    {
      id: "ingredient-accent-right",
      name: "Ingredient Accent Right",
      type: "circle",
      x: pct(width, 0.64),
      y: pct(height, 0.59),
      width: pct(width, 0.19),
      height: pct(width, 0.19),
      rotation: 0,
      opacity: 0.78,
      zIndex: 31,
      locked: false,
      visible: true,
      role: "ingredient-accent",
      fill: {
        type: "solid",
        color: "rgba(255, 235, 196, 0.78)",
      },
      analysisMeta: analysisMeta(asset.id, 0.43, {
        x: pct(width, 0.64),
        y: pct(height, 0.59),
        width: pct(width, 0.19),
        height: pct(width, 0.19),
      }),
    },
    {
      id: "bottom-motion-crop",
      name: "Bottom Motion Crop",
      type: "rectangle",
      x: pct(width, 0.44),
      y: pct(height, 0.84),
      width: pct(width, 0.52),
      height: pct(height, 0.14),
      rotation: -18,
      opacity: 0.92,
      zIndex: 22,
      locked: false,
      visible: true,
      role: "foreground-motion",
      fill: {
        type: "linear-gradient",
        from: "rgba(228, 35, 22, 0.92)",
        to: "rgba(255, 142, 44, 0.42)",
      },
      analysisMeta: analysisMeta(asset.id, 0.42, {
        x: pct(width, 0.44),
        y: pct(height, 0.84),
        width: pct(width, 0.52),
        height: pct(height, 0.14),
      }),
    },
  ];
}

function boxFromRegion(region, canvas) {
  const bbox = region?.bbox && typeof region.bbox === "object" ? region.bbox : {};
  const width = Math.max(24, Math.round(Number.isFinite(bbox.width) ? bbox.width : canvas.width * 0.25));
  const height = Math.max(24, Math.round(Number.isFinite(bbox.height) ? bbox.height : canvas.height * 0.1));
  return {
    x: Math.round(clamp(Number.isFinite(bbox.x) ? bbox.x : 0, 0, Math.max(0, canvas.width - width))),
    y: Math.round(clamp(Number.isFinite(bbox.y) ? bbox.y : 0, 0, Math.max(0, canvas.height - height))),
    width: Math.round(clamp(width, 24, canvas.width)),
    height: Math.round(clamp(height, 24, canvas.height)),
  };
}

function objectFromRegion(region, index, asset, canvas) {
  const role = slugify(region.role ?? region.type ?? `region-${index + 1}`, `region-${index + 1}`);
  const regionType = String(region.type ?? "").toLowerCase();
  const sourceBBox = boxFromRegion(region, canvas);
  const confidence = clamp(Number.isFinite(region.confidence) ? region.confidence : 0.5, 0, 1);
  const id = slugify(region.id ?? `${role}-${index + 1}`, `${role}-${index + 1}`);
  const base = {
    id,
    name: region.name ?? region.description ?? role.replaceAll("-", " "),
    x: sourceBBox.x,
    y: sourceBBox.y,
    width: sourceBBox.width,
    height: sourceBBox.height,
    rotation: Number.isFinite(region.rotation) ? region.rotation : 0,
    opacity: 1,
    zIndex: 10 + index * 10,
    locked: false,
    visible: true,
    role,
    analysisMeta: analysisMeta(asset.id, confidence, sourceBBox, {
      originalText: regionType === "text" ? String(region.text || region.originalText || region.description || "TEXT") : undefined,
      sourceProvider: region.source ?? "vision-provider",
      reviewStatus: "needs-review",
    }),
  };

  if (regionType === "text") {
    return {
      ...base,
      type: "text",
      content: String(region.text || region.originalText || region.description || "TEXT"),
      fontFamily: region.fontFamily ?? "Impact, Arial Black, Arial, sans-serif",
      fontSize: Math.max(24, Math.round(region.fontSize ?? Math.min(sourceBBox.width, sourceBBox.height) * 0.42)),
      fontWeight: Math.round(region.fontWeight ?? 800),
      color: region.color ?? "#f3cc68",
      align: ["left", "center", "right"].includes(region.align) ? region.align : "center",
      lineHeight: Number.isFinite(region.lineHeight) ? region.lineHeight : 0.95,
    };
  }

  if (regionType === "badge") {
    return {
      ...base,
      type: "badge",
      content: String(region.text || region.description || "BADGE").slice(0, 80),
      fill: {
        type: "solid",
        color: region.color ?? "rgba(31, 25, 20, 0.82)",
      },
    };
  }

  if (regionType === "circle") {
    return {
      ...base,
      type: "circle",
      fill: {
        type: "solid",
        color: region.color ?? "rgba(255, 130, 52, 0.68)",
      },
    };
  }

  if (regionType === "logo") {
    return {
      ...base,
      type: "rectangle",
      role: "logo",
      content: String(region.text || "LOGO"),
      fill: {
        type: "solid",
        color: "rgba(255, 250, 242, 0.58)",
      },
    };
  }

  if (regionType === "product" || role === "product") {
    return {
      ...base,
      type: "rectangle",
      role: "product",
      content: "PRODUCT",
      subjectLock: true,
      promptRole: "primary-product",
      fill: {
        type: "linear-gradient",
        from: "rgba(255, 79, 38, 0.72)",
        to: "rgba(255, 188, 86, 0.24)",
      },
    };
  }

  return {
    ...base,
    type: "rectangle",
    fill: {
      type: regionType === "background" ? "linear-gradient" : "radial-gradient",
      from: region.color ?? "#290806",
      to: region.secondaryColor ?? "#68120e",
      inner: region.color ?? "rgba(255, 120, 20, 0.72)",
      outer: region.secondaryColor ?? "rgba(255, 190, 48, 0.05)",
    },
  };
}

function documentFromExtraction({ asset, providerId, extraction, underlayOpacity = 0.22 }) {
  const width = Math.max(320, Math.round(extraction?.canvas?.width || asset.width || 1080));
  const height = Math.max(320, Math.round(extraction?.canvas?.height || asset.height || 1350));
  const canvas = { width, height, unit: "px" };
  const underlay = sourceLayoutObjects({ asset, width, height, underlayOpacity })[0];
  const fallbackObjects = sourceLayoutObjects({ asset, width, height, underlayOpacity }).slice(1);
  const extracted = Array.isArray(extraction?.objects) ? extraction.objects : [];
  const objects = [
    underlay,
    ...extracted
      .filter((region) => region && region.role !== "source-underlay" && region.id !== "source-underlay")
      .map((region, index) => objectFromRegion(region, index, asset, canvas)),
  ];

  const usedIds = new Set(objects.map((object) => object.id));
  for (const fallback of fallbackObjects) {
    if (objects.length >= 5) break;
    if (!usedIds.has(fallback.id)) {
      objects.push({
        ...fallback,
        analysisMeta: {
          ...fallback.analysisMeta,
          reviewStatus: "needs-review",
          sourceProvider: providerId,
        },
      });
      usedIds.add(fallback.id);
    }
  }

  return normalizeLayoutDocument({
    version: "0.1.0",
    canvas: {
      ...canvas,
      background: {
        type: "solid",
        color: "#f6efe5",
      },
    },
    assets: [asset],
    objects,
    guides: [
      { axis: "x", position: Math.round(width / 2) },
      { axis: "y", position: Math.round(height / 2) },
    ],
    meta: {
      title: sourceImageTitle(asset),
      sourceAssetId: asset.id,
      workflow: "source-image-layout-extraction",
      extractor: providerId,
      visionProvider: providerId,
      extractionConfidence: clamp(Number.isFinite(extraction?.confidence) ? extraction.confidence : 0.5, 0, 1),
      extractionWarnings: Array.isArray(extraction?.warnings) ? extraction.warnings : [],
      styleHints: extraction?.styleHints ?? {},
    },
  });
}

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["canvas", "objects", "styleHints", "confidence", "warnings"],
  properties: {
    canvas: {
      type: "object",
      additionalProperties: false,
      required: ["width", "height"],
      properties: {
        width: { type: "number" },
        height: { type: "number" },
      },
    },
    objects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "role", "bbox", "text", "description", "confidence"],
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["text", "product", "background", "decoration", "badge", "logo", "circle", "rectangle"] },
          role: { type: "string" },
          text: { type: "string" },
          description: { type: "string" },
          confidence: { type: "number" },
          bbox: {
            type: "object",
            additionalProperties: false,
            required: ["x", "y", "width", "height"],
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
            },
          },
        },
      },
    },
    styleHints: {
      type: "object",
      additionalProperties: false,
      required: ["palette", "mood", "backgroundDescription"],
      properties: {
        palette: { type: "array", items: { type: "string" } },
        mood: { type: "string" },
        backgroundDescription: { type: "string" },
      },
    },
    confidence: { type: "number" },
    warnings: { type: "array", items: { type: "string" } },
  },
};

export class MockVisionLayoutProvider {
  id = "mock-vision-layout-v1";

  analyzeLayout({ asset, underlayOpacity = 0.22 }) {
    const width = Math.max(320, Math.round(asset.width || 1080));
    const height = Math.max(320, Math.round(asset.height || 1350));
    const warnings = [
      "This MVP uses a mock vision provider with heuristic layout extraction, not full AI vision/OCR yet. Review and adjust the editable HTML blocks.",
    ];
    const document = normalizeLayoutDocument({
      version: "0.1.0",
      canvas: {
        width,
        height,
        unit: "px",
        background: {
          type: "solid",
          color: "#f6efe5",
        },
      },
      assets: [asset],
      objects: sourceLayoutObjects({ asset, width, height, underlayOpacity }),
      guides: [
        { axis: "x", position: Math.round(width / 2) },
        { axis: "y", position: Math.round(height / 2) },
      ],
      meta: {
        title: sourceImageTitle(asset),
        sourceAssetId: asset.id,
        workflow: "source-image-layout-extraction",
        extractor: this.id,
        visionProvider: this.id,
        extractionConfidence: 0.58,
        extractionWarnings: warnings,
      },
    });

    return {
      provider: this.id,
      extraction: {
        sourceAssetId: asset.id,
        provider: this.id,
        canvas: document.canvas,
        objects: document.objects.map((object) => extractedObject({ object, sourceAssetId: asset.id })),
        styleHints: {
          palette: ["#290806", "#68120e", "#f3cc68", "#f04424"],
          backgroundDescription: "Dark red spicy advertisement background with warm flame-like motion accents.",
        },
        confidence: 0.58,
        warnings,
      },
      document,
      warnings,
      confidence: 0.58,
    };
  }
}

export class OpenAIVisionLayoutProvider {
  constructor({ rootDir, model = process.env.OPENAI_VISION_MODEL ?? "gpt-5.5" }) {
    this.id = "openai-vision-layout";
    this.rootDir = rootDir;
    this.model = model;
  }

  async analyzeLayout({ asset, underlayOpacity = 0.22 }) {
    const imageUrl = await assetDataUrl(asset, this.rootDir);
    const response = await openAiJson("/responses", {
      model: this.model,
      input: [
        {
          role: "system",
          content:
            "You extract editable ad/poster/image layouts. Return only structured layout regions, never HTML. Use pixel coordinates in the source image coordinate system.",
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Analyze this source image into editable layout blocks for an HTML layout editor.",
                "Find headline text, product/subject area, background, decorative motion zones, logos, badges, and foreground accents.",
                "Use concise ids. For OCR text, set text to the observed text. For non-text objects, set text to an empty string.",
                "Every bbox must be in source image pixels.",
              ].join("\n"),
            },
            {
              type: "input_image",
              image_url: imageUrl,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "image_layout_extraction",
          strict: true,
          schema: extractionSchema,
        },
      },
    });
    const extraction = responseJson(response);
    const warnings = [
      ...(Array.isArray(extraction.warnings) ? extraction.warnings : []),
      "Review extracted blocks before final generation; vision/OCR confidence is advisory.",
    ];
    const normalizedExtraction = {
      ...extraction,
      warnings,
    };
    const document = documentFromExtraction({
      asset,
      providerId: this.id,
      extraction: normalizedExtraction,
      underlayOpacity,
    });
    return {
      provider: this.id,
      model: this.model,
      extraction: {
        ...normalizedExtraction,
        sourceAssetId: asset.id,
        provider: this.id,
      },
      document,
      warnings,
      confidence: document.meta.extractionConfidence,
    };
  }
}

export function createMockVisionLayoutProvider() {
  return new MockVisionLayoutProvider();
}

export function createVisionLayoutProvider({ rootDir, provider = process.env.VISION_LAYOUT_PROVIDER ?? "mock" } = {}) {
  if (provider === "openai") {
    return new OpenAIVisionLayoutProvider({ rootDir });
  }
  if (provider === "mock" || provider === "mock-local") {
    return new MockVisionLayoutProvider();
  }
  const error = new Error(`Unsupported vision layout provider "${provider}"`);
  error.statusCode = 400;
  throw error;
}
