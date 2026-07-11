# LayoutDocument Reference

Use this reference when designing schemas, validators, AI planner outputs, patch operations, or harness fixtures.

## Minimal Shape

```ts
type LayoutDocument = {
  version: string;
  canvas: CanvasSpec;
  assets: AssetRef[];
  objects: LayoutObject[];
  guides?: Guide[];
  meta?: ProjectMeta;
};
```

## Asset Reference

```ts
type AssetRef = {
  id: string;
  type: "image";
  kind?: "source-layout" | "product" | "logo" | "icon" | "background" | "reference";
  name: string;
  src: string;
  mimeType?: string;
  width?: number;
  height?: number;
  thumbnailSrc?: string;
  analysis?: ImageAssetAnalysis;
};

type ImageAssetAnalysis = {
  hasAlpha?: boolean;
  dominantColors?: string[];
  subjectBBox?: Box;
  backgroundKind?: "transparent" | "plain" | "complex" | "unknown";
  suggestedFit?: "contain" | "cover";
};
```

## Canvas

```ts
type CanvasSpec = {
  width: number;
  height: number;
  background?: Fill;
  unit: "px";
  safeArea?: Box;
  bleed?: Box;
};
```

## Base Object

```ts
type BaseObject = {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  locked?: boolean;
  visible?: boolean;
  role?: string;
  style?: ObjectStyle;
  analysisMeta?: LayoutObjectAnalysisMeta;
};
```

```ts
type LayoutObjectAnalysisMeta = {
  extractedFromAssetId?: string;
  extractionConfidence?: number;
  sourceBBox?: Box;
  originalText?: string;
};
```

## Core Object Types

- `text`: `content`, font fields, color, alignment.
- `image`: `assetId`, `fit`, optional crop metadata.
- `rectangle`: fill/stroke/radius.
- `circle`: fill/stroke.
- `group`: child object ids.
- Product-specific roles can be represented with `role`, for example `product`, `headline`, `logo`, `promo-badge`.

For product placement, prefer a `product-image` object with:

```ts
type ProductImageObject = BaseObject & {
  type: "product-image";
  assetId: string;
  fit: "contain" | "cover" | "fill";
  crop?: Box;
  subjectLock?: true;
  promptRole?: "primary-product";
};
```

## Required Invariants

- Canvas width and height are positive numbers.
- Object ids are unique.
- Object ids use stable machine-readable strings.
- Each object has positive width and height.
- Coordinates are document coordinates, not screen coordinates.
- `opacity` is between `0` and `1`.
- `zIndex` is numeric and deterministic.
- Image objects reference an existing `assetId`.
- Group children reference existing object ids and do not reference the group itself.
- AI output must be validated and normalized before entering editor state.

## Patch Operations

Prefer patch commands for AI edits:

```json
{
  "ops": [
    {
      "type": "updateObject",
      "id": "product",
      "patch": { "y": 280 }
    }
  ]
}
```

Supported operation families:

- `addObject`
- `updateObject`
- `removeObject`
- `reorderObject`
- `setCanvas`
- `replaceAsset`

Reject unknown operations by default. Clamp geometry after applying a patch.
