#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const supportedTypes = new Set([
  "background",
  "text",
  "image",
  "rectangle",
  "circle",
  "icon",
  "logo",
  "badge",
  "feature-card",
  "product-image",
  "warning-strip",
  "decoration",
  "group",
]);

const defaultFiles = [
  path.join(__dirname, "fixtures", "valid-perfume-ad.layout.json"),
  path.join(__dirname, "fixtures", "source-image-extracted.layout.json"),
  path.join(__dirname, "fixtures", "invalid-layout.layout.json"),
];

const expectedFailures = new Set([
  path.normalize(path.join(__dirname, "fixtures", "invalid-layout.layout.json")),
]);

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function addError(errors, pathName, message) {
  errors.push(`${pathName}: ${message}`);
}

function isBox(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      isNumber(value.x) &&
      isNumber(value.y) &&
      isNumber(value.width) &&
      value.width > 0 &&
      isNumber(value.height) &&
      value.height > 0,
  );
}

function validateAnalysisMeta(errors, pathName, meta, sourceAssetId, { requireOriginalText = false } = {}) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    addError(errors, pathName, "must include analysisMeta for source-image extraction");
    return;
  }
  if (meta.extractedFromAssetId !== sourceAssetId) {
    addError(errors, `${pathName}.extractedFromAssetId`, `must equal source asset "${sourceAssetId}"`);
  }
  if (!isNumber(meta.extractionConfidence) || meta.extractionConfidence < 0 || meta.extractionConfidence > 1) {
    addError(errors, `${pathName}.extractionConfidence`, "must be a number between 0 and 1");
  }
  if (!isBox(meta.sourceBBox)) {
    addError(errors, `${pathName}.sourceBBox`, "must be a positive source bounding box");
  }
  if (requireOriginalText && (typeof meta.originalText !== "string" || meta.originalText.length === 0)) {
    addError(errors, `${pathName}.originalText`, "must be present for extracted text objects");
  }
}

function validateSourceImageExtraction(errors, doc, assetIds) {
  if (doc.meta?.workflow !== "source-image-layout-extraction") {
    return;
  }

  const sourceAssetId = doc.meta?.sourceAssetId;
  if (typeof sourceAssetId !== "string" || sourceAssetId.length === 0) {
    addError(errors, "meta.sourceAssetId", "must be set for source-image extraction");
    return;
  }
  const sourceAsset = (Array.isArray(doc.assets) ? doc.assets : []).find((asset) => asset?.id === sourceAssetId);
  if (!sourceAsset) {
    addError(errors, "meta.sourceAssetId", `unknown asset "${sourceAssetId}"`);
    return;
  }
  if (sourceAsset.kind !== "source-layout") {
    addError(errors, `assets.${sourceAssetId}.kind`, 'must be "source-layout" for source-image extraction');
  }
  if (!assetIds.has(sourceAssetId)) {
    addError(errors, "meta.sourceAssetId", `unknown asset "${sourceAssetId}"`);
  }

  const underlays = doc.objects.filter((object) => object?.role === "source-underlay" || object?.id === "source-underlay");
  if (underlays.length !== 1) {
    addError(errors, "objects", "source-image extraction must include exactly one source-underlay object");
    return;
  }

  const underlay = underlays[0];
  const underlayIndex = doc.objects.indexOf(underlay);
  if (underlay.type !== "image") {
    addError(errors, `objects[${underlayIndex}].type`, 'source-underlay must be an "image" object');
  }
  if (underlay.locked !== true) {
    addError(errors, `objects[${underlayIndex}].locked`, "source-underlay must be locked");
  }
  if (underlay.assetId !== sourceAssetId) {
    addError(errors, `objects[${underlayIndex}].assetId`, "source-underlay must reference meta.sourceAssetId");
  }
  validateAnalysisMeta(errors, `objects[${underlayIndex}].analysisMeta`, underlay.analysisMeta, sourceAssetId);

  const extractedObjects = doc.objects.filter((object) => object !== underlay);
  if (extractedObjects.length < 3) {
    addError(errors, "objects", "source-image extraction must include editable extracted objects above the underlay");
  }

  const underlayZ = isNumber(underlay.zIndex) ? underlay.zIndex : 0;
  extractedObjects.forEach((object) => {
    const index = doc.objects.indexOf(object);
    if (isNumber(object.zIndex) && object.zIndex <= underlayZ) {
      addError(errors, `objects[${index}].zIndex`, "extracted objects must sit above source-underlay");
    }
    validateAnalysisMeta(errors, `objects[${index}].analysisMeta`, object.analysisMeta, sourceAssetId, {
      requireOriginalText: object.type === "text",
    });
  });
}

