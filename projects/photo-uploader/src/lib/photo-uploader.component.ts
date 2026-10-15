import {
  Component,
  ElementRef,
  HostListener,
  Input,
  NgZone,
  OnDestroy,
  Optional,
  Self,
  ViewChild
} from '@angular/core';
import { ControlValueAccessor, NgControl } from '@angular/forms';

@Component({
  selector: 'photo-uploader',
  standalone: true,
  imports: [],
  templateUrl: './photo-uploader.component.html',
  styleUrl: './photo-uploader.component.scss'
})
export class PhotoUploaderComponent implements ControlValueAccessor, OnDestroy {
  @Input() multiple = true;
  @Input() accept = 'image/*';
  @Input() maxFiles?: number;

  @Input() maxWidth?: number;
  @Input() maxHeight?: number;
  @Input() quality = 0.9;

  @Input() height = '200px';
  @Input() thumbnailSize = 100;
  @Input() gap = 10;
  @Input() rounded = 10;
  @Input() placeholder = 'Click o arrastra para cargar fotos';
  @Input() showBadges = true;
  @Input() enableCropping = false;
  @Input() cropAspect: 'free' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16' = 'free';

  @ViewChild('video') videoElement?: ElementRef<HTMLVideoElement>;
  @ViewChild('thumbnailsEl') thumbnailsEl?: ElementRef<HTMLDivElement>;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('uploadContainer') uploadContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('cameraToggle') cameraToggle?: ElementRef<HTMLButtonElement>;
  @ViewChild('captureButton') captureButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('cropStage') cropStageEl?: ElementRef<HTMLDivElement>;
  @ViewChild('cropImg') cropImgEl?: ElementRef<HTMLImageElement>;

  thumbnails: string[] = [];
  thumbMeta: ({ width: number; height: number } | null)[] = [];
  selectedPhotos: File[] = [];

  isDragging = false;
  isDisabled = false;
  isCameraOpen = false;
  videoStream?: MediaStream;
  dragIndex: number | null = null;

  get isTouchDevice(): boolean {
    return typeof window !== 'undefined' && ('ontouchstart' in window || matchMedia('(pointer: coarse)').matches);
  }

  isTouchDragging = false;
  touchDragIndex: number | null = null;
  touchInsertIndex = -1;
  touchDragX = 0;
  touchDragY = 0;
  touchDragSize = 0;
  private touchTimer: ReturnType<typeof setTimeout> | undefined;
  private touchStartX = 0;
  private touchStartY = 0;

  private static instanceCounter = 0;
  readonly hintId = `ngx-photo-uploader-hint-${++PhotoUploaderComponent.instanceCounter}`;
  readonly cropTitleId = `ngx-photo-uploader-crop-title-${PhotoUploaderComponent.instanceCounter}`;
  readonly cropHintId = `ngx-photo-uploader-crop-hint-${PhotoUploaderComponent.instanceCounter}`;
  announcement = '';
  private destroyed = false;

  onChange: (value: File[]) => void = () => {};
  onTouched: () => void = () => {};

