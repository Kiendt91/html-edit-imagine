# AI Layout Studio System Profile v2

Updated: 2026-07-07

Implementation note: Batch A and the first mock version of Batch C were started after this profile was written. The current app now includes overwrite save, duplicate project, extracted ProjectBrowser/AssetLibrary/OutputPanel components, and a deterministic natural-language patch assistant endpoint/UI. Remaining work in these batches is provider-backed patching, deeper patch review UX, project render/generation history, and more state extraction.

Purpose: this is the coding profile for the next implementation sessions. It turns the original product vision, the current repo state, and the latest gap analysis into a concrete system contract.

## 1. Product Definition

AI Layout Studio is not another AI image generator and not a general design suite. It is a DOM-first layout workbench for AI image generation:

```text
idea / source image / product asset
-> structured LayoutDocument
-> editable HTML canvas
-> clean reference PNG + prompt/assets package
-> draft/final AI image generation
```

The user should spend most of their time in the editable layout stage. AI proposes layouts and patches; the user inspects, moves, resizes, edits, accepts, rejects, and only then generates the final image.

## 2. Non-Negotiables

- `LayoutDocument` is the source of truth.
- HTML/DOM is the primary visible editor surface, not the durable state.
- All user edits must become validated document commands or document state updates.
- AI must return structured documents, extraction regions, or patch operations, never arbitrary app HTML.
- Uploaded files become `AssetRef` records before entering a layout object.
- Source-image workflows must keep the original image as a locked underlay until the user hides/removes it.
- Clean export must hide editor UI and must hide source underlays for source-image extraction workflows.
- Async render/generation results must carry `jobId` and `documentHash` so stale results cannot overwrite the current layout.

## 3. Current Verified Implementation

This inventory is based on the current worktree as of 2026-07-07.

### Frontend

- React + TypeScript + Vite app.
- Three-column editor shell: layers, canvas, properties/output.
- DOM canvas renders `LayoutDocument.objects`.
- Click select, drag, resize, zoom, snap grid, keyboard undo/redo.
- Layer controls for reorder, visibility, lock/unlock.
- Properties panel for geometry, text, visibility, lock, product upload, extraction review.
- Project Browser for save/load/delete.
- Project overwrite save and duplicate project.
- Asset Library for listing, reusing, and deleting unused uploaded assets.
- Mock natural-language Patch Assistant for previewing and applying validated patch ops.
- Source image import and extract layout workflow.
- Export PNG, render queue, and generate image controls.

### Backend

- Node HTTP backend in `src/backend/server.mjs`.
- Project store with list/get/save/patch/delete.
- Asset store with upload/list/static serving/delete.
- Layout planner, validator, normalizer, and patch commands.
- Natural-language layout patch endpoint with deterministic mock output.
- HTML renderer and Playwright export pipeline.
- Render queue with job ids, document hashes, cache, and SSE.
- Generation queue with mock-local and OpenAI image provider adapter.
- Vision layout provider with mock and OpenAI adapter.
- Clean export verification for source-image underlay hiding.

### Validation

- `npm test` covers harness, backend smoke, API smoke, sample export, TypeScript/Vite build, and frontend smoke.
- Harness validates core `LayoutDocument` invariants and source-image extraction invariants.
- API smoke covers asset/project delete, source-image extraction, clean export, generation, generated file serving, and SSE.
- Frontend smoke covers project browser, snap, layer controls, undo/redo, asset placement, export, generate, source import, and extraction review.

## 4. What The App Still Needs

### Product-Critical Gaps

1. Real provider UX
   - Backend has OpenAI adapters, but the UI only shows provider summary.
   - Need provider/mode controls, readiness checks, and clear mock-vs-real status.

2. Image-to-layout quality
   - Mock extraction is useful for demos but not product-grade.
   - Need stronger vision extraction, OCR review, confidence sorting, region editing, and manual correction flow.

3. Natural-language layout patching
   - Mock patch assistant exists for commands like "move product up".
   - Need OpenAI structured-output provider, stronger preview/review UX, and broader command coverage.

4. Render stream tiers
   - Live HTML exists.
   - Manual render/export/generate exists.
   - Missing debounced raster preview, AI draft stream, cancellation, stale labels, and render budget modes.

5. Project lifecycle
   - Save creates a project, but the editor should support overwrite/update current project, duplicate, version history, and render history per project.

### Editor UX Gaps

- Rotate handle.
- Pan tool and space-drag viewport pan.
- Multi-select and marquee select.
- Duplicate command.
- Align/distribute commands.
- Snap guides and smart guides.
- Rulers, safe area, bleed area.
- Drag-and-drop layer reorder.
- Better text overflow detection and auto-fit warning.
- Asset crop/fit controls for product images.
- Background/color controls for canvas and shapes.

### Architecture Gaps

