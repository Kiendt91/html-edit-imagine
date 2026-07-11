import path from "node:path";
import fs from "node:fs";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cssValue(value, fallback = "") {
  return value === undefined || value === null ? fallback : String(value);
}

function fillToCss(fill, fallback = "transparent") {
  if (!fill || typeof fill !== "object") {
    return fallback;
  }
  if (fill.type === "solid") {
    return fill.color ?? fallback;
  }
  if (fill.type === "linear-gradient") {
    return `linear-gradient(145deg, ${fill.from ?? fallback}, ${fill.to ?? fallback})`;
  }
  if (fill.type === "radial-gradient") {
    return `radial-gradient(circle, ${fill.inner ?? fallback}, ${fill.outer ?? "transparent"})`;
  }
  return fallback;
}

function objectBaseStyle(object) {
  const zIndex = Number.isFinite(object.zIndex) ? object.zIndex + 10000 : 10000;
  return [
    "position:absolute",
    `left:${object.x}px`,
    `top:${object.y}px`,
    `width:${object.width}px`,
    `height:${object.height}px`,
    `opacity:${object.opacity}`,
    `z-index:${zIndex}`,
    `transform:rotate(${object.rotation}deg)`,
    "transform-origin:center center",
    "box-sizing:border-box",
  ].join(";");
}

function dataAttrs(object) {
  return `data-object-id="${escapeHtml(object.id)}" data-object-type="${escapeHtml(object.type)}" data-role="${escapeHtml(object.role ?? "")}"`;
}

function renderText(object) {
  const style = [
    objectBaseStyle(object),
    "display:flex",
    "align-items:center",
    object.align === "center" ? "justify-content:center" : object.align === "right" ? "justify-content:flex-end" : "justify-content:flex-start",
    `text-align:${cssValue(object.align, "left")}`,
    `font-family:${cssValue(object.fontFamily, "Inter, Arial, sans-serif")}`,
    `font-size:${cssValue(object.fontSize, 32)}px`,
    `font-weight:${cssValue(object.fontWeight, 500)}`,
    `line-height:${cssValue(object.lineHeight, 1.1)}`,
    `color:${cssValue(object.color, "#111")}`,
    "letter-spacing:0",
    "overflow:hidden",
    "padding:6px",
  ].join(";");

  return `<div ${dataAttrs(object)} class="layout-object text-object" style="${style}">${escapeHtml(object.content)}</div>`;
}

function renderRectangle(object) {
  const style = [
    objectBaseStyle(object),
    object.content ? "display:flex" : "",
    object.content ? "align-items:center" : "",
    object.content ? "justify-content:center" : "",
    object.content ? "text-align:center" : "",
    object.content ? "font:800 24px/1 Inter, Arial, sans-serif" : "",
    object.content ? "color:#fff7ec" : "",
    object.content ? "letter-spacing:0" : "",
    `background:${fillToCss(object.fill, "rgba(255,255,255,0.5)")}`,
    `border-radius:${cssValue(object.radius, 0)}px`,
    object.stroke ? `border:${cssValue(object.stroke.width, 1)}px solid ${cssValue(object.stroke.color, "#111")}` : "border:0",
  ].filter(Boolean).join(";");
  return `<div ${dataAttrs(object)} class="layout-object shape-object" style="${style}">${escapeHtml(object.content ?? "")}</div>`;
}

function renderCircle(object) {
  const style = [
    objectBaseStyle(object),
    `background:${fillToCss(object.fill, "rgba(255,255,255,0.65)")}`,
    "border-radius:9999px",
    "filter:blur(0px)",
  ].join(";");
  return `<div ${dataAttrs(object)} class="layout-object circle-object" style="${style}"></div>`;
}

function assetSource(document, object, rootDir) {
  const asset = document.assets?.find((item) => item.id === object.assetId);
  if (!asset?.src && !asset?.filePath) {
    return null;
  }
  if (asset.filePath) {
    const absolute = path.resolve(rootDir, asset.filePath);
    if (fs.existsSync(absolute)) {
      return `file:///${absolute.replaceAll("\\", "/")}`;
    }
  }
  if (/^(https?:|data:|file:)/.test(asset.src)) {
    return asset.src;
  }
  if (asset.src?.startsWith("/assets/")) {
    return null;
  }
  const absolute = path.resolve(rootDir, asset.src);
  if (!fs.existsSync(absolute)) {
    return null;
  }
  return `file:///${absolute.replaceAll("\\", "/")}`;
}