  constructor(
    private ngZone: NgZone,
    @Optional() @Self() public ngControl?: NgControl
  ) {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  // ---------- ControlValueAccessor ----------

  writeValue(files: File[] | null): void {
    this.clearThumbnails();
    this.selectedPhotos = files ?? [];

    this.selectedPhotos.forEach((file, index) => {
      this.thumbnails.push(URL.createObjectURL(file));
      this.thumbMeta.push(null);
      this.queueDimsLoad(index);
    });
  }

  registerOnChange(fn: (value: File[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
  }

  // ---------- Accesibilidad (WCAG 2.2) ----------

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearTouchTimer();
    this.thumbnails.forEach((url) => URL.revokeObjectURL(url));
    this.closeCamera();
  }

  openFilePicker(): void {
    if (this.isDisabled) {
      return;
    }
    this.fileInput?.nativeElement.click();
  }

  onUploadKeydown(event: KeyboardEvent): void {
    if (this.isDisabled) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      this.openFilePicker();
    }
  }

  onThumbnailKeydown(event: KeyboardEvent, index: number): void {
    if (this.isDisabled) {
      return;
    }
    let to = -1;
    if (event.key === 'ArrowLeft') {
      to = index - 1;
    } else if (event.key === 'ArrowRight') {
      to = index + 1;
    } else if (event.key === 'Home') {
      to = 0;
    } else if (event.key === 'End') {
      to = this.thumbnails.length - 1;
    } else {
      return;
    }
    if (to < 0 || to >= this.thumbnails.length || to === index) {
      return;
    }
    event.preventDefault();
    this.applyMove(index, to);
    this.announce(`Foto movida a la posición ${to + 1} de ${this.thumbnails.length}`);
    setTimeout(() => this.focusThumbnail(to));
  }

  private announce(text: string): void {
    this.announcement = '';
    setTimeout(() => {
      if (!this.destroyed) {
        this.announcement = text;
      }
    });
  }

  private focusThumbnail(index: number): void {
    if (this.destroyed) {
      return;
    }
    const thumbs = this.thumbnailsEl?.nativeElement?.querySelectorAll<HTMLElement>('.thumbnail');
    const target = thumbs?.[index];
    if (target) {
      target.focus();
    } else {
      this.uploadContainer?.nativeElement.focus();
    }
  }

  // ---------- Badges de miniatura ----------

  badgeText(index: number): string | null {
    if (!this.showBadges) {
      return null;
    }
    const meta = this.thumbMeta[index];
    const file = this.selectedPhotos[index];
    if (!meta || !file) {
      return null;
    }
    return `${meta.width}\u00d7${meta.height} \u00b7 ${this.formatSize(file.size)}`;
  }

  thumbLabel(index: number): string {
    const meta = this.thumbMeta[index];
    const file = this.selectedPhotos[index];
    let label = `Foto ${index + 1} de ${this.thumbnails.length}`;
    if (meta && file) {
      label += `, ${meta.width}\u00d7${meta.height}, ${this.formatSize(file.size)}`;
    }
    return label + '. Usa las flechas para reordenar';
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private queueDimsLoad(index: number): void {
    const url = this.thumbnails[index];
    if (!url) {
      return;
    }
    this.readImageDims(url).then((dims) => {
      this.ngZone.run(() => {
        if (dims && this.thumbnails[index] === url) {
          this.thumbMeta[index] = dims;
        }
      });
    });
  }

  private readImageDims(url: string): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // ---------- Recorte de imágenes ----------

  private static readonly cropStageDefaultW = 480;
  private static readonly cropStageDefaultH = 320;

  cropOpen = false;
  cropIndex = -1;
  cropUrl = '';
  cropLoading = false;
  cropZoom = 1;
  cropOffsetX = 0;
  cropOffsetY = 0;
  cropNaturalW = 0;
  cropNaturalH = 0;
  cropFrameX = 0;
  cropFrameY = 0;
  cropFrameW = 0;
  cropFrameH = 0;
  cropPanning = false;
  private cropPanStartX = 0;
  private cropPanStartY = 0;
  private cropPanStartOffsetX = 0;
  private cropPanStartOffsetY = 0;

  get cropBaseScale(): number {
    if (!this.cropNaturalW || !this.cropNaturalH || !this.cropFrameW || !this.cropFrameH) {
      return 1;
    }
    return Math.max(this.cropFrameW / this.cropNaturalW, this.cropFrameH / this.cropNaturalH);
  }

  get cropDisplayScale(): number {
    return this.cropBaseScale * this.cropZoom;
  }

  get cropDisplayW(): number {
    return this.cropNaturalW * this.cropDisplayScale;
  }

  get cropDisplayH(): number {
    return this.cropNaturalH * this.cropDisplayScale;
  }

  openCrop(index: number): void {
    if (this.isDisabled || !this.enableCropping || this.cropOpen) {
      return;
    }
    const url = this.thumbnails[index];
    if (!url) {
      return;
    }
    this.cropIndex = index;
    this.cropUrl = url;
    this.cropOpen = true;
    this.cropLoading = true;
    this.cropZoom = 1;
    this.cropOffsetX = 0;
    this.cropOffsetY = 0;
    this.cropNaturalW = 0;
    this.cropNaturalH = 0;
    this.cropFrameX = 0;
    this.cropFrameY = 0;
    this.cropFrameW = 0;
    this.cropFrameH = 0;
    setTimeout(() => {
      if (!this.destroyed) {
        this.cropStageEl?.nativeElement.focus();
      }
    });
  }

  closeCrop(): void {
    if (!this.cropOpen) {
      return;
    }
    const index = this.cropIndex;
    this.cropOpen = false;
    this.cropIndex = -1;
    this.cropUrl = '';
    this.cropLoading = false;
    this.cropZoom = 1;
    this.cropOffsetX = 0;
    this.cropOffsetY = 0;
    this.cropNaturalW = 0;
    this.cropNaturalH = 0;
    this.cropFrameX = 0;
    this.cropFrameY = 0;
    this.cropFrameW = 0;
    this.cropFrameH = 0;
    this.cropPanning = false;
    setTimeout(() => {
      if (this.destroyed) {
        return;
      }
      const thumb = this.thumbnailsEl?.nativeElement.children[index] as HTMLElement | undefined;
      const cropButton = thumb?.querySelector<HTMLButtonElement>('.crop');
      if (cropButton && !cropButton.disabled) {
        cropButton.focus();
      } else {
        this.uploadContainer?.nativeElement.focus();
      }
    });
  }

  @HostListener('document:keydown.escape')
  onDocumentEscape(): void {
    if (this.cropOpen) {
      this.closeCrop();
    }
  }

  onCropImageLoad(event: Event): void {
    if (!this.cropOpen) {
      return;
    }
    const img = event.target as HTMLImageElement;
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    if (!naturalW || !naturalH) {
      this.onCropImageError();
      return;
    }
    const rect = this.cropStageEl?.nativeElement.getBoundingClientRect();
    const stageW = Math.round(rect?.width || 0) || PhotoUploaderComponent.cropStageDefaultW;
    const stageH = Math.round(rect?.height || 0) || PhotoUploaderComponent.cropStageDefaultH;
    this.cropNaturalW = naturalW;
    this.cropNaturalH = naturalH;
    const ratio = this.cropAspectRatio();
    if (!ratio) {
      this.cropFrameX = 0;
      this.cropFrameY = 0;
      this.cropFrameW = stageW;
      this.cropFrameH = stageH;
    } else {
      const scale = Math.min(stageW / ratio.w, stageH / ratio.h);
      this.cropFrameW = Math.round(ratio.w * scale);
      this.cropFrameH = Math.round(ratio.h * scale);
      this.cropFrameX = Math.round((stageW - this.cropFrameW) / 2);
      this.cropFrameY = Math.round((stageH - this.cropFrameH) / 2);
    }
    this.cropZoom = 1;
    this.cropOffsetX = (this.cropFrameW - this.cropDisplayW) / 2;
    this.cropOffsetY = (this.cropFrameH - this.cropDisplayH) / 2;
    this.clampCropOffset();
    this.cropLoading = false;
  }

  onCropImageError(): void {
    if (!this.cropOpen) {
      return;
    }
    this.announce('No se pudo recortar la foto');
    this.closeCrop();
  }

  private cropAspectRatio(): { w: number; h: number } | null {
    switch (this.cropAspect) {
      case '1:1':
        return { w: 1, h: 1 };
      case '4:3':
        return { w: 4, h: 3 };
      case '3:4':
        return { w: 3, h: 4 };
      case '16:9':
        return { w: 16, h: 9 };
      case '9:16':
        return { w: 9, h: 16 };
      default:
        return null;
    }
  }

  private clampCropOffset(): void {
    if (!this.cropDisplayW || !this.cropDisplayH) {
      this.cropOffsetX = 0;
      this.cropOffsetY = 0;
      return;
    }
    this.cropOffsetX = Math.min(
      Math.max(this.cropOffsetX, this.cropFrameW - this.cropDisplayW),
      0
    );
    this.cropOffsetY = Math.min(
      Math.max(this.cropOffsetY, this.cropFrameH - this.cropDisplayH),
      0
    );
  }

  setCropZoom(zoom: number): void {
    this.cropZoom = Math.min(Math.max(zoom, 1), 4);
    this.clampCropOffset();
  }

  setCropZoomFromEvent(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.setCropZoom(Number.isFinite(value) ? value : 1);
  }

  onCropKeydown(event: KeyboardEvent): void {
    if (!this.cropOpen || this.cropLoading) {
      return;
    }
    const step = event.shiftKey ? 1 : 16;
    let dx = 0;
    let dy = 0;
    switch (event.key) {
      case 'ArrowLeft':
        dx = -step;
        break;
      case 'ArrowRight':
        dx = step;
        break;
      case 'ArrowUp':
        dy = -step;
        break;
      case 'ArrowDown':
        dy = step;
        break;
      case '+':
      case '=':
        event.preventDefault();
        this.setCropZoom(this.cropZoom + 0.1);
        return;
      case '-':
      case '_':
        event.preventDefault();
        this.setCropZoom(this.cropZoom - 0.1);
        return;
      default:
        return;
    }
    event.preventDefault();
    this.cropOffsetX += dx;
    this.cropOffsetY += dy;
    this.clampCropOffset();
  }

  onCropPointerDown(event: PointerEvent): void {
    if (!this.cropOpen || this.cropLoading) {
      return;
    }
    this.cropPanning = true;
    this.cropPanStartX = event.clientX;
    this.cropPanStartY = event.clientY;
    this.cropPanStartOffsetX = this.cropOffsetX;
    this.cropPanStartOffsetY = this.cropOffsetY;
    const stage = this.cropStageEl?.nativeElement;
    if (
      stage &&
      typeof event.pointerId === 'number' &&
      typeof stage.setPointerCapture === 'function'
    ) {
      try {
        stage.setPointerCapture(event.pointerId);
      } catch {
      }
    }
  }

  onCropPointerMove(event: PointerEvent): void {
    if (!this.cropPanning) {
      return;
    }
    this.cropOffsetX = this.cropPanStartOffsetX + (event.clientX - this.cropPanStartX);
    this.cropOffsetY = this.cropPanStartOffsetY + (event.clientY - this.cropPanStartY);
    this.clampCropOffset();
  }

  onCropPointerUp(): void {
    this.cropPanning = false;
  }

  applyCrop(): void {
    if (!this.cropOpen || this.cropLoading || this.cropIndex < 0) {
      return;
    }
    const img = this.cropImgEl?.nativeElement;
    const index = this.cropIndex;
    const file = this.selectedPhotos[index];
    const scale = this.cropDisplayScale;
    if (!img || !file || !img.naturalWidth || !this.cropFrameW || !this.cropFrameH || !scale) {
      return;
    }
    const sx = -this.cropOffsetX / scale;
    const sy = -this.cropOffsetY / scale;
    const sw = this.cropFrameW / scale;
    const sh = this.cropFrameH / scale;
    const outW = Math.max(1, Math.round(sw));
    const outH = Math.max(1, Math.round(sh));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
    const mime = /^image\/(jpeg|png|webp)$/.test(file.type) ? file.type : 'image/jpeg';
    this.cropLoading = true;
    canvas.toBlob(
      (blob) => {
        this.ngZone.run(() => {
          if (this.destroyed) {
            return;
          }
          this.cropLoading = false;
          if (!blob) {
            this.announce('No se pudo recortar la foto');
            return;
          }
          const cropped = new File([blob], file.name, { type: mime });
          const oldUrl = this.thumbnails[index];
          this.closeCrop();
          if (oldUrl) {
            URL.revokeObjectURL(oldUrl);
          }
          this.thumbnails[index] = URL.createObjectURL(cropped);
          this.thumbMeta[index] = null;
          this.selectedPhotos[index] = cropped;
          this.notifyForm();
          this.queueDimsLoad(index);
          this.announce('Foto recortada');
        });
      },
      mime,
      this.quality
    );
  }

  // ---------- Selección de archivos ----------

  onFilesSelected(event: Event): void {
    if (this.isDisabled) {
      return;
    }
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.processFiles(Array.from(input.files));
      input.value = '';
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (this.isDisabled) {
      return;
    }
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    if (this.isDisabled) {
      return;
    }
    this.isDragging = false;
    if (event.dataTransfer?.files?.length) {
      this.processFiles(Array.from(event.dataTransfer.files));
    }
  }

  @HostListener('document:paste', ['$event'])
  onDocumentPaste(event: ClipboardEvent): void {
    if (this.isDisabled) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return;
    }
    const files = this.extractImageFiles(event);
    if (files.length) {
      event.preventDefault();
      this.processFiles(files);
    }
  }

  private extractImageFiles(event: ClipboardEvent): File[] {
    const files: File[] = [];
    const items = event.clipboardData?.items;
    if (items) {
      for (const item of Array.from(items)) {
        const file = item.kind === 'file' ? item.getAsFile() : null;
        if (file && file.type.startsWith('image/')) {
          files.push(file);
        }
      }
    }
    if (files.length === 0) {
      Array.from(event.clipboardData?.files ?? []).forEach((file) => {
        if (file.type.startsWith('image/')) {
          files.push(file);
        }
      });
    }
    return files;
  }

  removePhoto(index: number): void {
    if (this.isDisabled || index < 0 || index >= this.thumbnails.length) {
      return;
    }
    const url = this.thumbnails[index];
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.thumbnails.splice(index, 1);
    this.thumbMeta.splice(index, 1);
    this.selectedPhotos.splice(index, 1);
    this.notifyForm();
    const total = this.selectedPhotos.length;
    this.announce(
      total === 0 ? 'Todas las fotos eliminadas' : `Foto eliminada. Total: ${total} fotos`
    );
    setTimeout(() => {
      if (this.destroyed) {
        return;
      }
      if (total > 0) {
        this.focusThumbnail(Math.min(index, total - 1));
      } else {
        this.uploadContainer?.nativeElement.focus();
      }
    });
  }

  onDragStart(event: DragEvent, index: number): void {
    if (this.isDisabled) {
      return;
    }
    this.dragIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData?.('text/plain', String(index));
    }
  }

  onThumbDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onThumbDrop(event: DragEvent, index: number): void {
    event.preventDefault();
    if (this.isDisabled || this.dragIndex === null) {
      return;
    }
    const from = this.dragIndex;
    this.dragIndex = null;
    this.applyMove(from, index);
  }

  onDragEnd(): void {
    this.dragIndex = null;
  }

  private applyMove(from: number, to: number): void {
    if (from === to || from < 0 || from >= this.thumbnails.length || to > this.thumbnails.length) {
      return;
    }
    const [thumbnail] = this.thumbnails.splice(from, 1);
    this.thumbnails.splice(to, 0, thumbnail);
    const [meta] = this.thumbMeta.splice(from, 1);
    this.thumbMeta.splice(to, 0, meta);
    const [photo] = this.selectedPhotos.splice(from, 1);
    this.selectedPhotos.splice(to, 0, photo);
    this.notifyForm();
  }

  // ---------- Reordenado táctil (long-press) ----------

  onTouchStart(event: TouchEvent, index: number): void {
    if (this.isDisabled || this.thumbnails.length < 2) {
      return;
    }
    const touch = event.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchTimer = setTimeout(() => {
      this.ngZone.run(() => {
        this.touchDragIndex = index;
        this.isTouchDragging = true;
        this.touchInsertIndex = index;
        this.touchDragSize = this.measureThumbSize(index);
        this.setTouchPosition(touch);
      });
    }, 400);
  }

