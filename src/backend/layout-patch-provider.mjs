import { applyLayoutPatch } from "./layout-commands.mjs";
import { normalizeLayoutDocument } from "./layout-normalizer.mjs";
import { openAiJson, responseJson } from "./openai-client.mjs";

const lockedSafePatchKeys = new Set(["locked", "visible", "opacity", "name"]);

const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };
const nullableBoolean = { type: ["boolean", "null"] };

const patchPayloadProperties = {
  name: nullableString,
  x: nullableNumber,
  y: nullableNumber,
  width: nullableNumber,
  height: nullableNumber,
  rotation: nullableNumber,
  opacity: nullableNumber,
  zIndex: nullableNumber,
  locked: nullableBoolean,
  visible: nullableBoolean,
  role: nullableString,
  content: nullableString,
  fontFamily: nullableString,
  fontSize: nullableNumber,
  fontWeight: nullableNumber,
  color: nullableString,
  align: nullableString,
  lineHeight: nullableNumber,
  assetId: nullableString,
  fit: nullableString,
  subjectLock: nullableBoolean,
  promptRole: nullableString,
  fillColor: nullableString,
};

const objectPayloadProperties = {
  id: nullableString,
  type: nullableString,
  ...patchPayloadProperties,
};

const patchPayloadSchema = {
  type: ["object", "null"],
  additionalProperties: false,
  required: Object.keys(patchPayloadProperties),
  properties: patchPayloadProperties,
};

const objectPayloadSchema = {
  type: ["object", "null"],
  additionalProperties: false,
  required: Object.keys(objectPayloadProperties),
  properties: objectPayloadProperties,
};

const canvasPayloadSchema = {
  type: ["object", "null"],
  additionalProperties: false,
  required: ["width", "height", "backgroundColor"],
  properties: {
    width: nullableNumber,
    height: nullableNumber,
    backgroundColor: nullableString,
  },
};

const openAiPatchPlanSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ops", "warnings", "confidence"],
  properties: {
    ops: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "id", "patch", "object", "zIndex", "canvas"],
        properties: {
          type: {
            type: "string",
            enum: ["updateObject", "addObject", "removeObject", "reorderObject", "setCanvas"],
          },
          id: nullableString,
          patch: patchPayloadSchema,
          object: objectPayloadSchema,
          zIndex: nullableNumber,
          canvas: canvasPayloadSchema,
        },
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
  },
};

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function includesAny(text, needles) {
  return needles.some((needle) => text.includes(needle));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function compactObject(value) {
  const result = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, item] of Object.entries(value)) {
    if (item !== null && item !== undefined && item !== "") {
      result[key] = item;
    }
  }
  return result;
}

function fillFromColor(value) {
  if (!isNonEmptyString(value)) return undefined;
  return { type: "solid", color: value.trim() };
}

function compactPatchPayload(payload) {
  const patch = compactObject(payload);
  if (patch.fillColor) {
    patch.fill = fillFromColor(patch.fillColor);
    delete patch.fillColor;
  }
  if (patch.align && !["left", "center", "right"].includes(patch.align)) {
    delete patch.align;
  }
  if (patch.fit && !["contain", "cover", "fill"].includes(patch.fit)) {
    delete patch.fit;
  }
  if (patch.promptRole && patch.promptRole !== "primary-product") {
    delete patch.promptRole;
  }
  return patch;
}

function compactCanvasPayload(payload) {
  const canvas = {};
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return canvas;
  if (isFiniteNumber(payload.width)) canvas.width = Math.round(payload.width);
  if (isFiniteNumber(payload.height)) canvas.height = Math.round(payload.height);
  if (isNonEmptyString(payload.backgroundColor)) {
    canvas.background = { type: "solid", color: payload.backgroundColor.trim() };
  }
  return canvas;
}