- `src/frontend/main.tsx` is too large and should be split.
- Frontend and backend rendering logic are separate implementations that can drift.
- Editor state is local React state; it should move toward store slices and command/history helpers.
- Provider-specific status/config should be explicit in backend contracts.
- Render/generation job state should be persisted or attached to project history.

## 5. Target Module Shape

The next code sessions should move toward this structure without doing a risky all-at-once rewrite:

```text
src/frontend/
  app/
    App.tsx
  editor/
    EditorShell.tsx
    Toolbar.tsx
    Stage.tsx
    HtmlCanvas.tsx
    LayoutObjectNode.tsx
    LayersPanel.tsx
    PropertiesPanel.tsx
    ProjectBrowser.tsx
    AssetLibrary.tsx
    OutputPanel.tsx
  layout/
    geometry.ts
    history.ts
    selection.ts
  render/
    renderState.ts
  ai/
    providerTypes.ts
```

Backend should keep provider code behind adapters:

```text
src/backend/
  providers/
    vision/
    image-generation/
  jobs/
    render-queue.mjs
    generation-queue.mjs
  layout/
    validator.mjs
    normalizer.mjs
    commands.mjs
```

Do not move files only for neatness. Split modules when a feature needs the boundary.

## 6. Data Model Upgrades

Recommended next schema additions:

```ts
type LayoutDocument = {
  version: string;
  canvas: CanvasSpec;
  assets: AssetRef[];
  objects: LayoutObject[];
  guides?: Guide[];
  meta?: ProjectMeta;
};

type ProjectMeta = {
  title?: string;
  workflow?: "idea-layout" | "source-image-layout-extraction" | "manual-layout";
  sourceAssetId?: string;
  renderHistory?: RenderHistoryItem[];
  generationHistory?: GenerationHistoryItem[];
};
```

Object-level additions to consider:

- `stroke`, `radius`, `shadow`.
- `crop`, `fit`, `subjectBBox` for product/image objects.
- `textOverflow?: "fit" | "clip" | "warn"`.
- `constraints?: { preserveText?: boolean; preserveProduct?: boolean }`.
- `groupId` or stronger group object support later.

Editor-only state should not live inside saved `LayoutDocument`:

- selected ids
- hover id
- active tool
- viewport zoom/pan
- transient drag/resize values
- undo/redo stacks

## 7. Backend Contracts To Add

### Current important endpoints

- `GET /api/providers`
- `POST /api/plan-layout`
- `POST /api/patch`
- `GET/POST/PUT/DELETE /api/projects/:id?`
- `GET/POST/DELETE /api/assets/:id?`
- `POST /api/projects/from-image`
- `POST /api/image-layout/analyze`
- `POST /api/export/png`
- `POST /api/render-jobs`
- `POST /api/generate-image`

### Needed endpoints

1. Natural-language patch

```http
POST /api/layout-patches/from-instruction
```

Input:

```json
{
  "document": {},
  "instruction": "Move the product up and make the headline bigger",
  "selectedObjectIds": ["product"]
}
```

Output:

```json
{
  "ops": [],
  "warnings": [],
  "confidence": 0.8
}
```

2. Provider check/config

```http
GET /api/providers
POST /api/provider-check
```

The existing provider endpoint should be expanded to expose which features are available: vision extraction, image edit/generation, streaming, partial images, and mock mode.

3. Project update from editor

```http
PUT /api/projects/:id
```

The backend already supports this; frontend should use it when `currentProjectId` exists.

4. Draft render job

```http
POST /api/draft-jobs
GET /api/draft-jobs/:id/events
```

This should be lower cost than final generation and should mark stale results when `documentHash` changes.

## 8. Render Pipeline Target

Keep the four-tier model:

```text
Tier 1: Live HTML Preview
  already exists

Tier 2: Debounced Raster Preview
  missing

Tier 3: AI Draft Stream
  missing

Tier 4: Final Render
  exists as explicit Generate action
```

The render state should track:

```ts
type RenderState = {
  referencePreviewUrl?: string;
  draftUrl?: string;
  finalImageUrl?: string;
  activeJobId?: string;
  activeDocumentHash?: string;
  mode: "manual" | "auto-preview" | "auto-draft";
  status: "idle" | "exporting-preview" | "rendering-draft" | "ready" | "failed" | "stale";
};
```

Rules:

- Never call final generation on pointer movement.
- Debounce preview around 300-800 ms.
- Debounce AI draft around 1.5-3 seconds.
- Abort when possible; otherwise ignore stale hashes.
- Keep AI draft/output separate from the editable canvas.

## 9. Next Feature Batches

### Batch A: Project And State Hardening

Goal: make saved projects feel durable.

Tasks:

