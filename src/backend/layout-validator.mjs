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

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function push(errors, path, message) {
  errors.push({ path, message });
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

function validateAnalysisMeta(errors, path, meta, sourceAssetId, { requireOriginalText = false } = {}) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    push(errors, path, "must include analysisMeta for source-image extraction");
    return;
  }
  if (meta.extractedFromAssetId !== sourceAssetId) {
    push(errors, `${path}.extractedFromAssetId`, `must equal source asset "${sourceAssetId}"`);
  }
  if (!isNumber(meta.extractionConfidence) || meta.extractionConfidence < 0 || meta.extractionConfidence > 1) {
    push(errors, `${path}.extractionConfidence`, "must be a number between 0 and 1");
  }
  if (!isBox(meta.sourceBBox)) {
    push(errors, `${path}.sourceBBox`, "must be a positive source bounding box");
  }
  if (requireOriginalText && (typeof meta.originalText !== "string" || meta.originalText.length === 0)) {
    push(errors, `${path}.originalText`, "must be present for extracted text objects");
  }
}

function validateSourceImageExtraction(errors, doc, assetIds) {
  if (doc.meta?.workflow !== "source-image-layout-extraction") {
    return;
  }

  const sourceAssetId = doc.meta?.sourceAssetId;
  if (typeof sourceAssetId !== "string" || sourceAssetId.length === 0) {
    push(errors, "meta.sourceAssetId", "must be set for source-image extraction");
    return;
  }
  const sourceAsset = (Array.isArray(doc.assets) ? doc.assets : []).find((asset) => asset?.id === sourceAssetId);
  if (!sourceAsset) {
    push(errors, "meta.sourceAssetId", `unknown asset "${sourceAssetId}"`);
    return;
  }
  if (sourceAsset.kind !== "source-layout") {
    push(errors, `assets.${sourceAssetId}.kind`, 'must be "source-layout" for source-image extraction');
  }
  if (!assetIds.has(sourceAssetId)) {
    push(errors, "meta.sourceAssetId", `unknown asset "${sourceAssetId}"`);
  }

  const underlays = doc.objects.filter((object) => object?.role === "source-underlay" || object?.id === "source-underlay");
  if (underlays.length !== 1) {
    push(errors, "objects", "source-image extraction must include exactly one source-underlay object");
    return;
  }

  const underlay = underlays[0];
  const underlayIndex = doc.objects.indexOf(underlay);
  if (underlay.type !== "image") {
    push(errors, `objects[${underlayIndex}].type`, 'source-underlay must be an "image" object');
  }
  if (underlay.locked !== true) {
    push(errors, `objects[${underlayIndex}].locked`, "source-underlay must be locked");
  }
  if (underlay.assetId !== sourceAssetId) {
    push(errors, `objects[${underlayIndex}].assetId`, "source-underlay must reference meta.sourceAssetId");
  }
  validateAnalysisMeta(errors, `objects[${underlayIndex}].analysisMeta`, underlay.analysisMeta, sourceAssetId);

  const extractedObjects = doc.objects.filter((object) => object !== underlay);
  if (extractedObjects.length < 3) {
    push(errors, "objects", "source-image extraction must include editable extracted objects above the underlay");
  }

  const underlayZ = isNumber(underlay.zIndex) ? underlay.zIndex : 0;
  extractedObjects.forEach((object) => {
    const index = doc.objects.indexOf(object);
    if (isNumber(object.zIndex) && object.zIndex <= underlayZ) {
      push(errors, `objects[${index}].zIndex`, "extracted objects must sit above source-underlay");
    }
    validateAnalysisMeta(errors, `objects[${index}].analysisMeta`, object.analysisMeta, sourceAssetId, {
      requireOriginalText: object.type === "text",
    });
  });
}

export function validateLayoutDocument(doc) {
  const errors = [];

  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return [{ path: "document", message: "must be an object" }];
  }

  if (typeof doc.version !== "string" || doc.version.length === 0) {
    push(errors, "version", "must be a non-empty string");
  }

  if (!doc.canvas || typeof doc.canvas !== "object" || Array.isArray(doc.canvas)) {
    push(errors, "canvas", "must be an object");
  } else {
    if (!isNumber(doc.canvas.width) || doc.canvas.width <= 0) {
      push(errors, "canvas.width", "must be a positive number");
    }
    if (!isNumber(doc.canvas.height) || doc.canvas.height <= 0) {
      push(errors, "canvas.height", "must be a positive number");
    }
    if (doc.canvas.unit !== "px") {
      push(errors, "canvas.unit", 'must be "px"');
    }
  }

  if (!Array.isArray(doc.assets)) {
    push(errors, "assets", "must be an array");
  }

  if (!Array.isArray(doc.objects)) {
    push(errors, "objects", "must be an array");
    return errors;
  }

  const assetIds = new Set((Array.isArray(doc.assets) ? doc.assets : []).map((asset) => asset?.id));
  const objectIds = new Set();

  doc.objects.forEach((object, index) => {
    const base = `objects[${index}]`;
    if (!object || typeof object !== "object" || Array.isArray(object)) {
      push(errors, base, "must be an object");
      return;
    }

    if (typeof object.id !== "string" || object.id.length === 0) {
      push(errors, `${base}.id`, "must be a non-empty string");
    } else if (objectIds.has(object.id)) {
      push(errors, `${base}.id`, `duplicate id "${object.id}"`);
    } else {
      objectIds.add(object.id);
    }

    if (typeof object.name !== "string" || object.name.length === 0) {
      push(errors, `${base}.name`, "must be a non-empty string");
    }

    if (!supportedTypes.has(object.type)) {
      push(errors, `${base}.type`, `unsupported type "${object.type}"`);
    }

    for (const key of ["x", "y", "width", "height", "rotation", "opacity", "zIndex"]) {
      if (!isNumber(object[key])) {
        push(errors, `${base}.${key}`, "must be a finite number");
      }
    }

    if (isNumber(object.width) && object.width <= 0) {
      push(errors, `${base}.width`, "must be greater than 0");
    }
    if (isNumber(object.height) && object.height <= 0) {
      push(errors, `${base}.height`, "must be greater than 0");
    }
    if (isNumber(object.opacity) && (object.opacity < 0 || object.opacity > 1)) {
      push(errors, `${base}.opacity`, "must be between 0 and 1");
    }

    if (["image", "product-image", "logo", "icon"].includes(object.type) && object.assetId && !assetIds.has(object.assetId)) {
      push(errors, `${base}.assetId`, `unknown asset "${object.assetId}"`);
    }
  });

  doc.objects.forEach((object, index) => {
    if (!object || object.type !== "group") {
      return;
    }

    const base = `objects[${index}].children`;
    if (!Array.isArray(object.children)) {
      push(errors, base, "group must have a children array");
      return;
    }

    object.children.forEach((childId, childIndex) => {
      if (childId === object.id) {
        push(errors, `${base}[${childIndex}]`, "group cannot include itself");
      } else if (!objectIds.has(childId)) {
        push(errors, `${base}[${childIndex}]`, `unknown child "${childId}"`);
      }
    });
  });

  validateSourceImageExtraction(errors, doc, assetIds);

  return errors;
}

export function assertValidLayoutDocument(doc) {
  const errors = validateLayoutDocument(doc);
  if (errors.length > 0) {
    const message = errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    const validationError = new Error(`Invalid LayoutDocument: ${message}`);
    validationError.statusCode = 400;
    validationError.errors = errors;
    throw validationError;
  }
}