function validateLayoutDocument(doc) {
  const errors = [];

  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return ["document: must be an object"];
  }

  if (typeof doc.version !== "string" || doc.version.length === 0) {
    addError(errors, "version", "must be a non-empty string");
  }

  if (!doc.canvas || typeof doc.canvas !== "object") {
    addError(errors, "canvas", "must be an object");
  } else {
    if (!isNumber(doc.canvas.width) || doc.canvas.width <= 0) {
      addError(errors, "canvas.width", "must be a positive number");
    }
    if (!isNumber(doc.canvas.height) || doc.canvas.height <= 0) {
      addError(errors, "canvas.height", "must be a positive number");
    }
    if (doc.canvas.unit !== "px") {
      addError(errors, "canvas.unit", 'must be "px"');
    }
  }

  if (!Array.isArray(doc.assets)) {
    addError(errors, "assets", "must be an array");
  }

  if (!Array.isArray(doc.objects)) {
    addError(errors, "objects", "must be an array");
    return errors;
  }

  const assetIds = new Set((Array.isArray(doc.assets) ? doc.assets : []).map((asset) => asset.id));
  const objectIds = new Set();

  doc.objects.forEach((object, index) => {
    const pathName = `objects[${index}]`;

    if (!object || typeof object !== "object" || Array.isArray(object)) {
      addError(errors, pathName, "must be an object");
      return;
    }

    if (typeof object.id !== "string" || object.id.length === 0) {
      addError(errors, `${pathName}.id`, "must be a non-empty string");
    } else if (objectIds.has(object.id)) {
      addError(errors, `${pathName}.id`, `duplicate id "${object.id}"`);
    } else {
      objectIds.add(object.id);
    }

    if (typeof object.name !== "string" || object.name.length === 0) {
      addError(errors, `${pathName}.name`, "must be a non-empty string");
    }

    if (!supportedTypes.has(object.type)) {
      addError(errors, `${pathName}.type`, `unsupported type "${object.type}"`);
    }

    for (const key of ["x", "y", "width", "height", "rotation", "opacity", "zIndex"]) {
      if (!isNumber(object[key])) {
        addError(errors, `${pathName}.${key}`, "must be a finite number");
      }
    }

    if (isNumber(object.width) && object.width <= 0) {
      addError(errors, `${pathName}.width`, "must be greater than 0");
    }
    if (isNumber(object.height) && object.height <= 0) {
      addError(errors, `${pathName}.height`, "must be greater than 0");
    }
    if (isNumber(object.opacity) && (object.opacity < 0 || object.opacity > 1)) {
      addError(errors, `${pathName}.opacity`, "must be between 0 and 1");
    }

    if ((object.type === "image" || object.type === "product-image" || object.type === "logo" || object.type === "icon") && typeof object.assetId !== "string") {
      addError(errors, `${pathName}.assetId`, "image-like objects must reference an asset");
    }
    if (typeof object.assetId === "string" && !assetIds.has(object.assetId)) {
      addError(errors, `${pathName}.assetId`, `unknown asset "${object.assetId}"`);
    }
  });

  doc.objects.forEach((object, index) => {
    if (!object || object.type !== "group") {
      return;
    }

    const pathName = `objects[${index}].children`;
    if (!Array.isArray(object.children)) {
      addError(errors, pathName, "group must have a children array");
      return;
    }

    object.children.forEach((childId, childIndex) => {
      if (childId === object.id) {
        addError(errors, `${pathName}[${childIndex}]`, "group cannot include itself");
      } else if (!objectIds.has(childId)) {
        addError(errors, `${pathName}[${childIndex}]`, `unknown child "${childId}"`);
      }
    });
  });

  validateSourceImageExtraction(errors, doc, assetIds);

  return errors;
}

function validateRenderPolicy(policy) {
  const errors = [];
  const requiredTiers = ["liveHtmlPreview", "rasterPreview", "aiDraftStream", "finalRender"];

  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return ["render policy: must be an object"];
  }

  for (const tier of requiredTiers) {
    if (!policy[tier] || typeof policy[tier] !== "object") {
      addError(errors, tier, "must be configured");
    }
  }

  if (policy.liveHtmlPreview?.usesAi !== false) {
    addError(errors, "liveHtmlPreview.usesAi", "must be false");
  }
  if (!isNumber(policy.rasterPreview?.debounceMs) || policy.rasterPreview.debounceMs < 300) {
    addError(errors, "rasterPreview.debounceMs", "must be at least 300");
  }
  if (!isNumber(policy.aiDraftStream?.idleDebounceMs) || policy.aiDraftStream.idleDebounceMs < 1000) {
    addError(errors, "aiDraftStream.idleDebounceMs", "must be at least 1000");
  }
  if (policy.aiDraftStream?.requiresJobId !== true) {
    addError(errors, "aiDraftStream.requiresJobId", "must be true");
  }
  if (policy.aiDraftStream?.requiresDocumentHash !== true) {
    addError(errors, "aiDraftStream.requiresDocumentHash", "must be true");
  }
  if (policy.finalRender?.requiresUserAction !== true) {
    addError(errors, "finalRender.requiresUserAction", "must be true");
  }

  return errors;
}

function runLayoutFile(filePath) {
  const doc = readJson(filePath);
  return validateLayoutDocument(doc);
}

function printResult(label, errors, expectedFailure = false) {
  const passed = errors.length === 0;
  const ok = expectedFailure ? !passed : passed;
  const status = ok && expectedFailure ? "PASS expected failure" : ok ? "PASS" : "FAIL";
  console.log(`${status} ${label}`);

  if (!ok || (expectedFailure && errors.length > 0)) {
    for (const error of errors) {
      console.log(`  - ${error}`);
    }
  }

  return ok;
}

function main() {
  const userFiles = process.argv.slice(2).map((file) => path.resolve(process.cwd(), file));
  const files = userFiles.length > 0 ? userFiles : defaultFiles;
  let ok = true;

  for (const file of files) {
    const normalized = path.normalize(file);
    const expectedFailure = userFiles.length === 0 && expectedFailures.has(normalized);
    try {
      const errors = runLayoutFile(file);
      ok = printResult(path.relative(rootDir, file), errors, expectedFailure) && ok;
    } catch (error) {
      ok = false;
      console.log(`FAIL ${path.relative(rootDir, file)}`);
      console.log(`  - ${error.message}`);
    }
  }

  if (userFiles.length === 0) {
    const policyFile = path.join(__dirname, "render-stream.policy.json");
    try {
      const errors = validateRenderPolicy(readJson(policyFile));
      ok = printResult(path.relative(rootDir, policyFile), errors) && ok;
    } catch (error) {
      ok = false;
      console.log(`FAIL ${path.relative(rootDir, policyFile)}`);
      console.log(`  - ${error.message}`);
    }
  }

  process.exitCode = ok ? 0 : 1;
}

main();
