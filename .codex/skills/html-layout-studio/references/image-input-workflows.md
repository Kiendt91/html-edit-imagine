# Image Input Workflows Reference

Use this reference when implementing source-image-to-layout, product image placement, image underlays, asset upload, or image analysis.

## Two Workflows

1. Source image to layout: upload an existing ad/poster/image, analyze regions, create a `LayoutDocument`, and keep the original image as an optional locked underlay.
2. Product image to layout: upload a product image, store it as an asset, and attach it to a `product-image` object.

## Recommended Order

1. Implement asset upload and static asset serving.
2. Implement product placement into an existing `product-image` slot.
3. Implement source image underlay for manual tracing.
4. Add AI vision extraction with structured output, confidence, warnings, and source bboxes.

## Asset Rules

- Store uploaded files as `AssetRef` records before adding them to layout objects.
- Preserve image dimensions and mime type.
- Record whether an image has alpha when possible.
- Product images should use `kind: "product"`.
- Source layout images should use `kind: "source-layout"`.

## Product Placement

Apply product placement as patch operations:

```json
{
  "ops": [
    { "type": "replaceAsset", "asset": { "id": "asset-product", "kind": "product" } },
    {
      "type": "updateObject",
      "id": "product",
      "patch": {
        "assetId": "asset-product",
        "fit": "contain",
        "subjectLock": true,
        "promptRole": "primary-product"
      }
    }
  ]
}
```

MVP should render the real image inside the product slot using `object-fit: contain`. Background removal can come later.

## Source Image To Layout

Start with underlay mode:

```text
Upload source image
-> create locked image object covering the canvas
-> user traces or AI adds layout blocks above it
```

AI extraction should return a structured result with:

- canvas dimensions
- object type and role
- bounding boxes
- extracted text
- confidence per object
- warnings
- style hints

Do not apply low-confidence extraction silently. Let the user review and edit blocks.

## Provider Boundary

Keep AI provider code behind an adapter:

```ts
interface VisionLayoutProvider {
  analyzeLayout(input: AnalyzeLayoutInput): Promise<ImageLayoutExtraction>;
}
```

The editor and project store should only see validated `LayoutDocument` and patch ops.