function uniqueObjectId(document, base) {
  const root = String(base).replace(/[^a-z0-9-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "object";
  const usedIds = new Set(document.objects.map((object) => object.id));
  if (!usedIds.has(root)) return root;
  let index = 2;
  while (usedIds.has(`${root}-${index}`)) index += 1;
  return `${root}-${index}`;
}

function compactDocumentForPrompt(document) {
  return {
    canvas: document.canvas,
    objects: document.objects.map((object) => ({
      id: object.id,
      name: object.name,
      type: object.type,
      role: object.role ?? null,
      promptRole: object.promptRole ?? null,
      locked: object.locked === true,
      visible: object.visible !== false,
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      rotation: object.rotation,
      opacity: object.opacity,
      zIndex: object.zIndex,
      content: object.content ?? null,
      fontSize: object.fontSize ?? null,
      color: object.color ?? null,
      align: object.align ?? null,
      assetId: object.assetId ?? null,
    })),
  };
}

function normalizeAddedObject(document, payload) {
  const object = compactPatchPayload(payload);
  const idBase = object.id ?? object.name ?? object.role ?? object.type ?? "assistant-object";
  const x = isFiniteNumber(object.x) ? object.x : document.canvas.width * 0.24;
  const y = isFiniteNumber(object.y) ? object.y : document.canvas.height * 0.24;
  const width = isFiniteNumber(object.width) ? object.width : document.canvas.width * 0.28;
  const height = isFiniteNumber(object.height) ? object.height : document.canvas.height * 0.1;

  return {
    ...object,
    id: uniqueObjectId(document, idBase),
    name: isNonEmptyString(object.name) ? object.name : "Assistant Object",
    type: isNonEmptyString(object.type) ? object.type : "rectangle",
    x: clamp(Math.round(x), 0, Math.max(0, document.canvas.width - 1)),
    y: clamp(Math.round(y), 0, Math.max(0, document.canvas.height - 1)),
    width: clamp(Math.round(width), 24, document.canvas.width),
    height: clamp(Math.round(height), 24, document.canvas.height),
    rotation: isFiniteNumber(object.rotation) ? object.rotation : 0,
    opacity: isFiniteNumber(object.opacity) ? clamp(object.opacity, 0, 1) : 1,
    zIndex: isFiniteNumber(object.zIndex) ? object.zIndex : Math.max(0, ...document.objects.map((item) => item.zIndex)) + 10,
    visible: object.visible === false ? false : true,
  };
}

function normalizeOpenAiOps(document, rawOps = []) {
  const warnings = [];
  const ops = [];
  const byId = new Map(document.objects.map((object) => [object.id, object]));

  for (const rawOp of Array.isArray(rawOps) ? rawOps : []) {
    if (!rawOp || typeof rawOp !== "object") continue;

    if (rawOp.type === "addObject") {
      ops.push({ type: "addObject", object: normalizeAddedObject(document, rawOp.object) });
      continue;
    }

    if (rawOp.type === "setCanvas") {
      const canvas = compactCanvasPayload(rawOp.canvas);
      if (Object.keys(canvas).length > 0) {
        ops.push({ type: "setCanvas", canvas });
      } else {
        warnings.push("Skipped an empty canvas update.");
      }
      continue;
    }

    if (!isNonEmptyString(rawOp.id) || !byId.has(rawOp.id)) {
      warnings.push(`Skipped ${rawOp.type ?? "operation"} with an unknown object id.`);
      continue;
    }

    const target = byId.get(rawOp.id);
    if (rawOp.type === "updateObject") {
      const patch = compactPatchPayload(rawOp.patch);
      const patchEntries = Object.entries(patch);
      if (target.locked) {
        const safePatch = Object.fromEntries(patchEntries.filter(([key]) => lockedSafePatchKeys.has(key)));
        if (Object.keys(safePatch).length !== patchEntries.length) {
          warnings.push(`Skipped unsafe edits for locked object "${target.name}".`);
        }
        if (Object.keys(safePatch).length > 0) {
          ops.push({ type: "updateObject", id: rawOp.id, patch: safePatch });
        }
      } else if (patchEntries.length > 0) {
        ops.push({ type: "updateObject", id: rawOp.id, patch });
      } else {
        warnings.push(`Skipped empty update for "${target.name}".`);
      }
      continue;
    }

    if (target.locked) {
      warnings.push(`Skipped ${rawOp.type} for locked object "${target.name}".`);
      continue;
    }

    if (rawOp.type === "removeObject") {
      ops.push({ type: "removeObject", id: rawOp.id });
    } else if (rawOp.type === "reorderObject" && isFiniteNumber(rawOp.zIndex)) {
      ops.push({ type: "reorderObject", id: rawOp.id, zIndex: rawOp.zIndex });
    } else {
      warnings.push(`Skipped unsupported or incomplete operation for "${target.name}".`);
    }
  }

  return { ops, warnings };
}

function formatSummaryValue(value) {
  if (value === undefined) return "unset";
  if (value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function objectName(document, id) {
  return document.objects.find((object) => object.id === id)?.name ?? id ?? "Layout";
}

export function summarizeOps(document, ops) {
  const normalized = normalizeLayoutDocument(document);
  return ops.map((op, index) => {
    if (op.type === "updateObject") {
      const object = normalized.objects.find((item) => item.id === op.id);
      return {
        index,
        type: op.type,
        objectId: op.id,
        objectName: objectName(normalized, op.id),
        label: `Update ${objectName(normalized, op.id)}`,
        details: Object.entries(op.patch ?? {}).map(([key, value]) => ({
          key,
          from: formatSummaryValue(object?.[key]),
          to: formatSummaryValue(value),
        })),
      };
    }
    if (op.type === "addObject") {
      return {
        index,
        type: op.type,
        objectId: op.object?.id ?? null,
        objectName: op.object?.name ?? op.object?.id ?? "New object",
        label: `Add ${op.object?.name ?? op.object?.id ?? "new object"}`,
        details: [
          { key: "type", from: "none", to: formatSummaryValue(op.object?.type) },
          { key: "position", from: "none", to: `${op.object?.x ?? "?"}, ${op.object?.y ?? "?"}` },
        ],
      };
    }
    if (op.type === "removeObject") {
      return {
        index,
        type: op.type,
        objectId: op.id,
        objectName: objectName(normalized, op.id),
        label: `Remove ${objectName(normalized, op.id)}`,
        details: [],
      };
    }
    if (op.type === "reorderObject") {
      const object = normalized.objects.find((item) => item.id === op.id);
      return {
        index,
        type: op.type,
        objectId: op.id,
        objectName: objectName(normalized, op.id),
        label: `Reorder ${objectName(normalized, op.id)}`,
        details: [{ key: "zIndex", from: formatSummaryValue(object?.zIndex), to: formatSummaryValue(op.zIndex) }],
      };
    }
    if (op.type === "setCanvas") {
      return {
        index,
        type: op.type,
        objectId: null,
        objectName: "Canvas",
        label: "Update canvas",
        details: Object.entries(op.canvas ?? {}).map(([key, value]) => ({
          key,
          from: formatSummaryValue(normalized.canvas[key]),
          to: formatSummaryValue(value),
        })),
      };
    }
    return {
      index,
      type: op.type,
      objectId: op.asset?.id ?? null,
      objectName: op.asset?.name ?? op.type,
      label: `Apply ${op.type}`,
      details: [],
    };
  });
}

function semanticTargets(document, text, selectedObjectIds = []) {
  const selected = selectedObjectIds
    .map((id) => document.objects.find((object) => object.id === id))
    .filter(Boolean);

  if (includesAny(text, ["product", "san pham", "chai", "chu the", "subject"])) {
    const productTargets = document.objects.filter((object) => object.role === "product" || object.type === "product-image" || object.promptRole === "primary-product");
    if (productTargets.length > 0) return productTargets;
  }

  if (includesAny(text, ["headline", "title", "tieu de", "chu chinh", "text", "copy"])) {
    const textTargets = document.objects.filter((object) => object.type === "text" || object.role === "headline");
    if (textTargets.length > 0) return textTargets.slice(0, 2);
  }

  if (selected.length > 0) return selected;
  return document.objects.filter((object) => !object.locked).slice(0, 1);
}

function movementPatch(object, document, text) {
  const stepX = Math.max(24, Math.round(document.canvas.width * 0.055));
  const stepY = Math.max(24, Math.round(document.canvas.height * 0.045));
  const patch = {};

  if (includesAny(text, ["up", "higher", "len", "cao hon", "nang"])) {
    patch.y = clamp(object.y - stepY, 0, document.canvas.height - object.height);
  }
  if (includesAny(text, ["down", "lower", "xuong", "thap hon"])) {
    patch.y = clamp(object.y + stepY, 0, document.canvas.height - object.height);
  }
  if (includesAny(text, ["left", "trai", "sang trai"])) {
    patch.x = clamp(object.x - stepX, 0, document.canvas.width - object.width);
  }
  if (includesAny(text, ["right", "phai", "sang phai"])) {
    patch.x = clamp(object.x + stepX, 0, document.canvas.width - object.width);
  }
  if (includesAny(text, ["center", "middle", "giua", "can giua"])) {
    patch.x = Math.round((document.canvas.width - object.width) / 2);
    if (object.type === "text") patch.align = "center";
  }

  return patch;
}

function scalePatch(object, document, text) {
  const patch = {};
  if (includesAny(text, ["bigger", "larger", "lon hon", "to hon", "phong to"])) {
    if (object.type === "text") {
      patch.fontSize = Math.max(1, Math.round((object.fontSize ?? 36) * 1.14));
    }
    patch.width = clamp(Math.round(object.width * 1.08), 24, document.canvas.width - object.x);
    patch.height = clamp(Math.round(object.height * 1.08), 24, document.canvas.height - object.y);
  }
  if (includesAny(text, ["smaller", "nho hon", "thu nho"])) {
    if (object.type === "text") {
      patch.fontSize = Math.max(8, Math.round((object.fontSize ?? 36) * 0.88));
    }
    patch.width = clamp(Math.round(object.width * 0.9), 24, document.canvas.width - object.x);
    patch.height = clamp(Math.round(object.height * 0.9), 24, document.canvas.height - object.y);
  }
  return patch;
}

function visibilityPatch(text) {
  if (includesAny(text, ["hide", "an di", "an doi tuong", "an layer", "hidden"])) return { visible: false };
  if (includesAny(text, ["show", "hien", "visible"])) return { visible: true };
  return {};
}

function addObjectOps(document, text) {
  const ops = [];
  if (includesAny(text, ["badge", "sale", "promo", "uu dai", "khuyen mai"])) {
    ops.push({
      type: "addObject",
      object: {
        id: uniqueObjectId(document, "promo-badge"),
        name: "Promo Badge",
        type: "badge",
        role: "promo-badge",
        x: Math.round(document.canvas.width * 0.68),
        y: Math.round(document.canvas.height * 0.12),
        width: Math.round(document.canvas.width * 0.2),
        height: Math.round(document.canvas.width * 0.2),
        rotation: -8,
        opacity: 1,
        zIndex: Math.max(...document.objects.map((object) => object.zIndex), 0) + 10,
        content: includesAny(text, ["sale"]) ? "SALE" : "PROMO",
        fill: { type: "solid", color: "#201b16" },
      },
    });
  } else if (includesAny(text, ["add text", "them text", "them chu", "new text"])) {
    ops.push({
      type: "addObject",
      object: {
        id: uniqueObjectId(document, "assistant-text"),
        name: "Assistant Text",
        type: "text",
        role: "support-copy",
        x: Math.round(document.canvas.width * 0.18),
        y: Math.round(document.canvas.height * 0.76),
        width: Math.round(document.canvas.width * 0.64),
        height: Math.round(document.canvas.height * 0.08),
        rotation: 0,
        opacity: 1,
        zIndex: Math.max(...document.objects.map((object) => object.zIndex), 0) + 10,
        content: "New message",
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: Math.max(24, Math.round(document.canvas.width * 0.045)),
        fontWeight: 700,
        color: "#201b16",
        align: "center",
      },
    });
  }
  return ops;
}

export class MockLayoutPatchProvider {
  id = "mock-layout-patch-v1";

  planPatch({ document, instruction, selectedObjectIds = [] }) {
    const normalized = normalizeLayoutDocument(document);
    const text = normalizeText(instruction);
    const warnings = [];
    const ops = [...addObjectOps(normalized, text)];
    const targets = semanticTargets(normalized, text, selectedObjectIds);

    for (const object of targets) {
      if (object.locked) {
        warnings.push(`Skipped locked object "${object.name}".`);
        continue;
      }
      const patch = {
        ...movementPatch(object, normalized, text),
        ...scalePatch(object, normalized, text),
        ...visibilityPatch(text),
      };
      if (Object.keys(patch).length > 0) {
        ops.push({ type: "updateObject", id: object.id, patch });
      }
    }

    if (ops.length === 0) {
      warnings.push("Mock patch provider did not find an actionable layout edit in the instruction.");
    }

    const preview = applyLayoutPatch(normalized, ops);
    return {
      provider: this.id,
      instruction,
      ops: preview.appliedOps,
      document: preview.document,
      opSummaries: summarizeOps(normalized, preview.appliedOps),
      warnings,
      confidence: ops.length > 0 ? 0.74 : 0.25,
    };
  }
}

export class OpenAILayoutPatchProvider {
  constructor({ model = process.env.OPENAI_PATCH_MODEL ?? process.env.OPENAI_VISION_MODEL ?? "gpt-5.5" } = {}) {
    this.id = "openai-layout-patch";
    this.model = model;
  }

  async planPatch({ document, instruction, selectedObjectIds = [] }) {
    const normalized = normalizeLayoutDocument(document);
    const response = await openAiJson("/responses", {
      model: this.model,
      input: [
        {
          role: "system",
          content: [
            "You plan safe edits for a DOM-first image layout editor.",
            "Return only structured patch operations, never HTML or CSS.",
            "Use absolute pixel values in the LayoutDocument coordinate system.",
            "Use existing object ids for updateObject, removeObject, and reorderObject.",
            "Prefer selectedObjectIds when the instruction is ambiguous.",
            "Do not edit locked objects except name, visible, opacity, or locked.",
            "Keep changes small and directly tied to the user's instruction.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                instruction,
                selectedObjectIds,
                layout: compactDocumentForPrompt(normalized),
              }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "layout_patch_plan",
          strict: true,
          schema: openAiPatchPlanSchema,
        },
      },
    });

    const plan = responseJson(response);
    const normalizedPlan = normalizeOpenAiOps(normalized, plan.ops);
    const warnings = [
      ...(Array.isArray(plan.warnings) ? plan.warnings : []),
      ...normalizedPlan.warnings,
    ];
    if (normalizedPlan.ops.length === 0) {
      warnings.push("OpenAI patch provider did not return an actionable layout edit.");
    }

    const preview = applyLayoutPatch(normalized, normalizedPlan.ops);
    return {
      provider: this.id,
      model: this.model,
      instruction,
      ops: preview.appliedOps,
      document: preview.document,
      opSummaries: summarizeOps(normalized, preview.appliedOps),
      warnings,
      confidence: isFiniteNumber(plan.confidence) ? clamp(plan.confidence, 0, 1) : 0.5,
    };
  }
}

export function createMockLayoutPatchProvider() {
  return new MockLayoutPatchProvider();
}

export function createLayoutPatchProvider({ provider = process.env.LAYOUT_PATCH_PROVIDER ?? "mock" } = {}) {
  if (provider === "openai") {
    return new OpenAILayoutPatchProvider();
  }
  if (provider === "mock" || provider === "mock-local") {
    return new MockLayoutPatchProvider();
  }
  const error = new Error(`Unsupported layout patch provider "${provider}"`);
  error.statusCode = 400;
  throw error;
}