function renderImagePlaceholder(object) {
  const label = escapeHtml(object.content || object.name || object.role || "IMAGE");
  if (object.type === "product-image") {
    return `<div class="product-bottle"><div class="product-cap"></div><div class="product-neck"></div><div class="product-glass"><div class="product-label">${label}</div></div><div class="product-shadow"></div></div>`;
  }
  if (object.type === "logo") {
    return `<div class="logo-placeholder">${label}</div>`;
  }
  return `<div class="image-placeholder">${label}</div>`;
}

function renderImageLike(document, object, rootDir) {
  const src = assetSource(document, object, rootDir);
  const style = [
    objectBaseStyle(object),
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "overflow:hidden",
  ].join(";");

  if (src) {
    const fit = object.fit ?? "contain";
    return `<div ${dataAttrs(object)} class="layout-object image-object" style="${style}"><img src="${escapeHtml(src)}" alt="${escapeHtml(object.name)}" style="width:100%;height:100%;object-fit:${escapeHtml(fit)};display:block"></div>`;
  }

  return `<div ${dataAttrs(object)} class="layout-object image-object placeholder-${escapeHtml(object.type)}" style="${style}">${renderImagePlaceholder(object)}</div>`;
}

function renderBadge(object) {
  const style = [
    objectBaseStyle(object),
    "display:flex",
    "align-items:center",
    "justify-content:center",
    `background:${fillToCss(object.fill, "#1f1914")}`,
    "color:#fff7ec",
    "border-radius:999px",
    "font-family:Inter, Arial, sans-serif",
    "font-size:24px",
    "font-weight:800",
    "letter-spacing:0",
    "box-shadow:0 18px 34px rgba(31,25,20,0.18)",
    "padding:10px 24px",
    "text-align:center",
  ].join(";");
  return `<div ${dataAttrs(object)} class="layout-object badge-object" style="${style}">${escapeHtml(object.content ?? object.name)}</div>`;
}

function renderObject(document, object, rootDir, options = {}) {
  if (object.visible === false) {
    return "";
  }
  if (options.hideSourceUnderlay && object.role === "source-underlay") {
    return "";
  }
  if (object.type === "text") {
    return renderText(object);
  }
  if (object.type === "rectangle" || object.type === "background" || object.type === "decoration" || object.type === "feature-card" || object.type === "warning-strip") {
    return renderRectangle(object);
  }
  if (object.type === "circle") {
    return renderCircle(object);
  }
  if (["image", "product-image", "logo", "icon"].includes(object.type)) {
    return renderImageLike(document, object, rootDir);
  }
  if (object.type === "badge") {
    return renderBadge(object);
  }
  return "";
}

function renderObjectList(document, rootDir) {
  return renderObjectListWithOptions(document, rootDir);
}

function renderObjectListWithOptions(document, rootDir, options = {}) {
  return [...document.objects]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((object) => renderObject(document, object, rootDir, options))
    .join("\n");
}

function renderLayerItems(document) {
  return [...document.objects]
    .sort((a, b) => b.zIndex - a.zIndex)
    .map((object) => `<li><span>${escapeHtml(object.name)}</span><code>${escapeHtml(object.type)}</code></li>`)
    .join("\n");
}

