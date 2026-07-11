import { applyLayoutPatch } from "./layout-commands.mjs";
import { normalizeLayoutDocument } from "./layout-normalizer.mjs";

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

function uniqueObjectId(document, base) {
  const root = String(base).replace(/[^a-z0-9-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "object";
  const usedIds = new Set(document.objects.map((object) => object.id));
  if (!usedIds.has(root)) return root;
  let index = 2;
  while (usedIds.has(`${root}-${index}`)) index += 1;
  return `${root}-${index}`;
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
      warnings,
      confidence: ops.length > 0 ? 0.74 : 0.25,
    };
  }
}

export function createLayoutPatchProvider() {
  return new MockLayoutPatchProvider();
}
