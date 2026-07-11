import fs from "node:fs/promises";
import path from "node:path";

export function openAiApiKey() {
  return process.env.OPENAI_API_KEY ?? "";
}

export function requireOpenAiApiKey() {
  const apiKey = openAiApiKey();
  if (!apiKey) {
    const error = new Error("OPENAI_API_KEY is required for the selected OpenAI provider.");
    error.statusCode = 400;
    throw error;
  }
  return apiKey;
}

export async function openAiJson(pathname, body) {
  const apiKey = requireOpenAiApiKey();
  const response = await fetch(`https://api.openai.com/v1${pathname}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(data.error?.message ?? `OpenAI request failed: ${response.status}`);
    error.statusCode = response.status;
    error.openAiError = data.error ?? data;
    throw error;
  }
  return data;
}

export async function openAiForm(pathname, formData) {
  const apiKey = requireOpenAiApiKey();
  const response = await fetch(`https://api.openai.com/v1${pathname}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(data.error?.message ?? `OpenAI request failed: ${response.status}`);
    error.statusCode = response.status;
    error.openAiError = data.error ?? data;
    throw error;
  }
  return data;
}

export function responseOutputText(response) {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  const parts = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

export function responseJson(response) {
  const text = responseOutputText(response);
  if (!text) {
    throw new Error("OpenAI response did not include JSON text.");
  }
  return JSON.parse(text);
}

export async function assetDataUrl(asset, rootDir) {
  if (!asset.filePath) {
    const error = new Error(`Asset "${asset.id}" does not include a filePath for provider input.`);
    error.statusCode = 400;
    throw error;
  }
  const filePath = path.resolve(rootDir, asset.filePath);
  const buffer = await fs.readFile(filePath);
  return `data:${asset.mimeType ?? "image/png"};base64,${buffer.toString("base64")}`;
}

export async function appendFileToForm(form, name, filePath, mimeType = "image/png", fileName = path.basename(filePath)) {
  const buffer = await fs.readFile(filePath);
  form.append(name, new Blob([buffer], { type: mimeType }), fileName);
}