- Frontend uses `PUT /api/projects/:id` for overwrite save. Done in current implementation.
- Add duplicate project action. Done in current implementation.
- Add project render/generation history summary.
- Extract project/asset/history hooks from `main.tsx`. ProjectBrowser, AssetLibrary, and OutputPanel are extracted; hooks/history extraction remains.
- Keep undo/redo local to the open document and clear/branch correctly on load. Done for project load; more history helper extraction remains.

Acceptance:

- Saving an opened project updates the same project id.
- Duplicate creates a new id.
- Frontend smoke covers save, reload, overwrite, duplicate, delete.
- `npm test` passes.

### Batch B: Geometry Control Upgrade

Goal: make canvas editing closer to a real layout tool.

Tasks:

- Add rotate handle.
- Add pan tool/spacebar pan.
- Add duplicate command.
- Add align left/center/right/top/middle/bottom.
- Add multi-select state and marquee select.
- Add smart guide snap to canvas center and object edges.

Acceptance:

- Drag/resize/rotate commit as one undo transaction.
- Multi-select transform updates all selected objects safely.
- Layer/object commands are represented as patch operations where possible.
- Frontend smoke verifies rotate, duplicate, align, multi-select, undo.

### Batch C: AI Layout Patch Assistant

Goal: let users edit layout in natural language without regenerating the full document.

Tasks:

- Add `LayoutPatchProvider` interface.
- Add mock patch provider. Done in current implementation.
- Add OpenAI structured-output patch provider.
- Add `/api/layout-patches/from-instruction`. Done in current implementation.
- Add frontend instruction box with patch preview/apply. Done in current implementation.

Acceptance:

- AI never returns arbitrary HTML.
- Invalid ops are rejected by validator/normalizer.
- User can inspect ops before applying.
- API smoke covers mock patch.

### Batch D: Image Extraction Upgrade

Goal: make source-image-to-layout usable beyond a demo.

Tasks:

- Expose provider selection/status in UI.
- Add OCR review sorting by low confidence.
- Add per-object accept/reject/filter controls in layers panel.
- Add manual trace helper: create text/product/shape from selected source region.
- Add crop/fit controls for product assets.

Acceptance:

- Source underlay remains locked and hidden in clean export.
- Low-confidence extracted objects are visibly reviewable.
- Clean export and source extraction fixtures pass.
- Demo video script can show input image -> editable HTML layout -> clean export.

### Batch E: Render Stream And Drafts

Goal: create the "sua den dau ra hinh den do" loop without spending final-render cost on every edit.

Tasks:

- Debounced raster preview.
- Render state panel: reference, draft, final tabs.
- Draft job contract with stale/cancel behavior.
- Optional provider streaming partial images when available.
- Cache by document/assets/prompt/provider hash.

Acceptance:

- Editing updates HTML immediately.
- Preview updates after debounce.
- Draft does not overwrite newer document output.
- SSE or polling smoke verifies stale guard.

## 10. What Not To Build Yet

- Full Canva-style template marketplace.
- Photoshop-like pixel editor.
- Collaboration/multiplayer.
- Figma/PSD export.
- Batch ecommerce production before single-layout quality is strong.
- Final AI generation on every mouse move.

## 11. Competitive Signals To Keep In Mind

- Canva Magic Layers validates the demand for turning flat/AI-generated images into editable layouts.
- Uizard validates screenshot-to-editable-design, but for UI screens rather than ads/product visuals.
- Krea validates realtime visual feedback, but AI Layout Studio should make HTML editing realtime and reserve AI for draft/final tiers.
- OpenAI image generation supports streaming partial images, which is useful for AI Draft Stream, not for per-pixel mouse movement.

Sources checked on 2026-07-07:

- Canva Magic Layers: https://www.canva.com/magic-layers/
- Canva Magic Layers in AI assistants: https://www.canva.com/newsroom/news/magic-layers-ai-assistants/
- Uizard Screenshot Scanner: https://uizard.io/screenshot-scanner/
- Krea Realtime: https://docs.krea.ai/user-guide/features/realtime
- OpenAI image generation guide: https://developers.openai.com/api/docs/guides/image-generation
- OpenAI image edit API reference: https://developers.openai.com/api/reference/resources/images/methods/edit/

## 12. Recommended Next Coding Session

Start with Batch A, then Batch C.

Why:

1. Project overwrite/update and state extraction make every later feature safer.
2. Natural-language patching is a core product promise and can be built with a mock provider first.
3. Geometry upgrades are valuable, but they are easier after `main.tsx` is split and history/selection helpers are isolated.

Minimum next-session deliverable:

- Add OpenAI structured-output patch provider behind the existing patch endpoint.
- Add project render/generation history summary.
- Extract remaining output panel and history helpers from `main.tsx`.
- Improve patch preview with per-op labels and selectable apply/reject.
- Add rotate/pan/duplicate/align as the next editor controls.
