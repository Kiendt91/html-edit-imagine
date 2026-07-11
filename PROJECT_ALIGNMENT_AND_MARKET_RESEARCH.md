# AI Layout Studio Alignment And Market Research

Generated: 2026-07-06
Updated: 2026-07-07

Current coding baseline: `AI_LAYOUT_SYSTEM_PROFILE.md`.

## Executive Summary

AI Layout Studio is directionally aligned with the project skill: it is a DOM-first layout editor backed by a structured `LayoutDocument`, with asset upload, direct manipulation, undo/redo, layer controls, project/asset management, clean PNG export, render/generation jobs, provider adapters, and source-image-to-layout MVP extraction.

The current product is still an MVP. Its biggest gap is that image-to-layout quality is not product-grade by default: the mock provider is heuristic, real provider UX is not exposed clearly, and OCR/review workflows still need depth. The second biggest gap is that render streaming is only partially implemented: live HTML, manual render, and final generation jobs exist, but debounced raster preview and AI draft stream are missing. The third gap is architecture: `main.tsx` has grown into a monolith and should be split before the next wave of editor and AI features.

Market research shows that the closest competitor is Canva Magic Layers, which turns flat images into editable layered designs. Uizard is adjacent for screenshot-to-editable UI. Recraft, Krea, Ideogram, Adobe Firefly/Express, Microsoft Designer, and Photoroom overlap on generation/editing/product-photo workflows, but they do not expose the same explicit HTML/DOM layout document pipeline that this project is building.

## Current Implementation Inventory

### Product Surface

- Three-column editor exists: layers, HTML canvas, properties.
- Canvas renders `LayoutDocument.objects` as DOM nodes.
- Users can select, drag, resize, edit properties, undo/redo, snap to grid, reorder/lock/hide layers, upload product assets, reuse library assets, import source layout images, export PNG, and run a generate job.
- Project Browser supports save/load/delete.
- Asset Library supports list/reuse/delete with a guard against deleting assets used by the current layout.
- Source-image workflow now creates both a faint locked underlay and editable layout blocks above it.
- Clean export hides editor guides and hides the source underlay for extracted source-image layouts.

### Backend

- `src/backend/server.mjs`
  - Project APIs.
  - Asset upload/static asset serving/delete.
  - Source image document creation.
  - Mock and OpenAI vision layout providers.
  - Render/export endpoints.
  - Generate job endpoints.
- `src/backend/exporter.mjs`
  - Exports both `layout-reference.png` and `layout-clean.png`.
- `src/backend/generation-queue.mjs`
  - Creates `generated-image.png` using `mock-local` by default.
  - Can use an OpenAI image provider when configured.
  - Produces a generation prompt and manifest.
- `src/backend/render-queue.mjs`
  - Uses job ids and document hashes.
  - Caches raster preview jobs.

### Frontend

- `src/frontend/main.tsx`
  - Editor shell and panels.
  - Direct object manipulation.
  - Undo/redo, snap grid, layer controls.
  - Project Browser and Asset Library.
  - Product upload.
  - Source image import.
  - `Extract Layout` workflow.
  - `Export` and `Generate` controls.
- `src/frontend/api.ts`
  - API client for planning, patching, export, render, assets, source-image, and generation.

### Demos

- `npm run demo:walkthrough`
- `npm run demo:record`
- `npm run demo:source-record`
- `npm run demo:input-to-layout-record -- "<image-path>"`

The most relevant new demo is `demo:input-to-layout-record`: it first shows the original image input, then uploads it, extracts editable HTML layout blocks, exports the clean layout PNG, and ends with a before/after comparison.

## Evidence From Current Verification

Command run:

```powershell
npm test
```

Result: PASS.

Coverage from the command:

- Harness fixture validation passes.
- Expected invalid fixture fails with schema errors.
- Render-stream policy passes.
- Backend smoke passes.
- API smoke passes, including source-image extraction, clean export, generation job, static generated image serving, and SSE.
- Sample export passes.
- TypeScript + Vite build passes.
- Frontend smoke passes, including project browser, snap, layer controls, undo/redo, asset reuse, product upload, export, generate, source import, extract layout, and UI screenshot.

## Skill Alignment Audit

