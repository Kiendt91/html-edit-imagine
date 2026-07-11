# System Architecture Reference

Use this reference when designing modules, editor state, UI flows, or implementation plans.

## Product Shape

AI Layout Studio is an HTML/DOM-first layout editor for planning AI-generated images. It turns an image idea into structured editable regions, lets the user adjust those regions visually, then exports a reference image for final AI rendering.

The central pipeline is:

```text
User idea
-> AI Layout Planner
-> LayoutDocument
-> HTML Canvas Renderer
-> Direct Manipulation Layer
-> Reference PNG / AI Draft / Final Render
```

## Recommended Modules

```text
src/
  editor/
    EditorShell.tsx
    Stage.tsx
    HtmlCanvas.tsx
    InteractionLayer.tsx
    LayersPanel.tsx
    PropertiesPanel.tsx
    Toolbar.tsx
  layout/
    schema.ts
    defaults.ts
    validators.ts
    geometry.ts
    commands.ts
    history.ts
  render/
    htmlRenderer.tsx
    previewExporter.ts
    renderQueue.ts
    renderCache.ts
  ai/
    planner.ts
    patcher.ts
    prompts.ts
    providers/
  store/
    useEditorStore.ts
```

## Editor State Slices

- `document`: current `LayoutDocument`, commands, normalization.
- `selection`: selected ids, hover id, active tool.
- `history`: transaction-based undo/redo.
- `viewport`: zoom, pan, rulers, grid, guides.
- `render`: preview URLs, draft URLs, job status, document hashes.
- `assets`: product images, logos, icons, uploaded sources.

## UI Requirements

- Three-column editor: layers, canvas, properties.
- Toolbar for selection modes, object creation, alignment, export, render controls.
- Canvas must support click select, drag, resize, rotate, zoom, pan, and keyboard shortcuts.
- Layers panel must support reorder, visible/hidden, lock/unlock, rename.
- Properties panel must update state immediately and use type-specific controls.

## Implementation Guardrails

- Use DOM nodes for layout objects so HTML/CSS is the visible editing surface.
- Keep object DOM nodes absolutely positioned inside a fixed-size document canvas.
- Apply viewport zoom/pan outside document coordinates.
- Never persist transient DOM transforms without writing the normalized result into `LayoutDocument`.
- Keep provider-specific AI code outside editor state.