  onTouchMove(event: TouchEvent): void {
    if (!this.isTouchDragging) {
      return;
    }
    const touch = event.touches[0];
    event.preventDefault();
    this.setTouchPosition(touch);
    this.computeInsertIndex(touch.clientX, touch.clientY);
  }

  onTouchEnd(): void {
    this.clearTouchTimer();
    if (this.touchDragIndex === null) {
      return;
    }
    const from = this.touchDragIndex;
    const to = this.touchInsertIndex;
    this.touchDragIndex = null;
    this.isTouchDragging = false;
    this.touchInsertIndex = -1;
    this.touchDragSize = 0;
    this.applyMove(from, to);
  }

  onTouchCancel(): void {
    this.clearTouchTimer();
    this.touchDragIndex = null;
    this.isTouchDragging = false;
    this.touchInsertIndex = -1;
    this.touchDragSize = 0;
  }

  private clearTouchTimer(): void {
    if (this.touchTimer) {
      clearTimeout(this.touchTimer);
      this.touchTimer = undefined;
    }
  }

  private measureThumbSize(index: number): number {
    const thumb = this.thumbnailsEl?.nativeElement.children[index] as HTMLElement | undefined;
    const width = thumb?.getBoundingClientRect().width ?? 0;
    return width > 0 ? width : this.thumbnailSize;
  }

