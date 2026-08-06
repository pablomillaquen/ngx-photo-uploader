import {
  Component,
  ElementRef,
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

  clearPhotos(): void {
    if (this.isDisabled) {
      return;
    }
    this.clearThumbnails();
    this.selectedPhotos = [];
    this.notifyForm();
  }

  private processFiles(files: File[]): void {
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) {
        return;
      }
      if (this.maxFiles !== undefined && this.selectedPhotos.length >= this.maxFiles) {
        return;
      }
      this.thumbnails.push(URL.createObjectURL(file));
      this.selectedPhotos.push(file);
      this.notifyForm();
    });
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