| Skill requirement | Current status | Evidence | Gap |
|---|---:|---|---|
| HTML canvas is the primary user-facing editor | Green | Editor uses DOM objects inside `.layoutCanvas` | None major |
| Durable state is `LayoutDocument` | Green | Backend validators, patch ops, frontend state | Need overwrite save/version UX |
| Render DOM from state | Green | `layoutRender.tsx`, `html-renderer.mjs` | Frontend renderer and backend renderer are separate implementations |
| Do not let drag/resize library become source of truth | Green | No external drag lib; pointer commits patch updates | Need rotate/multi-select transactions |
| Convert pointer movement from screen to document coordinates | Green-ish | Drag uses `dx / zoom`, `dy / zoom` | No pan/ruler transform support yet |
| Commit drag/resize as history transactions | Green-ish | Commits on pointer up and undo/redo exists | Need shared history helper and broader command coverage |
| AI generates layout documents or patches, not arbitrary HTML | Green-ish | Planner/extractor produce `LayoutDocument` | Planner/extractor are deterministic/heuristic, not real AI |
| Treat uploaded images as assets first | Green | `AssetStore`, `/api/assets`, Asset Library | Need thumbnails/crop/background metadata |
| Source image creates underlay then editable blocks | Green-ish | Heuristic extraction creates underlay plus blocks | Needs real CV/OCR and confidence review |
| Progressive render streaming | Yellow | render/generate jobs have ids/hash; SSE exists | No debounced automatic preview, no true AI draft stream, no cancellation |
| Provider-specific AI behind adapter | Green-ish | Vision and image generation providers have mock/OpenAI adapters | Need provider controls, readiness UX, and feature capability reporting |

## Harness Alignment Audit

Current harness covers the foundational schema well:

- Root document shape.
- Canvas positive dimensions and `px`.
- Unique object ids.
- Supported object types.
- Positive size and numeric geometry.
- Opacity bounds.
- Image asset references.
- Group references.
- Render-stream policy.

The newer product behavior is now split between harness fixtures and smoke tests. Recommended additions:

1. Add harness coverage for natural-language patch operations once the patch assistant exists.
2. Add a geometry fixture or smoke path for rotate, duplicate, align, multi-select, and guide snapping.
3. Add a render-stream verifier for debounced preview, stale draft handling, and cancellation/hash behavior.
4. Add a provider capability smoke test that confirms mock mode and OpenAI-ready/missing-key status are visible.
5. Add a project lifecycle smoke test for overwrite save, duplicate, history, and render/generation history.

## Current Product Gaps

### Product-Critical

- Real image-to-layout extraction is not exposed as a polished user workflow. OpenAI vision adapter exists, but the default mock provider is heuristic and provider UX is still shallow.
- OCR/review is still basic. Text objects keep `originalText`, confidence, and bbox metadata, but the UI needs low-confidence sorting, region editing, and better correction flow.
- Product segmentation is missing. The product zone is estimated or provider-derived, not segmented/cropped into a usable product subject.
- Real image generation exists behind an adapter, but the default is mock-local and UI does not yet guide provider setup or quality/size/streaming choices.
- Natural-language patching is missing.

### Editor UX

- No multi-select.
- No rotation handle.
- No pan tool/rulers.
- No align/distribute/duplicate commands.
- No precision smart guides beyond grid snap.
- Properties are functional but still basic for shape styling, crop/fit, and text overflow.

### Architecture

- Frontend and backend renderers duplicate logic.
- `main.tsx` is large and should eventually split into `EditorShell`, `Stage`, `LayersPanel`, `PropertiesPanel`, and store slices.
- Provider interfaces exist, but provider capability reporting and UI controls need hardening.

## Competitor Landscape

### Closest Direct Competitors

| Competitor | What they do | Why it matters | Our opportunity |
|---|---|---|---|
| Canva Magic Layers | Turns flat images into editable layered designs; Canva says it preserves layout, hierarchy, and design intent. | This is the closest match to source-image-to-editable-layout. | Differentiate by specializing in AI image generation reference control, open `LayoutDocument`, HTML/CSS export, and provider-friendly assets. |
| Uizard Screenshot Scanner | Turns UI/app screenshots into editable mockups. | Similar extraction concept, but focused on UI screens. | Target ads/posters/product images instead of app UI; preserve image-generation roles like product/headline/badge. |
| Figma AI / Figma Make | Generates editable designs and prototypes from prompts inside a professional design ecosystem. | Strong for UI/product design teams. | Avoid competing head-on with Figma; focus on image-generation composition and render handoff. |

### AI Creative Suites

| Competitor | Strength | Weakness relative to this project |
|---|---|---|
| Adobe Firefly / Adobe Express / Photoshop Generative Fill | Powerful image editing/generation and professional ecosystem. | Less focused on converting arbitrary ad images into explicit HTML layout documents. |
| Microsoft Designer | Accessible AI design and image editing for social/content workflows. | Less control over internal structured layout state. |
| Canva AI / Magic Design | Very strong template, brand, and publishing workflow. | Closed ecosystem; less transparent layout document/pipeline. |

