# Nghien cuu he thong HTML Layout Canvas cho tao anh AI

Cap nhat 2026-07-07: ho so code hien hanh da duoc tach sang `AI_LAYOUT_SYSTEM_PROFILE.md`.

Tai lieu nay giu vai tro research nen tang va ly do kien truc. Khi can code tiep, doc `AI_LAYOUT_SYSTEM_PROFILE.md` truoc de lay baseline hien tai, gap analysis, feature batches, endpoint can them, va acceptance criteria.

Ngay lap: 2026-07-04

## 1. Dinh nghia dung cua san pham

He thong nay khong phai la mot "trinh tao anh AI" truc tiep, cung khong phai la mot editor thiet ke tong quat nhu Figma. San pham nen duoc hieu la:

> Mot HTML-based visual layout editor de dung bo cuc anh truoc khi dua sang AI image generation.

Nguoi dung nhap y tuong ve mot buc anh, vi du:

> Tao anh quang cao nuoc hoa, chai san pham o giua, headline tren cung, nen sang trong, logo goc tren trai, uu dai o duoi.

He thong se tao mot ban mau bo cuc tren mot canvas. Canvas nay hien thi bang HTML/CSS, gom cac vung layout co the nhin thay va thao tac:

- vung anh san pham
- vung headline
- vung subtitle
- vung logo
- vung badge
- vung background
- vung decoration
- vung CTA hoac thong tin phu

Sau do nguoi dung co the sua theo hai cach:

- sua bang form/property panel: doi text, mau, anh, kich thuoc, toa do, font, z-index
- sua truc tiep tren canvas: click vao vung, keo, resize, rotate, phong to, thu nho

Gia tri that cua he thong nam o viec bien "y tuong hinh anh" thanh "bo cuc co cau truc", truoc khi AI render anh cuoi.

## 2. Nguyen ly kien truc

HTML la lop hien thi va tuong tac chinh, nhung khong nen la noi duy nhat luu trang thai.

Nen tach thanh 3 lop:

```text
Layout Document
  -> HTML Renderer
  -> Interaction Overlay
  -> Export / AI Pipeline
```

Trong do:

- `Layout Document`: du lieu co cau truc ve canvas va cac object.
- `HTML Renderer`: render object thanh DOM/CSS de nguoi dung thay nhu mot anh mau.
- `Interaction Overlay`: lop chon, drag, resize, rotate, snap, guides.
- `Export / AI Pipeline`: xuat thanh PNG/reference image, HTML, JSON, hoac dua vao AI image model.

Ly do can co `Layout Document`: neu chi sua truc tiep DOM, ve sau se kho undo/redo, export, luu project, cho AI sua layout, hoac tai lai mot ban thiet ke cu. DOM nen la ket qua render tu data, khong nen la noi duy nhat chua logic.

## 3. Luong trai nghiem nguoi dung

```text
1. Nguoi dung nhap y tuong
2. AI Layout Planner tao layout document
3. HTML canvas render thanh ban mau truc quan
4. Nguoi dung click vao tung vung de sua
5. Moi thay doi cap nhat lai layout document
6. Xuat anh layout/reference PNG
7. Gui reference PNG + assets + style prompt sang image model
8. Nhan anh cuoi
```

He thong nen cho phep nguoi dung dung o buoc 4 lau nhat. Day la noi san pham khac voi viec chi prompt anh AI.

## 4. Mo hinh du lieu de xuat

Nen goi la `LayoutDocument`, gom canvas, assets, objects, selection, metadata.

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

Canvas:

```ts
type CanvasSpec = {
  width: number;
  height: number;
  background: Fill;
  unit: "px";
  safeArea?: Box;
  bleed?: Box;
};
```

Object nen co truong chung:

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
  style?: ObjectStyle;
};
```

Cac object cu the:

```ts
type TextObject = BaseObject & {
  type: "text";
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: "left" | "center" | "right";
  lineHeight?: number;
};

type ImageObject = BaseObject & {
  type: "image";
  assetId: string;
  fit: "cover" | "contain" | "fill";
  alt?: string;
};

type ShapeObject = BaseObject & {
  type: "rectangle" | "circle";
  fill: Fill;
  stroke?: Stroke;
  radius?: number;
};

