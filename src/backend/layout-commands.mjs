import { assertValidLayoutDocument } from "./layout-validator.mjs";
import { createObjectId, normalizeLayoutDocument } from "./layout-normalizer.mjs";

const allowedPatchKeys = new Set([
  "name",
  "type",
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "opacity",
  "zIndex",
  "locked",
  "visible",
  "role",
  "style",
  "content",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "color",
  "align",
  "lineHeight",
  "assetId",
  "fit",
  "crop",
  "subjectLock",
  "promptRole",
  "fill",
  "stroke",
  "radius",
  "children",
  "analysisMeta",
]);
const lockedSafePatchKeys = new Set(["locked", "visible", "opacity", "name"]);

function commandError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sanitizePatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw commandError("patch must be an object");
  }
  if ("id" in patch) {
    throw commandError("patch cannot change object id");
  }

  const result = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!allowedPatchKeys.has(key)) {
      throw commandError(`Unsupported patch key "${key}"`);
    }
    result[key] = value;
  }
  return result;
}

function findObject(document, id) {
  const object = document.objects.find((item) => item.id === id);
  if (!object) {
    throw commandError(`Object "${id}" was not found`, 404);
  }
  return object;
}

function applyAddObject(document, op) {
  if (!op.object || typeof op.object !== "object" || Array.isArray(op.object)) {
    throw commandError("addObject requires an object");
  }
  const object = {
    ...op.object,
    id: op.object.id ?? createObjectId(op.object.name ?? op.object.type ?? "object", document),
    zIndex: op.object.zIndex ?? Math.max(-10, ...document.objects.map((item) => item.zIndex)) + 10,
  };
  document.objects.push(object);
}

function applyUpdateObject(document, op) {
  const object = findObject(document, op.id);
  const patch = sanitizePatch(op.patch);
  if (object.locked && op.allowLocked !== true) {
    const unsafeKey = Object.keys(patch).find((key) => !lockedSafePatchKeys.has(key));
    if (unsafeKey) {
      throw commandError(`Object "${op.id}" is locked`);
    }
  }
  Object.assign(object, patch);
}

function applyRemoveObject(document, op) {
  findObject(document, op.id);
  document.objects = document.objects.filter((object) => object.id !== op.id);
  for (const object of document.objects) {
    if (Array.isArray(object.children)) {
      object.children = object.children.filter((childId) => childId !== op.id);
    }
  }
}

function applyReorderObject(document, op) {
  const object = findObject(document, op.id);
  if (typeof op.zIndex !== "number" || !Number.isFinite(op.zIndex)) {
    throw commandError("reorderObject requires a numeric zIndex");
  }
  object.zIndex = op.zIndex;
}

function applySetCanvas(document, op) {
  if (!op.canvas || typeof op.canvas !== "object" || Array.isArray(op.canvas)) {
    throw commandError("setCanvas requires a canvas object");
  }
  document.canvas = {
    ...document.canvas,
    ...op.canvas,
    unit: "px",
  };
}

function applyReplaceAsset(document, op) {
  if (!op.asset || typeof op.asset !== "object" || Array.isArray(op.asset) || typeof op.asset.id !== "string") {
    throw commandError("replaceAsset requires an asset with id");
  }
  const index = document.assets.findIndex((asset) => asset.id === op.asset.id);
  if (index === -1) {
    document.assets.push(op.asset);
  } else {
    document.assets[index] = {
      ...document.assets[index],
      ...op.asset,
    };
  }
}

export function applyLayoutPatch(document, ops) {
  if (!Array.isArray(ops)) {
    throw commandError("ops must be an array");
  }

  const nextDocument = normalizeLayoutDocument(document);
  assertValidLayoutDocument(nextDocument);

  const appliedOps = [];
  for (const op of ops) {
    if (!op || typeof op !== "object" || typeof op.type !== "string") {
      throw commandError("Each operation must be an object with a type");
    }

    if (op.type === "addObject") {
      applyAddObject(nextDocument, op);
    } else if (op.type === "updateObject") {
      applyUpdateObject(nextDocument, op);
    } else if (op.type === "removeObject") {
      applyRemoveObject(nextDocument, op);
    } else if (op.type === "reorderObject") {
      applyReorderObject(nextDocument, op);
    } else if (op.type === "setCanvas") {
      applySetCanvas(nextDocument, op);
    } else if (op.type === "replaceAsset") {
      applyReplaceAsset(nextDocument, op);
    } else {
      throw commandError(`Unsupported operation "${op.type}"`);
    }
    appliedOps.push(op);
  }

  const normalized = normalizeLayoutDocument(nextDocument);
  assertValidLayoutDocument(normalized);
  return {
    document: normalized,
    appliedOps,
  };
}
