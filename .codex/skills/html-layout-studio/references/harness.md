# Harness Reference

Use this reference when validating architecture-level work.

## Command

Run from the project root:

```bash
node harness/layout-harness.mjs
```

Or use the skill helper from the project root:

```bash
node .codex/skills/html-layout-studio/scripts/run-project-harness.mjs
```

Run a specific document:

```bash
node harness/layout-harness.mjs path/to/layout.json
```

## Coverage

The harness checks:

- `LayoutDocument` root shape.
- Canvas positive dimensions and `px` unit.
- Unique object ids.
- Supported object types.
- Positive object size.
- Numeric geometry fields.
- Opacity bounds.
- Image `assetId` references.
- Group child references.
- Render stream policy values.

## Expected Fixture Behavior

- `harness/fixtures/valid-perfume-ad.layout.json` must pass.
- `harness/fixtures/invalid-layout.layout.json` must fail.
- `harness/render-stream.policy.json` must pass.

If a new object type or render mode is added, update both the harness and fixtures.