type GroupObject = BaseObject & {
  type: "group";
  children: string[];
};
```

Quan trong: object phai la "layout block" co y nghia, khong chi la HTML element. Vi du `product-image`, `headline`, `promo-badge`, `logo`, `feature-list`. AI planner va nguoi dung deu se thao tac tren cac block nay.

## 5. HTML Canvas khong phai `<canvas>`

Tu "canvas" trong san pham nay nen hieu la vung lam viec, khong nhat thiet la HTML `<canvas>`.

Nen dung DOM:

```html
<main class="editor">
  <aside class="layers"></aside>
  <section class="stage-wrapper">
    <div class="stage">
      <div class="layout-canvas">
        <div data-object-id="headline">...</div>
        <div data-object-id="product">...</div>
      </div>
      <div class="interaction-overlay"></div>
    </div>
  </section>
  <aside class="properties"></aside>
</main>
```

Moi object duoc render thanh mot DOM node voi style:

```css
[data-object-id] {
  position: absolute;
  transform-origin: center center;
}
```

Vi du:

```tsx
function RenderObject({ object }: { object: LayoutObject }) {
  const style = {
    left: object.x,
    top: object.y,
    width: object.width,
    height: object.height,
    opacity: object.opacity,
    zIndex: object.zIndex,
    transform: `rotate(${object.rotation}deg)`,
  };

  if (object.type === "text") {
    return (
      <div data-object-id={object.id} style={style}>
        {object.content}
      </div>
    );
  }

  return null;
}
```

## 6. Tuong tac truc tiep tren layout

Can ho tro:

- select mot object
- multi-select
- drag
- resize
- rotate
- duplicate
- delete
- lock/unlock
- snap grid
- snap guide
- align
- distribute
- bring forward/send backward
- zoom/pan
- keyboard shortcuts

Khuyen nghi ky thuat:

- Dung `Moveable` neu muon nhanh co drag/resize/rotate/scalable/warpable cho DOM element.
- Dung `interact.js` neu muon tu kiem soat event va snapping chi tiet hon.
- Dung `Selecto` hoac co che tu viet de multi-select bang drag box.
- Dung `dnd-kit` cho reorder layer panel, khong nhat thiet dung cho canvas object movement.

Can luu y: interaction library chi nen phat ra delta/toa do. Sau moi thao tac, app phai cap nhat `LayoutDocument`, roi DOM render lai tu state. Khong nen de library sua DOM mot cach vinh vien ngoai state.

## 7. State management

Nen dung store co cac slice:

```text
documentSlice
  - currentDocument
  - updateObject
  - addObject
  - removeObject
  - reorderObject

selectionSlice
  - selectedIds
  - hoverId
  - activeTool

historySlice
  - undoStack
  - redoStack
  - commitTransaction

uiSlice
  - zoom
  - pan
  - sidebar state
