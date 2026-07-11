---
name: html-layout-studio
description: "Build, review, or validate the AI Layout Studio project: an HTML/DOM-first visual layout editor for AI image generation. Use when tasks involve LayoutDocument schemas, DOM canvas rendering, direct manipulation, layer/property panels, AI layout planning, natural-language layout patches, render streaming, export PNG/reference images, or the project harness."
---

# HTML Layout Studio

Use this skill to keep work aligned with the project vision: an HTML-based layout canvas where AI proposes structured image layouts, users edit regions directly, and the system exports reference images for AI rendering.

## First Moves

1. Inspect the current repo before relying on memory.
2. Read `AI_LAYOUT_SYSTEM_RESEARCH.md` when the task is broad, strategic, or ambiguous.
3. Load only the reference file needed for the task:
   - `references/system-architecture.md` for module boundaries, editor state, and UI workflow.
   - `references/layout-document.md` for schemas, object invariants, AI planner output, and patch commands.
   - `references/render-stream.md` for live preview, raster preview, AI draft streaming, final render, cancellation, and cache behavior.
   - `references/image-input-workflows.md` for source-image-to-layout, product asset placement, image underlays, and asset upload design.
   - `references/harness.md` for validation commands and expected harness coverage.
4. For implementation work, preserve the DOM-first editor model unless the user explicitly asks for a different architecture.

## Non-Negotiables

- Treat the HTML canvas as the primary user-facing editor surface.
- Keep a structured `LayoutDocument` as the durable state for save/load, undo/redo, export, AI planning, and validation.
- Render DOM from state; do not let drag/resize libraries become the source of truth.
- Convert pointer movement from screen coordinates to document coordinates before committing object changes.
- Commit drag/resize/rotate as history transactions, not one undo entry per pixel.
- Use AI to generate layout documents or patch commands, not arbitrary HTML.
- Treat uploaded images as assets first; convert them into layout objects or product slots only through validated document patches.
- Use progressive render streaming: live HTML first, debounced raster preview second, AI draft stream third, final render only on deliberate action.
- Guard render jobs with cancellation, `jobId`, and document hash checks so stale outputs cannot overwrite newer work.

## Workflow

When designing or editing architecture:

1. Start from `LayoutDocument -> HTML Renderer -> Interaction Layer -> Export/AI Pipeline`.
2. Keep panels and editor tools wired to document commands.
3. Prefer React + TypeScript + Vite, Zustand-like state slices, DOM interaction tools such as Moveable/interact.js, dnd-kit for layer ordering, and Playwright/html-to-image for exports.

When adding layout features:

1. Extend the schema first.
2. Add defaults and validators.
3. Render the object from state.
4. Add property controls.
5. Add interaction behavior if the object is directly manipulable.
6. Add or update harness fixtures.

When adding AI features:

1. Define the input contract.
2. Require structured output or patch operations.
3. Validate and normalize before applying.
4. Clamp geometry and reject unsafe/stale commands.
5. Keep provider-specific code behind an adapter.

When adding image input features:

1. Store uploaded images as `AssetRef` records.
2. For product images, attach the asset to a `product-image` object through `replaceAsset` + `updateObject`.
3. For source layout images, create an underlay first, then add extracted layout objects as editable blocks.
4. Keep confidence/source-bbox metadata when AI or CV extracts objects from an image.

When validating work:

1. Run the project harness: `node harness/layout-harness.mjs`.
2. If the current shell is inside a nested folder, use `node .codex/skills/html-layout-studio/scripts/run-project-harness.mjs` from the repo root or read `references/harness.md`.
3. If app code exists, also run the repo's build/test commands.
4. Treat harness failures as architecture violations, not cosmetic warnings.

## Output Style

Prefer concrete artifacts over abstract commentary: schema files, command handlers, fixtures, render-job state machines, and focused tests. Explain tradeoffs briefly, especially when choosing between DOM-first editing and canvas/vector libraries.
