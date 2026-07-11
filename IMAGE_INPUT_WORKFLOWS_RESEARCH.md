# Nghien cuu Image Input Workflows

Ngay lap: 2026-07-05

Muc tieu: them hai nang luc moi vao AI Layout Studio:

1. Bien mot anh co san thanh `LayoutDocument`.
2. Dua mot anh san pham mau vao lam chu the tren layout.

Hai nang luc nay nen dung chung mot lop ha tang: asset upload, image analysis, structured extraction, layout patch, va preview/export.

## 1. Tong quan kien truc

```text
Input image / product image
-> Asset ingestion
-> Image analysis
-> Structured output
-> LayoutDocument / Patch ops
-> HTML canvas editor
-> Reference PNG / AI render
```

Khac biet chinh:

- Anh co san -> layout: AI/doc processing co nhiem vu "doc" bo cuc va tao document moi.
- Anh san pham -> layout: he thong luu anh nhu asset va gan asset vao object `product-image` tren document co san.

## 2. Feature A: Bien anh co san thanh layout

### Dinh nghia

Nguoi dung upload mot anh quang cao/poster/thumbnail/co san. He thong phan tich:

- kich thuoc canvas
- background
- cac vung text
- logo
- product/chu the
- badge/CTA
- decoration
- hierarchy va z-index tuong doi

Sau do tao `LayoutDocument` co cac object tuong ung.

### Luong de xuat

```text
Upload source image
-> Store as AssetRef
-> Create analysis job
-> AI vision + optional OCR/CV extracts regions
-> Convert regions to LayoutObjects
-> Show original image as underlay
-> User accepts/edits generated layout
-> Save as project
```

### Vi sao can underlay

Image-to-layout se khong chinh xac 100% ngay tu dau. Nen editor hien:

```text
Original image underlay
+ editable layout blocks overlay
```

Nguoi dung co the keo/sua block de can lai voi anh goc. Sau khi on, tat underlay de tiep tuc chinh layout.

### Output schema de xuat

```ts
type ImageLayoutExtraction = {
  sourceAssetId: string;
  canvas: {
    width: number;
    height: number;
    unit: "px";
  };
  objects: ExtractedLayoutObject[];
  styleHints: {
    palette: string[];
    mood?: string;
    typography?: string[];
    backgroundDescription?: string;
  };
  confidence: number;
  warnings: string[];
};

type ExtractedLayoutObject = {
  id: string;
  type: "text" | "image" | "product-image" | "logo" | "badge" | "rectangle" | "circle" | "decoration";
  role: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  text?: string;
  description?: string;
  confidence: number;
  source: "vision" | "ocr" | "cv" | "manual";
};
```

### Mapping sang LayoutDocument

```text
canvas.width/height -> source image dimensions
detected text -> text object
detected product -> product-image placeholder or cropped asset
detected logo -> logo object
detected badge/CTA -> badge/text/shape group
palette/background -> canvas background + style hints
```

Nen luu them metadata tren object:

```ts
type LayoutObjectAnalysisMeta = {
  extractedFromAssetId?: string;
  extractionConfidence?: number;
  sourceBBox?: Box;
  originalText?: string;
};
```

Neu model/CV nhan dien sai, nguoi dung van co bang chung de sua.

## 3. Feature B: Dua anh san pham mau vao layout

### Dinh nghia

Nguoi dung upload anh san pham, vi du chai nuoc hoa, lon ca phe, hop my pham. He thong luu anh do nhu asset va dat no vao object `product-image` tren layout.

### Luong de xuat

```text
Upload product image
-> Store as asset
-> Analyze dimensions/transparency/background
-> Optional remove background / create mask
-> Select target product slot
-> Set product object assetId
-> Fit/crop/scale inside product slot
-> Export reference PNG
-> Final AI render uses product image as subject reference
```

### Data model can bo sung

```ts
type AssetRef = {
  id: string;
  type: "image";
  kind: "source-layout" | "product" | "logo" | "icon" | "background" | "reference";
  name: string;
  src: string;
  mimeType: string;
  width: number;
  height: number;
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

Object `product-image` nen co:

```ts
type ProductImageObject = BaseObject & {
  type: "product-image";
  assetId: string;
  fit: "contain" | "cover" | "fill";
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  subjectLock?: true;
  promptRole?: "primary-product";
};
```

### Xu ly anh san pham

Co 3 muc:

1. MVP: dung anh goc, fit `contain` vao product box.
2. Better: neu anh co alpha thi render thang PNG trong DOM.
3. Advanced: background removal/mask de tach san pham khoi nen.

MVP nen lam muc 1 truoc. Khong nen doi den khi co remove background moi cho upload, vi gia tri dau tien la "dat san pham that vao layout".

## 4. AI/CV pipeline de xuat

### Pipeline nhe cho MVP

```text
Upload image
-> read dimensions
-> store asset
-> user picks mode:
   - source layout image
   - product image