```

Zustand phu hop cho MVP vi nhe, it ceremony, va hop voi editor state. Nhung can thiet ke transaction:

- Khi drag dang dien ra: update visual tam thoi nhanh.
- Khi pointer up: commit mot history entry.
- Undo mot lan phai quay lai truoc ca thao tac drag, khong undo tung pixel.

## 8. AI Layout Planner

AI Planner khong nen tra ve HTML. Nen tra ve layout document theo schema.

Input:

```json
{
  "idea": "Poster quảng cáo nước hoa cao cấp",
  "canvas": { "width": 1080, "height": 1350 },
  "assets": [
    { "id": "product", "type": "image", "description": "chai nước hoa" },
    { "id": "logo", "type": "image", "description": "logo thương hiệu" }
  ],
  "style": "luxury, clean, editorial"
}
```

Output:

```json
{
  "canvas": { "width": 1080, "height": 1350 },
  "objects": [
    {
      "id": "headline",
      "type": "text",
      "name": "Headline",
      "x": 90,
      "y": 80,
      "width": 900,
      "height": 140,
      "content": "NEW ELEGANCE",
      "fontSize": 78,
      "zIndex": 10
    },
    {
      "id": "product",
      "type": "image",
      "name": "Product",
      "x": 300,
      "y": 360,
      "width": 480,
      "height": 620,
      "assetId": "product",
      "zIndex": 20
    }
  ]
}
```

Nen dung JSON Schema/structured output de bat model tra ra dung cau truc. Sau khi nhan output:

- validate schema
- normalize ids
- clamp toa do trong canvas
- fix z-index
- dam bao object co kich thuoc toi thieu
- gan default style neu thieu

## 9. Sua layout bang ngon ngu tu nhien

Nguoi dung co the noi:

- "Dich san pham len cao hon."
- "Cho headline lon hon va can giua."
- "Tao them badge sale o goc phai."
- "Nen trong hon, bot chu lai."

AI khong nen tra ve toan bo document moi moi lan. Nen tra ve patch:

```json
{
  "ops": [
    {
      "type": "updateObject",
      "id": "product",
      "patch": { "y": 280 }
    },
    {
      "type": "updateObject",
      "id": "headline",
      "patch": { "fontSize": 86, "align": "center" }
    }
  ]
}
```

Patch co loi ich:

- de review truoc khi apply
- de undo
- giam rui ro AI xoa nham object
- de hien diff cho nguoi dung

## 10. Export PNG/reference image

Co hai chien luoc export:

### Client-side export

Dung `html-to-image` de convert DOM node thanh PNG/SVG/JPEG. Cach nay nhanh, phu hop MVP va export tam thoi.

Han che:

- co the gap loi voi font remote, image CORS, CSS phuc tap
- ket qua co the khac giua trinh duyet
- kho dam bao pixel-perfect khi export hang loat

### Server-side/headless export

Dung Playwright/Chromium:

```text
LayoutDocument
-> render HTML export page
-> Playwright open page
-> screenshot canvas element
-> PNG
```

Phu hop khi can ket qua on dinh, export chat luong cao, batch render, hoac dung lam reference cho AI image generation.

Khuyen nghi:

- MVP: client-side export de nhanh co san pham.
- Production: them Playwright export service.

## 11. Pipeline sang AI image generation

Payload nen gom:

- reference PNG tu layout canvas
- product image goc
- logo/icon neu co
- style prompt
- negative constraints neu can
- output aspect ratio va size

Vi du prompt noi bo:

```text
Use the provided layout reference as strict composition guidance.
Keep object placement, relative scale, and text zones close to the reference.
Render final image in luxury advertising style.
Use the product image as the main product.
Do not invent extra product labels.
```

Reference PNG khong can dep nhu final. No can ro:

- dau la product
- dau la headline
- dau la logo
- vung nao la background
- do uu tien thi giac
- ti le va khoang cach

OpenAI image API hien co ho tro image generation/editing va workflow co input image; tai lieu OpenAI cung co tham so lien quan den fidelity cua input image cho reference/edit workflow. Neu tich hop nhieu provider, nen tao interface trung gian:

```ts
interface ImageProvider {
  generate(input: ImageGenerationInput): Promise<ImageGenerationResult>;
}
```

Roi viet adapter cho OpenAI, Flux, SDXL, v.v.

## 12. Kien truc module de xuat

```text
src/
  app/
    App.tsx
    routes/
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
  renderers/
    htmlRenderer.tsx
    exportHtml.ts
    svgRenderer.ts
  ai/
    planner.ts
    patcher.ts
    prompts.ts
    providers/
      openai.ts
      flux.ts
      sdxl.ts
  export/
    clientExport.ts
    playwrightExport.ts
  assets/
    assetStore.ts
  store/
    useEditorStore.ts
