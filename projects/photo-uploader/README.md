# Photo Uploader — Angular

**Standalone** Angular component for uploading images via **click, drag & drop, or camera**, with built-in preview and full **Reactive Forms** support.

## Features

- **Standalone** component (no NgModule required)
- Multiple image selection
- Automatic preview (blob URLs via `URL.createObjectURL`)
- Drag & drop with visual feedback
- Paste images from the clipboard (Ctrl + V)
- Camera capture (`getUserMedia`)
- Image compression (`maxWidth`, `maxHeight`, `quality`)
- EXIF orientation correction (rotated phone photos display correctly)
- Reorder thumbnails — drag & drop on desktop, long-press on touch
- **Reactive Forms** integration (`ControlValueAccessor`)
- Automatic disabled / enabled state with Forms
- Visual invalid state (`NgControl`)
- Reusable validators included
- Configurable visual inputs
- **No third-party dependencies** — only Angular packages required

## Requirements

- Angular 16+

## Installation

```bash
npm install ngx-photo-uploader
```

## Basic usage

### With Reactive Forms

```ts
import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PhotoUploaderComponent, photoMaxFiles, photoMaxSize } from 'ngx-photo-uploader';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, PhotoUploaderComponent],
  template: `
    <form [formGroup]="form">
      <photo-uploader formControlName="photos"></photo-uploader>
    </form>
  `
})
export class ExampleComponent {
  form = this.fb.group({
    photos: [
      [] as File[],
      [Validators.required, photoMaxFiles(3), photoMaxSize(2 * 1024 * 1024)]
    ]
  });

  constructor(private fb: FormBuilder) {}
}
```

The control value is always `File[]`, ready for `FormData`, REST APIs, or multipart uploads.

> ⚠️ **Note**: `Validators.required` does not flag empty arrays in Angular. Use the bundled `photoRequired` validator instead.

## Configurable inputs

| Input           | Type    | Default            | Description                 |
| --------------- | ------- | ------------------ | --------------------------- |
| `multiple`      | `boolean` | `true`           | Allow multiple photos       |
| `accept`        | `string` | `image/*`          | Accepted file types         |
| `maxFiles`      | `number` | *unlimited*        | Maximum number of photos    |
| `maxWidth`      | `number` | *unlimited*        | Max width in px (keeps aspect ratio) |
| `maxHeight`     | `number` | *unlimited*        | Max height in px (keeps aspect ratio) |
| `quality`       | `number` | `0.9`              | JPEG/WebP compression quality (0-1) |
| `height`        | `string` | `200px`            | Container height            |
| `thumbnailSize` | `number` | `100`              | Thumbnail size (px)         |
| `gap`           | `number` | `10`               | Space between thumbnails (px) |
| `rounded`       | `number` | `10`               | Corner radius (px)          |
| `placeholder`   | `string` | Default text       | Placeholder text            |

### Example

```html
<photo-uploader
  formControlName="photos"
  [multiple]="true"
  [maxFiles]="5"
  height="280px"
  [thumbnailSize]="120"
  [gap]="16"
  [rounded]="16"
  placeholder="Drag your team photos here"
></photo-uploader>
```

## Camera

The component includes a **"Use camera"** button to capture images directly from the device:

- Mobile friendly
- Uses the rear camera (`facingMode: environment`)
- The capture is automatically converted to a `File` (JPEG)
- Tracks are stopped on close to avoid leaks

> Requires a **HTTPS** connection (or localhost) due to `getUserMedia`.

## Paste from clipboard

Press `Ctrl + V` (or `Cmd + V` on macOS) anywhere on the page to paste an image from the clipboard (e.g. screenshots). Pasted images are processed exactly like uploaded ones, so `maxFiles`, validators and compression all apply.

> The paste is not intercepted when the focus is inside an `input` or `textarea`.

## Image compression

Set `maxWidth` and/or `maxHeight` to automatically scale down images **before** they are emitted as `File`. The aspect ratio is preserved and the file is re-encoded with the configured `quality`.

```html
<photo-uploader
  formControlName="photos"
  [maxWidth]="1024"
  [maxHeight]="768"
  [quality]="0.8"
></photo-uploader>
```

- Only JPEG, PNG and WebP images are compressed; GIF and SVG are kept as-is.
- Images already within the limits are left untouched (no re-encoding).
- Compression also applies to camera captures and pasted images.

## EXIF orientation

