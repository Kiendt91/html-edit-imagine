# Render Stream Reference

Use this reference when implementing or reviewing "sua den dau ra hinh den do" behavior.

## Four Tiers

```text
Tier 1: Live HTML Preview
Tier 2: Debounced Raster Preview
Tier 3: AI Draft Stream
Tier 4: Final Render
```

## Tier 1: Live HTML Preview

- Update the DOM canvas immediately while dragging, resizing, rotating, or editing text.
- Keep this local and non-AI.
- Commit final normalized values on pointer up or form commit.

## Tier 2: Debounced Raster Preview

- Export a low-cost PNG/WebP preview after document changes settle.
- Use a debounce around 300-800 ms.
- This preview should show what the current reference export would look like.

## Tier 3: AI Draft Stream

- Run only after the user has been idle, typically 1.5-3 seconds.
- Use lower cost/quality settings.
- Use provider streaming partial images when available.
- Mark drafts as stale if the document changes during rendering.

## Tier 4: Final Render

- Require an explicit user action.
- Freeze the current document hash and reference image.
- Use high quality settings and save output to render history.

## Render Job State

```ts
type RenderState = {
  currentPreviewUrl?: string;
  currentDraftUrl?: string;
  activeJobId?: string;
  status: "idle" | "exporting-preview" | "rendering-draft" | "ready" | "failed";
  lastRenderedDocumentHash?: string;
};
```

## Safety Rules

- Every async render must carry `jobId` and `documentHash`.
- Abort stale work when possible.
- Ignore completed work if the hash no longer matches the latest document.
- Cache by `hash(LayoutDocument + assets + stylePrompt + providerSettings)`.
- Do not call expensive final AI render on every pointer movement.

## UX Recommendation

Keep the editable HTML canvas as the main surface. Show raster preview, AI draft, and final image in a separate panel or output strip so AI results do not replace the controllable layout.