```

## 13. Lua chon cong nghe

De xuat stack:

- React + TypeScript: UI phuc tap, component hoa renderer, property panel.
- Vite: dev server/build nhanh cho app frontend hien dai.
- TailwindCSS: styling nhanh cho editor shell, toolbar, panel.
- Zustand: editor state nhe, de chia slice.
- Moveable hoac interact.js: thao tac DOM drag/resize/rotate.
- Selecto: multi-select bang drag selection neu dung Moveable ecosystem.
- dnd-kit: reorder layer list.
- html-to-image: export nhanh tu DOM node.
- Playwright: export on dinh bang Chromium screenshot.
- Zod hoac TypeScript JSON Schema: validate layout document va AI output.

Khong nen dung Konva lam lop chinh neu muc tieu la "layout duoc dien hoat bang HTML". Konva tot cho canvas 2D bitmap/vector, nhung se lam kho cac yeu to HTML that nhu text rich, CSS layout, form inline, DOM export, semantic HTML.

Co the dung Konva sau nay cho mot so effect rieng, nhung MVP nen DOM-first.

## 14. Cac man hinh chinh

### Editor Shell

Ba vung:

```text
Toolbar tren cung
Layers panel ben trai
Canvas o giua
Properties panel ben phai
```

### Canvas

- hien background
- hien object theo z-index
- click object de select
- hover object co outline nhe
- selected object co bounding box
- handles resize
- rotate handle
- zoom/pan
- grid/guides toggle

### Properties Panel

Theo object type:

- text: content, font, size, weight, color, align, line height
- image: upload/replace, fit, crop, opacity
- shape: fill, stroke, radius, shadow
- common: x, y, width, height, rotation, opacity, z-index, lock

### Layers Panel

- danh sach object theo z-index
- doi ten object
- an/hien
- lock/unlock
- reorder bang drag
- group/ungroup sau nay

## 15. Dieu kien MVP

MVP nen co:

- tao document moi voi canvas 1080x1350
- AI planner gia lap hoac template generator
- them text/image/rectangle
- render object bang HTML
- click select
- drag/resize
- properties panel cap nhat object
- layers panel co reorder co ban
- undo/redo
- export PNG client-side
- save/load JSON local

Chua can lam ngay:

- group nang cao
- boolean vector
- PSD/Figma export
- real-time collaboration
- animation timeline
- plugin marketplace
- full AI provider integration

## 16. Roadmap trien khai

### Phase 1: Editor data model

- dinh nghia schema `LayoutDocument`
- tao defaults va validator
- tao store Zustand
- tao commands: add/update/delete/reorder
- tao undo/redo transaction

### Phase 2: HTML renderer va UI co ban

- render canvas theo document
- render text/image/shape
- tao editor shell 3 cot
- properties panel update object
- layers panel hien danh sach object

### Phase 3: Interaction layer

- select object
- drag
- resize
- rotate
- keyboard shortcuts
- snap grid co ban
- multi-select

### Phase 4: AI planner

- tao prompt + schema cho layout generation
- validate output
- tao layout tu y tuong
- tao patch tu lenh sua bang ngon ngu tu nhien

### Phase 5: Export va image workflow

- export DOM sang PNG bang `html-to-image`
- tao export page sach khong co UI editor
- them Playwright export service
- gui reference PNG + assets sang image provider

### Phase 6: Production hardening

- asset management
- font loading
- CORS handling
- project persistence
- template library
- tests geometry/export
- performance optimization cho document lon

## 17. Rui ro ky thuat

### DOM export khong on dinh

CSS hien dai, font remote, anh cross-origin co the lam client-side export loi. Can co server-side Playwright export cho ban production.

### Drag/resize lam state qua nhieu

Neu moi pixel drag deu ghi vao history, undo se rat te. Can transaction model.

### AI tao layout xau hoac sai schema

Can structured output + validation + repair pass. Khong apply output truc tiep neu khong qua validator.

### Text overflow

Text trong layout quang cao rat de tran khung. Can co:

- auto-fit optional
- line clamp
- warning khi text overflow
- resize handle va font control ro rang

### Z-index va group phuc tap

Group nen de phase sau. MVP co flat object list se de on dinh hon.

### Pixel coordinate voi responsive UI

Canvas document dung pixel co dinh, con viewport editor co zoom/pan. Can tach:

- document coordinates
- screen coordinates
- zoom transform

Moi pointer event phai convert ve document coordinates truoc khi update object.

## 18. Ket luan kien truc

Kien truc phu hop nhat la:

```text
React app
  -> LayoutDocument store
  -> HTML/CSS canvas renderer
  -> DOM interaction layer
  -> property/layer panels
  -> export PNG/reference
  -> AI image provider
