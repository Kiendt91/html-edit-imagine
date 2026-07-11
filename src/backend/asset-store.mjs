import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const mimeExtensions = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/svg+xml", ".svg"],
]);

function slugify(value, fallback = "asset") {
  const slug = String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  return slug || fallback;
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) {
    const error = new Error("asset dataUrl must be a valid data URL");
    error.statusCode = 400;
    throw error;
  }
  const mimeType = match[1].toLowerCase();
  const isBase64 = Boolean(match[2]);
  const payload = match[3];
  return {
    mimeType,
    buffer: isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8"),
  };
}

function readPng(buffer) {
  if (buffer.length < 33 || buffer.toString("ascii", 1, 4) !== "PNG") {
    return null;
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer.readUInt8(25);
  return {
    width,
    height,
    hasAlpha: colorType === 4 || colorType === 6,
  };
}

function readGif(buffer) {
  const header = buffer.toString("ascii", 0, 6);
  if (header !== "GIF87a" && header !== "GIF89a") {
    return null;
  }
  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
    hasAlpha: false,
  };
}

function readJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
        hasAlpha: false,
      };
    }
    offset += 2 + length;
  }
  return null;
}

function readSvg(buffer) {
  const text = buffer.toString("utf8", 0, Math.min(buffer.length, 4096));
  if (!text.includes("<svg")) {
    return null;
  }
  const width = Number(/width=["']?([\d.]+)/i.exec(text)?.[1]);
  const height = Number(/height=["']?([\d.]+)/i.exec(text)?.[1]);
  const viewBox = /viewBox=["']([\d.\s-]+)["']/i.exec(text)?.[1]?.trim().split(/\s+/).map(Number);
  return {
    width: Number.isFinite(width) && width > 0 ? width : viewBox?.[2] ?? 1024,
    height: Number.isFinite(height) && height > 0 ? height : viewBox?.[3] ?? 1024,
    hasAlpha: true,
  };
}

function analyzeImage(buffer, mimeType) {
  const info = mimeType === "image/png" ? readPng(buffer) : mimeType === "image/jpeg" ? readJpeg(buffer) : mimeType === "image/gif" ? readGif(buffer) : mimeType === "image/svg+xml" ? readSvg(buffer) : null;
  return {
    width: Math.round(info?.width ?? 0),
    height: Math.round(info?.height ?? 0),
    analysis: {
      hasAlpha: Boolean(info?.hasAlpha),
      backgroundKind: info?.hasAlpha ? "transparent" : "unknown",
      suggestedFit: "contain",
    },
  };
}

export class AssetStore {
  constructor({ assetsDir }) {
    this.assetsDir = assetsDir;
    this.indexPath = path.join(assetsDir, "assets.json");
  }

  async ensureReady() {
    await fs.mkdir(this.assetsDir, { recursive: true });
    try {
      await fs.access(this.indexPath);
    } catch {
      await fs.writeFile(this.indexPath, "[]", "utf8");
    }
  }

  async listAssets() {
    await this.ensureReady();
    return JSON.parse(await fs.readFile(this.indexPath, "utf8"));
  }

  async writeIndex(assets) {
    await fs.writeFile(this.indexPath, JSON.stringify(assets, null, 2), "utf8");
  }

  async getAsset(id) {
    const asset = (await this.listAssets()).find((item) => item.id === id);
    if (!asset) {
      const error = new Error(`Asset "${id}" was not found`);
      error.statusCode = 404;
      throw error;
    }
    return asset;
  }

  async createAsset({ name, kind = "product", dataUrl }) {
    await this.ensureReady();
    if (!dataUrl || typeof dataUrl !== "string") {
      const error = new Error("dataUrl is required");
      error.statusCode = 400;
      throw error;
    }
    const { mimeType, buffer } = parseDataUrl(dataUrl);
    if (!mimeType.startsWith("image/")) {
      const error = new Error("Only image assets are supported");
      error.statusCode = 400;
      throw error;
    }
    const extension = mimeExtensions.get(mimeType) ?? ".img";
    const id = `asset-${slugify(kind)}-${crypto.randomUUID().slice(0, 8)}`;
    const folder = path.join(this.assetsDir, id);
    await fs.mkdir(folder, { recursive: true });
    const fileName = `original${extension}`;
    const absolutePath = path.join(folder, fileName);
    await fs.writeFile(absolutePath, buffer);

    const imageInfo = analyzeImage(buffer, mimeType);
    const asset = {
      id,
      type: "image",
      kind,
      name: name ?? id,
      src: `/assets/${id}/${fileName}`,
      filePath: path.relative(path.resolve(this.assetsDir, "..", ".."), absolutePath).replaceAll("\\", "/"),
      mimeType,
      width: imageInfo.width,
      height: imageInfo.height,
      analysis: imageInfo.analysis,
      createdAt: new Date().toISOString(),
    };

    const assets = await this.listAssets();
    assets.unshift(asset);
    await this.writeIndex(assets);
    return asset;
  }

  async resolveAssetPath(id, fileName) {
    await this.getAsset(id);
    const target = path.resolve(this.assetsDir, id, fileName);
    const assetFolder = path.resolve(this.assetsDir, id);
    if (!target.startsWith(assetFolder)) {
      const error = new Error("Forbidden asset path");
      error.statusCode = 403;
      throw error;
    }
    return target;
  }

  async deleteAsset(id) {
    await this.ensureReady();
    const assets = await this.listAssets();
    const asset = assets.find((item) => item.id === id);
    if (!asset) {
      const error = new Error(`Asset "${id}" was not found`);
      error.statusCode = 404;
      throw error;
    }
    const assetFolder = path.resolve(this.assetsDir, id);
    const assetsRoot = path.resolve(this.assetsDir);
    if (!assetFolder.startsWith(assetsRoot)) {
      const error = new Error("Forbidden asset path");
      error.statusCode = 403;
      throw error;
    }
    await fs.rm(assetFolder, { recursive: true, force: true });
    await this.writeIndex(assets.filter((item) => item.id !== id));
    return asset;
  }
}
