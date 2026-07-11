# Backend API

Backend local: `http://localhost:4317`

## Core Endpoints

- `GET /api/health` - service status.
- `GET /api/providers` - active/available vision and image-generation providers.
- `GET /api/sample` - sample `LayoutDocument` and prompt.
- `POST /api/validate` - validate `{ document }`.
- `POST /api/plan-layout` - create a deterministic layout from `{ idea, canvas?, style? }`.
- `POST /api/patch` - apply `{ document, ops }` patch commands.
- `POST /api/layout-patches/from-instruction` - convert a natural-language edit instruction into validated patch ops and a preview document.
- `POST /api/render-html` - return HTML generated from `{ document, prompt? }`.
- `POST /api/export/png` - synchronously export `{ document, prompt? }` to HTML, PNG, manifest, and Codex prompt.

## Projects

- `GET /api/projects` - list saved projects.
- `POST /api/projects` - save `{ title?, prompt?, document }`, or create from `{ idea, canvas?, style? }`.
- `GET /api/projects/:id` - load one project.
- `DELETE /api/projects/:id` - delete one saved project.
- `PUT /api/projects/:id` - replace project fields.
- `POST /api/projects/:id/patch` - apply patch ops to a saved project.
- `POST /api/projects/:id/render-jobs` - create a render job from saved project document.

Saved projects live in `data/projects/`, ignored by Git.

## Render Jobs

- `GET /api/render-jobs` - list in-memory render jobs.
- `POST /api/render-jobs` - queue render from `{ document, prompt?, tier?, projectId?, wait? }`.
- `GET /api/render-jobs/:id` - inspect one render job.
- `GET /api/render-jobs/:id/events` - Server-Sent Events stream for job status until `ready` or `failed`.

Use `wait: true` for smoke tests and one-shot API calls. Use the events endpoint for frontend render-stream behavior.

## Provider Configuration

Defaults are local and deterministic:

- `VISION_LAYOUT_PROVIDER=mock`
- `IMAGE_GENERATION_PROVIDER=mock-local`

OpenAI-backed providers are available when configured:

```powershell
$env:OPENAI_API_KEY="..."
$env:VISION_LAYOUT_PROVIDER="openai"
$env:OPENAI_VISION_MODEL="gpt-5.5"
$env:IMAGE_GENERATION_PROVIDER="openai"
$env:OPENAI_IMAGE_MODEL="gpt-image-1.5"
```

`POST /api/image-layout/analyze` uses the configured vision provider. `POST /api/generate-image` uses `IMAGE_GENERATION_PROVIDER` unless the request body supplies a `provider`.

## Image Input Endpoints

These endpoints cover the image input workflow.

- `GET /api/assets` - list stored assets.
- `POST /api/assets` - upload source/product/logo/icon image and return an `AssetRef`.
- `DELETE /api/assets/:id` - delete one stored asset and remove it from the asset index.
- `GET /assets/:id/:fileName` - serve stored asset files.
- `POST /api/place-product` - attach an uploaded product asset to a target `product-image` object in an unsaved document.
- `POST /api/image-layout/analyze` - return a normalized `LayoutDocument` with a locked source-image underlay, editable extracted regions, confidence, source bounding boxes, OCR metadata, and warnings.
- `POST /api/projects/from-image` - create a project from a source image with the original image as a locked underlay.
- `POST /api/projects/:id/place-product` - attach an uploaded product asset to a target `product-image` object.

Current MVP upload body:

```json
{
  "name": "product.png",
  "kind": "product",
  "dataUrl": "data:image/png;base64,..."
}
```

Response:

```json
{
  "asset": {
    "id": "asset-product-abc123",
    "type": "image",
    "kind": "product",
    "name": "product.png",
    "src": "/assets/asset-product-abc123/original.png",
    "filePath": "data/assets/asset-product-abc123/original.png",
    "mimeType": "image/png",
    "width": 1200,
    "height": 1600
  }
}
```

Current source image project body:

```json
{
  "assetId": "asset-source-layout-abc123",
  "title": "Imported Ad Layout",
  "underlayOpacity": 0.72
}
```

The created document contains a locked `image` object:

```json
{
  "id": "source-underlay",
  "type": "image",
  "role": "source-underlay",
  "locked": true,
  "assetId": "asset-source-layout-abc123"
}
```

## Patch Operation Example

```json
{
  "ops": [
    {
      "type": "updateObject",
      "id": "headline",
      "patch": {
        "content": "NEW ELEGANCE",
        "fontSize": 92
      }
    }
  ]
}
```

Supported operation types:

- `addObject`
- `updateObject`
- `removeObject`
- `reorderObject`
- `setCanvas`
- `replaceAsset`

## Natural-Language Patch Assistant

Current MVP body:

```json
{
  "document": {},
  "instruction": "Move the product up and make the headline bigger",
  "selectedObjectIds": ["product"]
}
```

Response:

```json
{
  "provider": "mock-layout-patch-v1",
  "ops": [],
  "document": {},
  "warnings": [],
  "confidence": 0.74
}
```

The endpoint currently uses a deterministic mock provider and validates the generated patch through the layout command pipeline before returning it.

## Scripts

```bash
npm run backend
npm run harness
npm run smoke:backend
npm run smoke:api
npm run export:sample
npm test
```