```

Can giu tinh than:

- nguoi dung thay va sua duoc layout truc tiep
- HTML la trai nghiem chinh tren canvas
- data model van phai co cau truc de luu, undo, export, va cho AI sua
- AI lap bo cuc, nguoi dung tinh chinh, image model render anh cuoi

Neu xay dung dung, san pham nay se giong mot "AI art director canvas": AI tao bo cuc ban dau, nguoi dung chinh vi tri/noi dung bang mat va tay, roi AI moi render anh hoan chinh.

## 19. Render stream: sua den dau ra hinh den do

Tinh nang "render stream" rat dang lam, nhung can dinh nghia dung. Neu hieu la moi pixel keo/resize deu goi AI image model de render final thi se rat ton kem, cham, va kho on dinh. Neu hieu la nguoi dung thay ket qua thay doi lien tuc theo nhieu cap do preview thi day la mot loi the san pham rat manh.

Nen chia render stream thanh 4 tang:

```text
Tang 1: Live HTML Preview
  -> cap nhat ngay lap tuc khi keo, resize, sua text

Tang 2: Raster Preview
  -> chup lai DOM canvas thanh PNG sau moi thay doi quan trong

Tang 3: AI Draft Stream
  -> goi image model chat luong thap/trung binh, co partial images neu provider ho tro

Tang 4: Final Render
  -> render chat luong cao khi nguoi dung bam generate/finalize
```

### Tang 1: Live HTML Preview

Day la "stream" quan trong nhat cho editor. Khi nguoi dung keo product, resize headline, doi mau nen, canvas HTML phai cap nhat ngay. Tang nay khong can AI.

Vi du:

```text
drag object
-> update transient transform
-> render DOM ngay
-> pointer up
-> commit LayoutDocument
```

Muc tieu la cam giac nhu Figma: thao tac den dau thay den do.

### Tang 2: Raster Preview

Sau khi document thay doi, app co the tao anh preview nho bang `html-to-image` hoac canvas snapshot. Khong nen chay tren tung pixel drag. Nen debounce:

```text
LayoutDocument changed
-> wait 300-800ms idle
-> export preview PNG low-res
-> update preview panel / reference thumbnail
```

Tang nay giup nguoi dung thay "neu xuat reference bay gio thi se trong the nao".

### Tang 3: AI Draft Stream

Day la noi "sua den dau ra hinh AI den do" bat dau co y nghia. Khi nguoi dung dung thao tac trong mot khoang ngan, he thong gui reference PNG + prompt sang image model de render ban draft.

Khuyen nghi:

- chi goi AI sau khi nguoi dung ngung thao tac, vi du debounce 1.5-3 giay
- dung chat luong thap/trung binh cho draft
- huy request cu neu co sua moi
- gan `renderJobId` de tranh anh cu ghi de anh moi
- hien trang thai `draft rendering`, `stale`, `ready`, `failed`
- chi render lai vung/doi tuong thay doi neu provider va pipeline ho tro

OpenAI Image API hien co ho tro streaming partial images cho image generation/editing. Tai lieu OpenAI noi co the nhan partial images trong luc API dang tao anh; tham so `partial_images` hien duoc mo ta voi khoang 0-3, va final image co the den truoc khi du so partial images neu anh tao xong nhanh. Dieu nay phu hop voi AI Draft Stream, nhung khong nen xem la realtime lien tuc theo tung thao tac chuot.

### Tang 4: Final Render

Final render nen la hanh dong ro rang:

```text
User clicks Generate Final
-> freeze current layout reference
-> use high quality
-> use full prompt/assets
-> save result to render history
```

Ly do: final render ton chi phi hon, cham hon, va can tinh lap lai cao hon.

## 20. Kien truc render stream de xuat

Can them cac module:

```text
render/
  renderQueue.ts
  renderJob.ts
  previewExporter.ts
  aiDraftRenderer.ts
  renderCache.ts