-> deterministic placement
```

Khong can AI ngay de co gia tri:

- product image co the dat vao product slot ngay
- source layout image co the lam underlay de user trace thu cong

### Pipeline AI vision

```text
Upload source image
-> send image + extraction schema to vision model
-> receive structured regions
-> validate schema
-> normalize to LayoutDocument
-> expose confidence/warnings
```

Nen dung structured output de model tra ve JSON co rang buoc. Tai lieu OpenAI Structured Outputs khuyen dung JSON Schema de ep output theo cau truc; dieu nay rat hop voi `ImageLayoutExtraction` va `LayoutDocument`.

### Pipeline hybrid tot nhat

```text
CV preprocessing:
  - dimensions
  - dominant colors
  - alpha/background kind
  - optional OCR

AI vision:
  - semantic roles
  - hierarchy
  - style hints
  - object descriptions

Normalizer:
  - clamp boxes
  - assign zIndex
  - map roles to object types
  - validate LayoutDocument
```

## 5. Backend API de xuat

### Asset upload

```http
POST /api/assets
Content-Type: multipart/form-data
```

Response:

```json
{
  "asset": {
    "id": "asset-product-abc123",
    "kind": "product",
    "src": "/assets/asset-product-abc123.png",
    "width": 1200,
    "height": 1600,
    "mimeType": "image/png",
    "analysis": {
      "hasAlpha": true,
      "backgroundKind": "transparent"
    }
  }
}
```

### Analyze existing image into layout

```http
POST /api/image-layout/analyze
```

Input:

```json
{
  "assetId": "asset-source-ad",
  "mode": "advertisement",
  "targetSchema": "layout-document-v0"
}
```

Response:

```json
{
  "extraction": {},
  "document": {},
  "warnings": [],
  "confidence": 0.82
}
```

### Create project from source image

```http
POST /api/projects/from-image
```

Input:

```json
{
  "assetId": "asset-source-ad",
  "useUnderlay": true
}
```

### Place product image into layout

```http
POST /api/projects/:id/place-product
```

Input:

```json
{
  "assetId": "asset-product",
  "targetObjectId": "product",
  "fit": "contain",
  "subjectLock": true
}
```

Response:

```json
{
  "project": {},
  "appliedOps": [
    {
      "type": "replaceAsset",
      "asset": {}
    },
    {
      "type": "updateObject",
      "id": "product",
      "patch": {
        "assetId": "asset-product",
        "fit": "contain",
        "subjectLock": true
      }
    }
  ]
}
```

## 6. Frontend UX de xuat

Them tab/panel `Inputs` hoac `Assets`:

```text
Inputs
  - Import layout image
  - Upload product image
  - Upload logo
  - Analyze image
  - Place into selected slot
```

### Import layout image UX

1. User upload anh co san.
2. App tao project moi voi image underlay.
3. User bam `Analyze layout`.
4. App hien detected blocks tren anh.
5. User accept/edit.

### Product image UX

1. User upload product.
2. User chon object `product`.
3. Bam `Use as product`.
4. Object product hien anh that.
5. Export PNG/reference dung anh that trong layout.

## 7. Rui ro va cach giam

### Image-to-layout khong chinh xac

Giam rui ro:

- luu confidence tung object
- hien original underlay
- cho user sua ngay tren canvas
- validate LayoutDocument truoc khi save/render

### OCR/text sai

Giam rui ro:

- text object can co `originalText` va `content`
- UI danh dau text confidence thap
- user sua trong properties panel

### Product image co nen phuc tap

MVP dung fit contain truoc. Advanced moi them remove background/mask.

### Provider lock-in

Tach thanh adapter:

```ts
interface VisionLayoutProvider {
  analyzeLayout(input: AnalyzeLayoutInput): Promise<ImageLayoutExtraction>;
}

interface ImageAssetProcessor {
  analyzeAsset(asset: AssetRef): Promise<ImageAssetAnalysis>;
}
```

Backend khong nen hard-code OpenAI vao project store/editor commands.

## 8. Thu tu trien khai khuyen nghi

### Phase 1: Asset infrastructure

- `POST /api/assets`
- static serving `/assets/:id`
- save metadata width/height/mime
- frontend asset panel

### Phase 2: Product placement MVP

- upload product image
- set selected `product-image.assetId`
- render real image in frontend/backend HTML
- export PNG with real product

### Phase 3: Source image underlay

- upload source layout image
- create project with underlay image object locked
- user can manually trace/add blocks

### Phase 4: AI image-to-layout

- structured extraction schema
- provider adapter
- analyze endpoint
- confidence UI
- accept/reject generated blocks

### Phase 5: Product subject lock for final render

- include product asset in final image provider payload
- prompt says product image is primary subject
- preserve layout reference composition

## 9. Ket luan

Nen lam `product image placement` truoc, vi gia tri cao va de kiem chung: upload anh san pham, dat vao product slot, export PNG. Sau do lam `source image underlay`, roi moi den AI image-to-layout hoan chinh.

`Image-to-layout` khong nen bat dau bang AI full-auto. Nen bat dau bang underlay + manual trace + structured extraction sau. Cach nay cho ra san pham dung duoc som, trong khi van mo duong cho AI vision.

## 10. Nguon da doi chieu

- OpenAI image generation guide: https://developers.openai.com/api/docs/guides/image-generation
- OpenAI structured outputs guide: https://developers.openai.com/api/docs/guides/structured-outputs
