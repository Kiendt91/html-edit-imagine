const defaultCanvas = {
  width: 1080,
  height: 1350,
  unit: "px",
  background: {
    type: "solid",
    color: "#f6efe5",
  },
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
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

function uniqueId(base, usedIds) {
  const root = slugify(base);
  if (!usedIds.has(root)) {
    usedIds.add(root);
    return root;
  }

  let index = 2;
  while (usedIds.has(`${root}-${index}`)) {
    index += 1;
  }
  const id = `${root}-${index}`;
  usedIds.add(id);
  return id;
}

function normalizeCanvas(canvas = {}) {
  const width = isNumber(canvas.width) && canvas.width > 0 ? Math.round(canvas.width) : defaultCanvas.width;
  const height = isNumber(canvas.height) && canvas.height > 0 ? Math.round(canvas.height) : defaultCanvas.height;
  return {
    ...defaultCanvas,
    ...canvas,
    width,
    height,
    unit: "px",
  };
}

function normalizeAsset(asset, index, usedIds) {
  const base = asset?.id ?? asset?.name ?? `asset-${index + 1}`;
  return {
    ...(asset && typeof asset === "object" ? asset : {}),
    id: uniqueId(base, usedIds),
    type: typeof asset?.type === "string" ? asset.type : "image",
    name: typeof asset?.name === "string" && asset.name.length > 0 ? asset.name : `Asset ${index + 1}`,
  };
}

function normalizeObject(object, index, canvas, usedIds) {
  const source = object && typeof object === "object" ? object : {};
  const id = uniqueId(source.id ?? source.name ?? source.role ?? `object-${index + 1}`, usedIds);
  const type = typeof source.type === "string" && source.type.length > 0 ? source.type : "rectangle";
  const width = Math.max(1, Math.round(isNumber(source.width) ? source.width : canvas.width * 0.2));
  const height = Math.max(1, Math.round(isNumber(source.height) ? source.height : canvas.height * 0.1));
  const maxX = Math.max(0, canvas.width - Math.min(width, canvas.width));
  const maxY = Math.max(0, canvas.height - Math.min(height, canvas.height));

  return {
    ...source,
    id,
    name: typeof source.name === "string" && source.name.length > 0 ? source.name : id,
    type,
    x: clamp(Math.round(isNumber(source.x) ? source.x : 0), 0, maxX),
    y: clamp(Math.round(isNumber(source.y) ? source.y : 0), 0, maxY),
    width,
    height,
    rotation: isNumber(source.rotation) ? source.rotation : 0,
    opacity: clamp(isNumber(source.opacity) ? source.opacity : 1, 0, 1),
    zIndex: isNumber(source.zIndex) ? source.zIndex : index * 10,
    visible: source.visible === false ? false : true,
  };
}

export function normalizeLayoutDocument(document) {
  const source = document && typeof document === "object" ? deepClone(document) : {};
  const canvas = normalizeCanvas(source.canvas);
  const assetIds = new Set();
  const objectIds = new Set();
  const assets = Array.isArray(source.assets) ? source.assets.map((asset, index) => normalizeAsset(asset, index, assetIds)) : [];
  const objects = Array.isArray(source.objects) ? source.objects.map((object, index) => normalizeObject(object, index, canvas, objectIds)) : [];

  return {
    version: typeof source.version === "string" && source.version.length > 0 ? source.version : "0.1.0",
    canvas,
    assets,
    objects,
    guides: Array.isArray(source.guides) ? source.guides : [],
    meta: source.meta && typeof source.meta === "object" ? source.meta : {},
  };
}

export function createObjectId(label, document) {
  const usedIds = new Set((document.objects ?? []).map((object) => object.id));
  return uniqueId(label, usedIds);
}
