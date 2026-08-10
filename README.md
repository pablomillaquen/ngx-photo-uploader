# Photo Uploader — Angular

[![npm version](https://img.shields.io/npm/v/ngx-photo-uploader.svg)](https://www.npmjs.com/package/ngx-photo-uploader)
[![npm downloads](https://img.shields.io/npm/dm/ngx-photo-uploader.svg)](https://www.npmjs.com/package/ngx-photo-uploader)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Standalone** Angular component for uploading images via **click, drag & drop, or camera**, with built-in preview and full **Reactive Forms** support.

- Available on [npm](https://www.npmjs.com/package/ngx-photo-uploader)
- Source code lives in [`projects/photo-uploader`](projects/photo-uploader)

## Features

- **Standalone** component (no NgModule required)
- Multiple image selection
- Automatic preview (blob URLs via `URL.createObjectURL`)
- Drag & drop with visual feedback
- Paste images from the clipboard (Ctrl + V)
- Camera capture (`getUserMedia`)
- Image compression (`maxWidth`, `maxHeight`, `quality`)
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
- Aria-labels on action buttons

## Development

```bash
npm install
npm run build   # builds the library into dist/
npm test        # runs the unit tests (requires Chrome/Chromium)
```

## Roadmap

- ✅ Image compression (`maxWidth`, `maxHeight`, `quality`)
- ✅ Paste from clipboard (Ctrl + V)
- EXIF orientation correction
- Cropping support
- Image reordering
- Theme customization
- i18n

## License

MIT