### AI Image Canvas / Generation Tools

| Competitor | Strength | Weakness relative to this project |
|---|---|---|
| Recraft | Strong designer-oriented image/vector/mockup generation; raster-to-vector features. | More about asset generation/editing than DOM layout state for AI image control. |
| Krea | Real-time controllable image/video generation from primitives. | Great live generation, but not focused on editable HTML layout export. |
| Ideogram | Strong text rendering and Canvas editing/inpainting/outpainting. | Canvas is image-generation/editor oriented; not a structured HTML layout editor. |
| Midjourney Editor | Strong image quality and region/pan/zoom editing. | Image-first, not editable layout-object-first. |

### Product Photo / Commerce

| Competitor | Strength | Weakness relative to this project |
|---|---|---|
| Photoroom | Product photo automation, backgrounds, batch processing. | Product image output is fast, but layout composition/editable ad reconstruction is not the core. |

### Website/App Builders

| Competitor | Strength | Weakness relative to this project |
|---|---|---|
| Framer AI | Generates/refines pages and publishes from a professional website canvas. | Website/site publishing, not image-generation layout reference. |
| Relume | Fast sitemap/wireframe/style-guide generation for sites. | Wireframe/site planning, not ad/image composition. |
| Lovable | Prompt-to-working-app with visual edits. | App builder, not image layout extraction/export. |

## Competitive Positioning

The strongest product thesis is not "another image generator" and not "another Canva." The sharper thesis is:

> A controllable HTML layout workbench for AI image generation, where flat references, product assets, and image ideas become editable layout documents before final rendering.

The wedge is the gap between static AI images and editable creative control. Canva Magic Layers validates this market direction. Our differentiation should be:

- Transparent `LayoutDocument` instead of opaque design state.
- HTML/CSS as the edit/export surface.
- Source-image-to-layout for ads/posters/product visuals.
- Product asset preservation as first-class workflow.
- Clean reference PNG plus prompt package for final AI generation.
- Provider-agnostic backend, so the user can choose image/vision models.

## Recommended Roadmap

### Next 1-2 Sessions

1. Make Save overwrite the current project with `PUT /api/projects/:id`, plus Duplicate Project.
2. Split `ProjectBrowser`, `AssetLibrary`, and output panel out of `main.tsx`.
3. Add a mock natural-language patch provider and `/api/layout-patches/from-instruction`.
4. Add patch preview/apply UI.
5. Update smoke tests around project lifecycle and patch assistant.

### Near-Term Product Work

1. Add provider selection/status UI for mock vs OpenAI vision/generation.
2. Add rotate, pan, multi-select, duplicate, align/distribute, and smart guides.
3. Add debounced raster preview and AI Draft Stream.
4. Improve source-image extraction review and manual trace helpers.
5. Persist render/generation history on projects.

### Strategic Bet

Do not try to out-Canva Canva. Build the narrow tool Canva still treats as a feature: precise, inspectable, developer-friendly image-layout control for AI generation pipelines.

## Research Sources

- Canva Magic Layers help: https://www.canva.com/help/editable-magic-layers/
- Canva Magic Layers product page: https://www.canva.com/magic-layers/
- Canva AI 2.0: https://www.canva.com/canva-ai/
- Adobe Firefly: https://www.adobe.com/products/firefly.html
- Photoshop Generative Fill: https://www.adobe.com/products/photoshop/generative-fill.html
- Recraft: https://www.recraft.ai/
- Recraft Studio: https://www.recraft.ai/studio
- Krea: https://www.krea.ai/
- Krea Realtime docs: https://docs.krea.ai/user-guide/features/realtime
- Figma AI: https://www.figma.com/ai/
- Figma AI help: https://help.figma.com/hc/en-us/articles/23870272542231-Use-AI-tools-in-Figma-Design
- Uizard Screenshot Scanner: https://uizard.io/screenshot-scanner/
- Microsoft Designer: https://www.microsoft.com/en-us/microsoft-365/microsoft-designer
- Ideogram Canvas: https://ideogram.ai/features/canvas/
- Midjourney Editor docs: https://docs.midjourney.com/hc/en-us/articles/32764383466893-Editor
- Photoroom AI product photography: https://www.photoroom.com/ai-product-photography
- Framer AI: https://www.framer.com/ai/
- Relume: https://www.relume.io/