export function renderLayoutHtml(document, options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const title = document.meta?.title ?? "AI Layout Studio Preview";
  const prompt = options.prompt ?? "";
  const showObjectGuides = options.showObjectGuides !== false;
  const hideSourceUnderlay = showObjectGuides === false && document.meta?.workflow === "source-image-layout-extraction";
  const canvasBackground = fillToCss(document.canvas.background, "#f6efe5");
  const objects = renderObjectListWithOptions(document, rootDir, { hideSourceUnderlay });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, Arial, sans-serif;
      background: #202020;
      color: #f8f8f8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #202020;
    }
    .preview-shell {
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr) 340px;
      gap: 0;
      min-height: 100vh;
    }
    .panel {
      background: #f4f1ec;
      color: #201b16;
      border-right: 1px solid rgba(0,0,0,0.12);
      padding: 18px;
      overflow: auto;
    }
    .panel.right {
      border-right: 0;
      border-left: 1px solid rgba(0,0,0,0.12);
    }
    .panel h1, .panel h2 {
      margin: 0 0 14px;
      font-size: 18px;
      line-height: 1.2;
    }
    .panel p {
      margin: 0 0 12px;
      color: #5b5148;
      line-height: 1.45;
      font-size: 13px;
    }
    .layers {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 8px;
    }
    .layers li {
      min-height: 38px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 8px 10px;
      border: 1px solid rgba(0,0,0,0.1);
      background: rgba(255,255,255,0.58);
      border-radius: 6px;
      font-size: 13px;
    }
    .layers code {
      font-size: 11px;
      color: #76685d;
      white-space: nowrap;
    }
    .stage-wrap {
      min-width: 0;
      overflow: auto;
      padding: 32px;
      display: grid;
      place-items: start center;
      background:
        linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%),
        linear-gradient(-45deg, rgba(255,255,255,0.05) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.05) 75%),
        linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.05) 75%);
      background-size: 28px 28px;
      background-position: 0 0, 0 14px, 14px -14px, -14px 0px;
    }
    .layout-canvas {
      width: ${document.canvas.width}px;
      height: ${document.canvas.height}px;
      position: relative;
      overflow: hidden;
      background: ${canvasBackground};
      box-shadow: 0 28px 80px rgba(0,0,0,0.32);
    }
    .layout-object {
      outline: ${showObjectGuides ? "2px solid rgba(48, 116, 255, 0.22)" : "0"};
      outline-offset: -2px;
    }
    .layout-object::after {
      content: ${showObjectGuides ? "attr(data-role)" : '""'};
      position: absolute;
      left: 8px;
      top: 8px;
      display: ${showObjectGuides ? "block" : "none"};
      max-width: calc(100% - 16px);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font: 600 12px/1 Inter, Arial, sans-serif;
      color: rgba(36, 64, 110, 0.58);
      pointer-events: none;
    }
    .text-object::after,
    .badge-object::after,
    .placeholder-logo::after {
      content: "";
    }
    .image-placeholder,
    .logo-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px dashed rgba(36, 64, 110, 0.38);
      background: rgba(255,255,255,0.34);
      color: #3b332c;
      font-weight: 800;
      text-align: center;
    }
    .logo-placeholder {
      border: 0;
      background: transparent;
      justify-content: flex-start;
      font: 800 24px/1.05 Inter, Arial, sans-serif;
      letter-spacing: 0;
    }
    .product-bottle {
      width: 72%;
      height: 100%;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
    }
    .product-cap {
      width: 118px;
      height: 72px;
      border-radius: 24px 24px 10px 10px;
      background: linear-gradient(135deg, #24201c, #82705c);
      box-shadow: inset 18px 0 28px rgba(255,255,255,0.16);
      margin-top: 18px;
      z-index: 3;
    }
    .product-neck {
      width: 82px;
      height: 72px;
      background: linear-gradient(90deg, #f4e1c5, #fffaf0 45%, #d7b98f);
      border: 1px solid rgba(80,58,38,0.24);
      z-index: 2;
    }
    .product-glass {
      width: 292px;
      height: 410px;
      border-radius: 66px 66px 86px 86px;
      background:
        linear-gradient(110deg, rgba(255,255,255,0.9), rgba(255,255,255,0.18) 24%, rgba(220,184,138,0.45) 48%, rgba(255,255,255,0.68) 76%),
        linear-gradient(180deg, rgba(251,235,208,0.72), rgba(212,157,91,0.34));
      border: 2px solid rgba(117,85,55,0.26);
      box-shadow: 0 36px 60px rgba(82,55,28,0.24), inset 28px 0 46px rgba(255,255,255,0.46);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .product-label {
      width: 178px;
      height: 112px;
      border: 1px solid rgba(66,49,35,0.32);
      background: rgba(255,249,237,0.72);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #2d241d;
      font: 800 24px/1 Inter, Arial, sans-serif;
    }
    .product-shadow {
      width: 330px;
      height: 42px;
      margin-top: 20px;
      border-radius: 999px;
      background: radial-gradient(ellipse, rgba(53,37,24,0.28), rgba(53,37,24,0));
    }
    .prompt-box {
      padding: 12px;
      border: 1px solid rgba(0,0,0,0.12);
      background: rgba(255,255,255,0.58);
      border-radius: 6px;
      font-size: 13px;
      line-height: 1.45;
      white-space: pre-wrap;
    }
    @media (max-width: 1000px) {
      .preview-shell { grid-template-columns: 1fr; }
      .panel { display: none; }
      .stage-wrap { padding: 16px; place-items: start; }
    }
  </style>
</head>
<body>
  <main class="preview-shell">
    <aside class="panel">
      <h1>${escapeHtml(title)}</h1>
      <p>Backend HTML render generated from LayoutDocument.</p>
      <h2>Layers</h2>
      <ol class="layers">
        ${renderLayerItems(document)}
      </ol>
    </aside>
    <section class="stage-wrap">
      <div id="layout-canvas" class="layout-canvas" data-canvas-width="${document.canvas.width}" data-canvas-height="${document.canvas.height}">
        ${objects}
      </div>
    </section>
    <aside class="panel right">
      <h2>Prompt</h2>
      <div class="prompt-box">${escapeHtml(prompt)}</div>
      <h2 style="margin-top:18px">Export Contract</h2>
      <p>The screenshot target is <code>#layout-canvas</code>. This output is intended as a layout reference for image generation.</p>
    </aside>
  </main>
</body>
</html>`;
}
