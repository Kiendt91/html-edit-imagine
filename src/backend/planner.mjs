import { normalizeLayoutDocument } from "./layout-normalizer.mjs";
import { sampleLayout, samplePrompt } from "./sample-layout.mjs";

function includesAny(value, words) {
  const lower = value.toLowerCase();
  return words.some((word) => lower.includes(word));
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function titleFromIdea(idea) {
  if (includesAny(idea, ["thumbnail", "youtube"])) {
    return "Bold Thumbnail Layout";
  }
  if (includesAny(idea, ["poster", "áp phích", "ap phich"])) {
    return "Poster Layout";
  }
  if (includesAny(idea, ["perfume", "nuoc hoa", "nước hoa", "fragrance"])) {
    return "Luxury Perfume Ad";
  }
  return "AI Generated Layout";
}

function promptFromIdea(idea, style = "") {
  const base = idea && idea.trim().length > 0 ? idea.trim() : samplePrompt;
  if (!style || style.trim().length === 0) {
    return base;
  }
  return `${base} Style: ${style.trim()}.`;
}

function applyCanvasPreset(document, canvas) {
  if (!canvas) {
    return document;
  }
  const width = Number(canvas.width) || document.canvas.width;
  const height = Number(canvas.height) || document.canvas.height;
  const ratioX = width / document.canvas.width;
  const ratioY = height / document.canvas.height;
  document.canvas.width = Math.round(width);
  document.canvas.height = Math.round(height);
  for (const object of document.objects) {
    object.x = Math.round(object.x * ratioX);
    object.y = Math.round(object.y * ratioY);
    object.width = Math.max(1, Math.round(object.width * ratioX));
    object.height = Math.max(1, Math.round(object.height * ratioY));
    if (typeof object.fontSize === "number") {
      object.fontSize = Math.max(10, Math.round(object.fontSize * Math.min(ratioX, ratioY)));
    }
  }
  return document;
}

function customizeCopy(document, idea) {
  const headline = document.objects.find((object) => object.id === "headline");
  const subtitle = document.objects.find((object) => object.id === "subtitle");
  const footer = document.objects.find((object) => object.id === "footer");
  const product = document.objects.find((object) => object.id === "product");

  if (includesAny(idea, ["coffee", "cafe", "cà phê", "ca phe"])) {
    headline.content = "BOLD MORNING";
    subtitle.content = "Fresh energy in a clean premium composition.";
    footer.content = "Roasted for today's rhythm";
    product.content = "COFFEE";
  } else if (includesAny(idea, ["skincare", "serum", "cream", "mỹ phẩm", "my pham"])) {
    headline.content = "GLOW RITUAL";
    subtitle.content = "A refined skincare story with calm luminous detail.";
    footer.content = "Daily care, visibly elevated";
    product.content = "SERUM";
  } else if (includesAny(idea, ["sale", "discount", "giảm giá", "giam gia"])) {
    headline.content = "LIMITED OFFER";
    subtitle.content = "A clear promotional composition with strong product focus.";
    footer.content = "Shop the seasonal edit";
  }

  document.meta.title = titleFromIdea(idea);
  return document;
}

export function planLayoutFromIdea({ idea = "", canvas, style = "" } = {}) {
  const document = customizeCopy(applyCanvasPreset(copy(sampleLayout), canvas), idea);
  const prompt = promptFromIdea(idea, style);
  return {
    document: normalizeLayoutDocument(document),
    prompt,
    planner: {
      provider: "deterministic-template",
      note: "Replace this planner with a structured-output AI provider when API integration is added.",
    },
  };
}