  private setTouchPosition(touch: Touch): void {
    this.touchDragX = touch.clientX;
    this.touchDragY = touch.clientY;
  }

  private computeInsertIndex(clientX: number, clientY: number): void {
    if (!this.thumbnailsEl) {
      return;
    }
    const thumbs = Array.from(this.thumbnailsEl.nativeElement.children) as HTMLElement[];
    if (thumbs.length === 0) {
      return;
    }
    let nearest = 0;
    let nearestDist = Infinity;
    thumbs.forEach((thumb, i) => {
      const r = thumb.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot(clientX - cx, clientY - cy);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    });
    const rect = thumbs[nearest].getBoundingClientRect();
    this.touchInsertIndex = clientX >= rect.left + rect.width / 2 ? nearest + 1 : nearest;
  }

  clearPhotos(): void {
    if (this.isDisabled) {
      return;
    }
    this.clearThumbnails();
    this.selectedPhotos = [];
    this.notifyForm();
    this.announce('Todas las fotos eliminadas');
    setTimeout(() => {
      if (!this.destroyed) {
        this.uploadContainer?.nativeElement.focus();
      }
    });
  }

  private async processFiles(files: File[]): Promise<void> {
    const accepted: File[] = [];
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) {
        return;
      }
      if (this.maxFiles !== undefined && this.selectedPhotos.length + accepted.length >= this.maxFiles) {
        return;
      }
      accepted.push(file);
    });

    if (accepted.length === 0) {
      return;
    }

    if (!this.isCompressionEnabled()) {
      this.addPhotos(accepted);
      return;
    }

    const processed = await this.compressImages(accepted);
    this.ngZone.run(() => this.addPhotos(processed));
  }

  private addPhotos(files: File[]): void {
    const startIndex = this.thumbnails.length;
    files.forEach((file) => {
      this.thumbnails.push(URL.createObjectURL(file));
      this.thumbMeta.push(null);
      this.selectedPhotos.push(file);
    });
    this.notifyForm();
    const total = this.selectedPhotos.length;
    this.announce(
      files.length === 1
        ? `Foto añadida. Total: ${total} fotos`
        : `Se añadieron ${files.length} fotos. Total: ${total} fotos`
    );
    files.forEach((_, i) => this.queueDimsLoad(startIndex + i));
  }

  private isCompressionEnabled(): boolean {
    return this.maxWidth != null || this.maxHeight != null;
  }

  private async compressImages(files: File[]): Promise<File[]> {
    const result: File[] = [];
    for (const file of files) {
      result.push(await this.compressImage(file));
    }
    return result;
  }

  private compressImage(file: File): Promise<File> {
    const mime = file.type;
    if (!/^image\/(jpeg|png|webp)$/.test(mime)) {
      return Promise.resolve(file);
    }

    const orientationPromise =
      mime === 'image/jpeg' ? this.readExifOrientation(file) : Promise.resolve(1);

    return orientationPromise.then((orientation) =>
      new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
          URL.revokeObjectURL(url);
          const width = image.naturalWidth;
          const height = image.naturalHeight;
          const maxWidth = this.maxWidth ?? width;
          const maxHeight = this.maxHeight ?? height;
          const scale = Math.min(1, maxWidth / width, maxHeight / height);
          if (scale >= 1 && orientation <= 1) {
            resolve(file);
            return;
          }
          const outW = Math.max(1, Math.round(width * scale));
          const outH = Math.max(1, Math.round(height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = outW;
          canvas.height = outH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(file);
            return;
          }
          ctx.drawImage(image, 0, 0, outW, outH);
          canvas.toBlob((blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            resolve(new File([blob], file.name, { type: mime }));
          }, mime, this.quality);
        };
        image.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(file);
        };
        image.src = url;
      })
    );
  }

  private async readExifOrientation(file: File): Promise<number> {
    try {
      const buffer = await file.slice(0, 128 * 1024).arrayBuffer();
      return this.parseExifOrientation(new Uint8Array(buffer));
    } catch {
      return 1;
    }
  }

  private parseExifOrientation(bytes: Uint8Array): number {
    if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      return 1;
    }
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) {
        break;
      }
      while (bytes[offset] === 0xff) {
        offset++;
      }
      const marker = bytes[offset];
      offset++;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        continue;
      }
      if (offset + 2 > bytes.length) {
        break;
      }
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      offset += 2;
      if (length < 2) {
        break;
      }
      if (marker === 0xe1) {
        const orientation = this.parseExif(bytes, offset, length - 2);
        if (orientation >= 2 && orientation <= 8) {
          return orientation;
        }
      }
      if (marker === 0xda) {
        break;
      }
      offset += length - 2;
    }
    return 1;
  }

  private parseExif(bytes: Uint8Array, start: number, segmentLength: number): number {
    const end = start + segmentLength;
    const signature = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
    if (start + signature.length > end) {
      return 1;
    }
    for (let i = 0; i < signature.length; i++) {
      if (bytes[start + i] !== signature[i]) {
        return 1;
      }
    }

    const tiffStart = start + signature.length;
    const littleEndian = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49;
    const bigEndian = bytes[tiffStart] === 0x4d && bytes[tiffStart + 1] === 0x4d;
    if (!littleEndian && !bigEndian) {
      return 1;
    }

    const getU16 = (o: number): number =>
      littleEndian ? bytes[o] | (bytes[o + 1] << 8) : (bytes[o] << 8) | bytes[o + 1];
    const getU32 = (o: number): number =>
      littleEndian
        ? bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)
        : (bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3];

    if (tiffStart + 8 > end || getU16(tiffStart + 2) !== 0x2a) {
      return 1;
    }
    const ifd0 = getU32(tiffStart + 4);
    let p = tiffStart + ifd0;
    if (p + 2 > end) {
      return 1;
    }
    const entries = getU16(p);
    p += 2;
    for (let i = 0; i < entries; i++) {
      const entry = p + i * 12;
      if (entry + 12 > end) {
        return 1;
      }
      if (getU16(entry) === 0x0112) {
        return getU16(entry + 8);
      }
    }
    return 1;
  }

  private clearThumbnails(): void {
    this.thumbnails.forEach((url) => URL.revokeObjectURL(url));
    this.thumbnails = [];
    this.thumbMeta = [];
  }

  private notifyForm(): void {
    this.onChange(this.selectedPhotos);
    this.onTouched();
  }

  // ---------- Cámara ----------

  cameraFacing: 'environment' | 'user' = 'environment';
  cameraZoom = 1;
  cameraZoomMax = 3;
  zoomSupported = false;
  cameraFlash = false;
  flashSupported = false;
  private pinchStartDistance = 0;
  private pinchStartZoom = 1;

  async openCamera(facing: 'environment' | 'user' = this.cameraFacing): Promise<void> {
    if (this.isDisabled) {
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      console.error('No se pudo acceder a la cámara: getUserMedia no está disponible');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing }
      });
      this.stopStream();
      this.videoStream = stream;
      this.cameraFacing = facing;
      this.isCameraOpen = true;
      this.cameraZoom = 1;
      this.setupCameraCapabilities();
      this.announce('Cámara abierta');
      setTimeout(() => {
        if (this.destroyed) {
          return;
        }
        if (this.videoElement) {
          this.videoElement.nativeElement.srcObject = this.videoStream!;
        }
        this.captureButton?.nativeElement.focus();
      });
    } catch (err) {
      console.error('No se pudo acceder a la cámara', err);
    }
  }

  async switchCamera(): Promise<void> {
    const next = this.cameraFacing === 'environment' ? 'user' : 'environment';
    await this.openCamera(next);
  }

  setZoomFromEvent(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.setCameraZoom(Number.isFinite(value) ? value : 1);
  }

  async setCameraZoom(zoom: number): Promise<void> {
    const next = Math.min(Math.max(zoom, 1), this.cameraZoomMax);
    this.cameraZoom = next;
    const track = this.videoStream?.getVideoTracks()[0];
    if (track && this.zoomSupported && typeof track.applyConstraints === 'function') {
      try {
        await track.applyConstraints(({ advanced: [{ zoom: next }] }) as unknown as MediaTrackConstraints);
      } catch {
        this.zoomSupported = false;
      }
    }
  }

  async toggleFlash(): Promise<void> {
    const track = this.videoStream?.getVideoTracks()[0];
    if (!track || typeof track.applyConstraints !== 'function') {
      return;
    }
    const next = !this.cameraFlash;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet]
      } as MediaTrackConstraints);
      this.cameraFlash = next;
    } catch {
      this.flashSupported = false;
      this.cameraFlash = false;
    }
  }

  onCameraTouchStart(event: TouchEvent): void {
    if (event.touches.length === 2) {
      this.pinchStartDistance = this.pinchDistance(event);
      this.pinchStartZoom = this.cameraZoom;
    }
  }

  onCameraTouchMove(event: TouchEvent): void {
    if (event.touches.length === 2 && this.pinchStartDistance > 0) {
      event.preventDefault();
      const zoom = this.pinchStartZoom * (this.pinchDistance(event) / this.pinchStartDistance);
      this.setCameraZoom(zoom);
    }
  }

  onCameraTouchEnd(): void {
    this.pinchStartDistance = 0;
  }

  private pinchDistance(event: TouchEvent): number {
    const t = event.touches;
    return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  }

  private setupCameraCapabilities(): void {
    const track = this.videoStream?.getVideoTracks()[0];
    if (!track || typeof track.getCapabilities !== 'function') {
      this.zoomSupported = false;
      this.flashSupported = false;
      return;
    }
    const caps = track.getCapabilities() as {
      zoom?: { min?: number; max?: number };
      torch?: boolean;
    };
    if (caps.zoom && (caps.zoom.max ?? 1) > 1) {
      this.zoomSupported = true;
      this.cameraZoomMax = caps.zoom.max!;
    } else {
      this.zoomSupported = false;
      this.cameraZoomMax = 3;
    }
    this.flashSupported = Boolean(caps.torch);
    if (!this.flashSupported && typeof track.applyConstraints === 'function') {
      track
        .applyConstraints({
          advanced: [{ torch: false } as MediaTrackConstraintSet]
        } as MediaTrackConstraints)
        .then(() => (this.flashSupported = true))
        .catch(() => (this.flashSupported = false));
    }
  }

  takePhoto(): void {
    const video = this.videoElement?.nativeElement;
    if (!video || !this.videoStream) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    if (this.cameraZoom > 1 && !this.zoomSupported) {
      const zoom = this.cameraZoom;
      const srcW = video.videoWidth / zoom;
      const srcH = video.videoHeight / zoom;
      ctx.drawImage(
        video,
        (video.videoWidth - srcW) / 2,
        (video.videoHeight - srcH) / 2,
        srcW,
        srcH,
        0,
        0,
        canvas.width,
        canvas.height
      );
    } else {
      ctx.drawImage(video, 0, 0);
    }

    canvas.toBlob((blob) => {
      // toBlob es asíncrono y su callback corre fuera de la zona de Angular;
      // si mutáramos el estado fuera de ella la vista no se actualizaría
      // (cámara quedaba en negro y la miniatura solo aparecía al hacer clic).
      this.ngZone.run(() => {
        if (!blob) {
          return;
        }
        const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
        this.processFiles([file]);
        this.closeCamera();
      });
    }, 'image/jpeg', 0.9);
  }

  closeCamera(): void {
    const wasOpen = this.isCameraOpen;
    this.stopStream();
    this.isCameraOpen = false;
    if (wasOpen) {
      this.announce('Cámara cerrada');
      setTimeout(() => {
        if (!this.destroyed) {
          this.cameraToggle?.nativeElement.focus();
        }
      });
    }
  }

  private stopStream(): void {
    this.videoStream?.getTracks().forEach((track) => track.stop());
    this.videoStream = undefined;
  }
}