```

State can them:

```ts
type RenderState = {
  currentPreviewUrl?: string;
  currentDraftUrl?: string;
  activeJobId?: string;
  status: "idle" | "exporting-preview" | "rendering-draft" | "ready" | "failed";
  lastRenderedDocumentHash?: string;
};
```

Moi lan document thay doi:

```text
1. HTML canvas update ngay
2. schedule preview export
3. neu auto AI draft bat: schedule AI draft render
4. neu co thay doi moi: cancel/deprecate job cu
5. chi apply ket qua neu jobId van la job moi nhat
```

Pseudo-flow:

```ts
function onDocumentChanged(document: LayoutDocument) {
  updateLiveHtml(document);
  schedulePreviewExport(document, { debounceMs: 500 });

  if (autoDraftEnabled) {
    scheduleAiDraft(document, {
      debounceMs: 2000,
      quality: "low",
      partialImages: 1,
    });
  }
}
```

### Cancellation va stale result

Can co hai co che:

- `AbortController` de huy request/export neu lam duoc
- `jobId`/`documentHash` de bo qua ket qua cu neu request khong huy duoc

Khong co stale guard thi nguoi dung co the sua layout moi, nhung anh render cu ve cham hon va ghi de len preview moi.

### Render budget

Nen co che do:

- `Manual`: chi render AI khi bam nut
- `Auto Draft`: render sau khi nguoi dung idle
- `Live Draft`: render thuong xuyen hon, chi dung khi nguoi dung chap nhan ton chi phi

Mac dinh nen la `Auto Draft`, khong nen la `Live Draft`.

### Cache

Moi render job nen gan hash:

```text
hash(LayoutDocument + assets + stylePrompt + providerSettings)
```

Neu hash da co ket qua, hien lai ngay thay vi render moi.

### UI de xuat

Nen co mot panel ben phai hoac bottom strip:

```text
Reference Preview | AI Draft | Final Result
```

Trong editor:

- Canvas chinh van la HTML layout editor.
- AI Draft nam o panel rieng, khong thay the canvas chinh.
- Khi draft dang stream, hien partial image cap nhat dan.
- Neu layout thay doi trong luc render, gan label `outdated` cho draft cu.

### Tai sao khong nen render final lien tuc

- Chi phi API tang rat nhanh.
- Do tre image model khong phu hop voi tung pixel drag.
- Ket qua AI co tinh bien thien, co the lam nguoi dung mat cam giac kiem soat.
- Neu final image lien tuc thay doi, nguoi dung kho biet thay doi layout nao gay ra ket qua nao.

Cach dung tot hon:

```text
HTML canvas = realtime control
AI Draft Stream = fast visual feedback
Final Render = output chat luong cao
```

Ket luan: render stream nen la mot tinh nang cot loi, nhung phai duoc thiet ke theo dang progressive rendering, khong phai goi AI lien tuc tren moi thao tac nho.

## 21. Image input workflows

Can bo sung hai workflow moi:

1. Bien mot anh co san thanh `LayoutDocument`.
2. Dua mot anh san pham mau vao lam chu the tren layout.

Hai workflow nay khong nen tron vao planner text-to-layout hien tai. Nen tach thanh lop `Image Input Pipeline`:

```text
Image asset
-> asset ingestion
-> image analysis
-> structured extraction / placement patch
-> LayoutDocument
-> HTML canvas
```

Ket luan ngan:

- Product image placement nen lam truoc: upload product image, gan vao object `product-image`, export PNG voi anh that.
- Source image to layout nen lam theo tung muc: underlay + manual trace truoc, AI structured extraction sau.
- AI vision khi them vao phai tra ve schema co validation, confidence, source bbox va warnings.

Chi tiet nam trong `IMAGE_INPUT_WORKFLOWS_RESEARCH.md`.

## 22. Nguon da doi chieu

- Vite guide: https://vite.dev/guide/
- React learning docs: https://react.dev/learn
- Tailwind CSS with Vite: https://tailwindcss.com/docs/installation/using-vite
- interact.js docs: https://interactjs.io/docs/
- Moveable: https://daybrush.com/moveable/
- Selecto: https://daybrush.com/selecto/
- dnd-kit docs: https://dndkit.com/
- html-to-image: https://github.com/bubkoo/html-to-image
- Playwright screenshots: https://playwright.dev/docs/screenshots
- OpenAI image generation guide: https://developers.openai.com/api/docs/guides/image-generation
- OpenAI image generation streaming events: https://developers.openai.com/api/reference/resources/images/generation-streaming-events/
- OpenAI structured outputs guide: https://developers.openai.com/api/docs/guides/structured-outputs
