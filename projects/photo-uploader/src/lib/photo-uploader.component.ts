import {
  Component,
  ElementRef,
  HostListener,
  Input,
  NgZone,
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
export class PhotoUploaderComponent implements ControlValueAccessor {
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

  @ViewChild('video') videoElement?: ElementRef<HTMLVideoElement>;

  thumbnails: string[] = [];
  selectedPhotos: File[] = [];

  isDragging = false;
  isDisabled = false;
  isCameraOpen = false;
  videoStream?: MediaStream;
  dragIndex: number | null = null;

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

    this.selectedPhotos.forEach((file) => {
      this.thumbnails.push(URL.createObjectURL(file));
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
    if (this.isDisabled) {
      return;
    }
    const url = this.thumbnails[index];
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.thumbnails.splice(index, 1);
    this.selectedPhotos.splice(index, 1);
    this.notifyForm();
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
    if (from === index) {
      return;
    }
    const [thumbnail] = this.thumbnails.splice(from, 1);
    this.thumbnails.splice(index, 0, thumbnail);
    const [photo] = this.selectedPhotos.splice(from, 1);
    this.selectedPhotos.splice(index, 0, photo);
    this.notifyForm();
  }

  onDragEnd(): void {
    this.dragIndex = null;
  }

  clearPhotos(): void {
    if (this.isDisabled) {
      return;
    }
    this.clearThumbnails();
    this.selectedPhotos = [];
    this.notifyForm();
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
    files.forEach((file) => {
      this.thumbnails.push(URL.createObjectURL(file));
      this.selectedPhotos.push(file);
    });
    this.notifyForm();
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
  }

  private notifyForm(): void {
    this.onChange(this.selectedPhotos);
    this.onTouched();
  }

  // ---------- Cámara ----------

  async openCamera(): Promise<void> {
    if (this.isDisabled) {
      return;
    }
    try {
      this.videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      this.isCameraOpen = true;
      setTimeout(() => {
        if (this.videoElement) {
          this.videoElement.nativeElement.srcObject = this.videoStream!;
        }
      });
    } catch (err) {
      console.error('No se pudo acceder a la cámara', err);
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

    ctx.drawImage(video, 0, 0);
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
    this.videoStream?.getTracks().forEach((track) => track.stop());
    this.videoStream = undefined;
    this.isCameraOpen = false;
  }
}