Photos taken with a phone or camera often carry an EXIF orientation flag (rotation), so they appear rotated in browsers. When compression is enabled, the component reads the flag from **JPEG** files and **bakes the correct rotation** into the re-encoded image — the emitted file no longer depends on the EXIF flag and always displays upright.

- EXIF is read from JPEG files only; PNG and WebP are re-encoded as-is and GIF/SVG are never touched.
- Applied on upload, camera capture and paste.
- Without compression settings, the original file is preserved as-is; the preview still displays correctly because browsers render images with EXIF orientation by default (`image-orientation: from-image`).

## Image reordering

Thumbnails can be reordered in two ways:

- **Drag & drop** (mouse/desktop): drag a thumbnail and drop it on another position.
- **Touch** (mobile): press and hold the drag handle (`long-press`) to pick it up, then drag with your finger. A floating preview follows your finger and the target position is highlighted.

The emitted `File[]` follows the new order, so the images are uploaded in the order the user left them.

- Only the order changes — files are **not** re-encoded on reorder.
- Works with `Reactive Forms`: the control value reflects the new order immediately.

## Bundled validators

The library exports reusable validators:

```ts
import {
  photoRequired,
  photoMaxFiles,
  photoMaxSize,
  photoAllowedTypes
} from 'ngx-photo-uploader';
```

```ts
this.form = this.fb.group({
  photos: [
    [] as File[],
    [
      photoRequired,
      photoMaxFiles(5),
      photoMaxSize(2 * 1024 * 1024),
      photoAllowedTypes(['image/png', 'image/jpeg'])
    ]
  ]
});
```

### Error handling

```html
<div *ngIf="form.controls.photos.touched">
  <small *ngIf="form.controls.photos.errors?.required">
    You must upload at least one image
  </small>
  <small *ngIf="form.controls.photos.errors?.maxFiles">
    Maximum {{ form.controls.photos.errors.maxFiles.max }} images
  </small>
  <small *ngIf="form.controls.photos.errors?.maxSize">
    The file {{ form.controls.photos.errors.maxSize.fileName }}
    exceeds the allowed size
  </small>
</div>
```

## Accessibility & states

- Automatic disabled state with Forms
- Visual invalid state (red border) via `NgControl`
- Aria-labels on thumbnails (`Imagen N`), remove buttons (`Eliminar foto N`) and upload icon (decorative, `aria-hidden`)
- Native `<button>` elements for camera, capture/cancel and clear actions — keyboard accessible
- Touch targets ≥ 44×44px (WCAG 2.2 target size) on drag handle, remove buttons and action buttons

## Roadmap

**Done**

- ✅ Image compression (`maxWidth`, `maxHeight`, `quality`)
- ✅ Paste from clipboard (Ctrl + V)
- ✅ EXIF orientation correction
- ✅ Image reordering (drag & drop on desktop + long-press touch reorder)
- ✅ Touch targets ≥ 44px on thumbnails, actions and remove buttons

**1. Mobile support — highest priority** (an operator using an app from a phone with fingers only)

- Responsive layout that adapts to small screens
- Camera: switch front/rear, zoom and flash

**2. Accessibility (WCAG 2.2)**

- Accessible file picker (focusable drop zone, `role="button"` + keyboard)
- Keyboard drag-reorder (arrow keys / reorder buttons)
- Focus management and visible focus indicators
- ARIA live regions for upload feedback
- Sufficient color contrast (WCAG 2.2 AA)
- `prefers-reduced-motion` support

**3. Visual & image features** (leverage Angular's strengths for image preview)

- Cropping support
- Thumbnail badges (dimensions, file size, processing status)
- Custom placeholders and per-thumbnail actions via content projection (`ng-template`)

**4. Processing & API**

- HEIC/HEIF support (iPhone photos)
- Concurrent image compression with a concurrency limit
- Web Worker for heavy re-encoding (non-blocking UI)
- Per-image metadata output (`{ file, original, dimension, compressionRatio, error }`) and granular events (`photoAdded`, `photoRemoved`, `reordered`, `ready`)
- Per-format quality settings (`jpgQuality`, `pngCompression`) instead of a single `quality`
- Cancellable processing (`AbortController`) with per-thumbnail error state and retry
- `maxFiles` counter UX ("3/5") with auto-eviction of the oldest photo
- SSR / hydration support verification

**5. Distribution & quality**

- Theme customization
- i18n (multi-language)
- Visual regression tests (Playwright) and accessibility tests (axe-core)

> **Release cadence**: one feature per week after each release.

## License

MIT
