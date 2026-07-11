# AI Layout Studio Handoff

Last updated: 2026-07-11

This file is the first stop for any AI or developer continuing the project from another machine.

Repository: https://github.com/Kiendt91/html-edit-imagine

## Session Rule

At the end of every working session on this project:

1. Update this file with what changed, what was verified, and what should happen next.
2. Update related docs when architecture, APIs, workflows, or roadmap changed.
3. Run the relevant validation. Prefer `npm test` when code changed.
4. Commit the finished session work.
5. Push `main` to GitHub so another machine can continue from the latest state.

Do not leave useful project knowledge only in chat. Put it in this repo.

## Current Baseline

- Branch: `main`
- Remote: `origin` -> `https://github.com/Kiendt91/html-edit-imagine.git`
- Stack: React + TypeScript + Vite frontend, Node HTTP backend, Playwright export pipeline.
- Core product: DOM-first AI layout editor backed by structured `LayoutDocument`.
- Current validation command: `npm test`

## What Works Now

- Three-column editor with HTML canvas, layer panel, properties panel, asset library, project browser, and output panel.
- `LayoutDocument` schema, normalizer, validator, patch command pipeline, and harness fixtures.
- Direct manipulation: select, drag, resize, grid snap, layer reorder, visibility, lock/unlock, undo/redo.
- Project management: save new project, overwrite current project, load, delete, duplicate.
- Asset management: upload/list/delete assets, place product assets into product slots.
- Source image workflow: upload source image, create locked underlay, extract editable blocks, review confidence metadata.
- Export pipeline: HTML render, clean PNG/reference export, clean source-underlay hiding.
- Render and generation queues with job ids, document hashes, SSE, mock local generation, and OpenAI provider adapters.
- Patch Assistant MVP: deterministic natural-language instruction -> validated patch ops -> preview/apply UI.
- Smoke tests cover API, frontend flow, project lifecycle, asset placement, source extraction, export, generation, and patch assistant.

## Important Files

- `AI_LAYOUT_SYSTEM_PROFILE.md` - current architecture profile and roadmap.
- `BACKEND_API.md` - backend endpoint reference.
- `PROJECT_ALIGNMENT_AND_MARKET_RESEARCH.md` - positioning and market alignment.
- `src/frontend/main.tsx` - current editor shell; still larger than ideal.
- `src/frontend/editor/` - extracted ProjectBrowser, AssetLibrary, OutputPanel.
- `src/backend/server.mjs` - backend route surface.
- `src/backend/layout-patch-provider.mjs` - mock natural-language patch provider.
- `scripts/api-smoke.mjs` and `scripts/frontend-smoke.mjs` - end-to-end smoke coverage.

## Next Best Work

1. Add OpenAI structured-output provider behind the existing patch assistant endpoint.
2. Improve patch preview UX with readable per-op labels and selective apply/reject.
3. Add project render/generation history summary and persist it with saved projects.
4. Extract remaining editor state/helpers from `main.tsx`, especially history and output/render state.
5. Add geometry controls: rotate handle, pan tool, duplicate object, align/distribute, smart guides.
6. Add debounced raster preview and AI Draft Stream with stale-result guards.
7. Improve source-image extraction review: low-confidence sorting, manual trace helper, product crop/fit controls.

## Validation Notes

Use:

```bash
npm test
```

This runs:

- `npm run harness`
- `npm run smoke:backend`
- `npm run smoke:api`
- `npm run export:sample`
- `npm run build`
- `npm run smoke:frontend`

If only docs changed, a full test is optional, but record what was or was not run in the session update.

## Latest Session Update

2026-07-11:

- Reviewed the current project state after the GitHub handoff setup.
- Confirmed `main` is clean and tracking `origin/main`.
- Validation for the current baseline: `npm test` passed.
- No product code changed in this status pass.
- Recommended next implementation target remains: OpenAI structured-output provider for Patch Assistant plus readable/selective patch preview.

2026-07-11:

- Pushed the initial project to GitHub.
- Added this handoff workflow so future sessions update GitHub and project status before ending.
- Validation before initial GitHub push: `npm test` passed.
