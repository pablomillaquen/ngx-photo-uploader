import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';

import { PhotoUploaderComponent } from './photo-uploader.component';

describe('PhotoUploaderComponent', () => {
  let component: PhotoUploaderComponent;
  let fixture: ComponentFixture<PhotoUploaderComponent>;
  let onChangeSpy: jasmine.Spy;
  let onTouchedSpy: jasmine.Spy;

  const imageFile = (name: string, size = 10) =>
    new File([new Uint8Array(size)], name, { type: 'image/png' });

  const makeImageFile = (w: number, h: number, type = 'image/png', name = 'photo.png') =>
    new Promise<File>((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.toBlob((blob) => resolve(new File([blob!], name, { type })), type, 1);
    });

  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const imageDims = (url: string) =>
    new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 0, height: 0 });
      img.src = url;
    });

  const buildExifApp1 = (orientation: number): Uint8Array => {
    const payload = [
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      0x49, 0x49,
      0x2a, 0x00,
      0x08, 0x00, 0x00, 0x00,
      0x01, 0x00,
      0x12, 0x01,
      0x03, 0x00,
      0x01, 0x00, 0x00, 0x00,
      orientation & 0xff, (orientation >> 8) & 0xff, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00
    ];
    const length = payload.length + 2;
    const app1 = new Uint8Array(2 + length);
    app1[0] = 0xff;
    app1[1] = 0xe1;
    app1[2] = (length >> 8) & 0xff;
    app1[3] = length & 0xff;
    app1.set(payload, 4);
    return app1;
  };

  const jpegWithExifOrientation = (w: number, h: number, orientation: number) =>
    new Promise<File>((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.toBlob((blob) => {
        blob!.arrayBuffer().then((ab) => {
          const jpg = new Uint8Array(ab);
          const app1 = buildExifApp1(orientation);
          const out = new Uint8Array(2 + app1.length + jpg.length - 2);
          out.set(jpg.subarray(0, 2), 0);
          out.set(app1, 2);
          out.set(jpg.subarray(2), 2 + app1.length);
          resolve(new File([out], 'exif.jpg', { type: 'image/jpeg' }));
        });
      }, 'image/jpeg', 1);
    });

  const selectionEvent = (files: File[]) =>
    ({ target: { files } }) as unknown as Event;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PhotoUploaderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PhotoUploaderComponent);
    component = fixture.componentInstance;
    onChangeSpy = jasmine.createSpy('onChange');
    onTouchedSpy = jasmine.createSpy('onTouched');
    component.registerOnChange(onChangeSpy);
    component.registerOnTouched(onTouchedSpy);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('notifies the form when files are selected', () => {
    const file = imageFile('photo.png');
    component.onFilesSelected(selectionEvent([file]));

    expect(component.selectedPhotos).toEqual([file]);
    expect(component.thumbnails.length).toBe(1);
    expect(component.thumbnails[0]).toMatch(/^blob:/);
    expect(onChangeSpy).toHaveBeenCalledWith([file]);
    expect(onTouchedSpy).toHaveBeenCalled();
  });

  it('ignores non-image files', () => {
    const file = new File(['x'], 'doc.txt', { type: 'text/plain' });
    component.onFilesSelected(selectionEvent([file]));

    expect(component.selectedPhotos).toEqual([]);
    expect(component.thumbnails.length).toBe(0);
    expect(onChangeSpy).not.toHaveBeenCalled();
  });

  it('adds dropped image files', () => {
    const file = imageFile('drop.png');
    const event = {
      preventDefault: () => undefined,
      dataTransfer: { files: [file] }
    } as unknown as DragEvent;

    component.onDrop(event);

    expect(component.selectedPhotos).toEqual([file]);
    expect(onChangeSpy).toHaveBeenCalledWith([file]);
  });

  it('respects maxFiles limit within the same batch', () => {
    component.maxFiles = 2;
    const a = imageFile('a.png');
    const b = imageFile('b.png');
    const c = imageFile('c.png');

    component.onFilesSelected(selectionEvent([a, b, c]));

    expect(component.selectedPhotos).toEqual([a, b]);
    expect(component.thumbnails.length).toBe(2);
  });

  it('respects disabled state', () => {
    component.setDisabledState(true);
    const file = imageFile('a.png');

    component.onFilesSelected(selectionEvent([file]));

    expect(component.selectedPhotos).toEqual([]);
    expect(onChangeSpy).not.toHaveBeenCalled();
  });

  it('writeValue restores files without notifying the form', () => {
    const file = imageFile('a.png');
    component.writeValue([file]);

    expect(component.selectedPhotos).toEqual([file]);
    expect(component.thumbnails.length).toBe(1);
    expect(onChangeSpy).not.toHaveBeenCalled();
  });

  it('writeValue clears when given an empty array', () => {
    component.onFilesSelected(selectionEvent([imageFile('a.png')]));
    component.writeValue([]);

    expect(component.selectedPhotos).toEqual([]);
    expect(component.thumbnails).toEqual([]);
  });

  it('removes a photo and notifies the form', () => {
    const fileA = imageFile('a.png');
    const fileB = imageFile('b.png');
    component.onFilesSelected(selectionEvent([fileA, fileB]));

    component.removePhoto(0);

    expect(component.selectedPhotos).toEqual([fileB]);
    expect(onChangeSpy).toHaveBeenCalledWith([fileB]);
  });

  it('clears all photos and notifies with an empty list', () => {
    component.onFilesSelected(selectionEvent([imageFile('a.png')]));

    component.clearPhotos();

    expect(component.selectedPhotos).toEqual([]);
    expect(component.thumbnails).toEqual([]);
    expect(onChangeSpy).toHaveBeenCalledWith([]);
  });

  it('captures a camera photo, adds it and closes the camera', (done) => {
    const drawImageSpy = jasmine.createSpy('drawImage');
    spyOn(HTMLCanvasElement.prototype, 'getContext').and.returnValue({
      drawImage: drawImageSpy
    } as unknown as CanvasRenderingContext2D);

    component.videoStream = { getTracks: () => [] } as unknown as MediaStream;
    component.videoElement = {
      nativeElement: { videoWidth: 50, videoHeight: 40 }
    } as unknown as ElementRef<HTMLVideoElement>;

    component.takePhoto();
    expect(drawImageSpy).toHaveBeenCalled();

    setTimeout(() => {
      expect(component.selectedPhotos.length).toBe(1);
      expect(component.selectedPhotos[0].name).toMatch(/^camera_.+\.jpg$/);
      expect(component.selectedPhotos[0].type).toBe('image/jpeg');
      expect(component.thumbnails.length).toBe(1);
      expect(component.isCameraOpen).toBe(false);
      expect(onChangeSpy).toHaveBeenCalled();
      done();
    }, 300);
  });

  describe('image compression', () => {
    it('compresses images larger than maxWidth', async () => {
      component.maxWidth = 100;
      const big = await makeImageFile(800, 600);
      component.onFilesSelected(selectionEvent([big]));
      await wait(300);

      expect(component.selectedPhotos.length).toBe(1);
      const url = URL.createObjectURL(component.selectedPhotos[0]);
      const dims = await imageDims(url);
      URL.revokeObjectURL(url);
      expect(dims.width).toBeLessThanOrEqual(100);
      expect(dims.height).toBeLessThanOrEqual(75);
      expect(onChangeSpy).toHaveBeenCalled();
    });

    it('scales by maxHeight keeping the aspect ratio', async () => {
      component.maxHeight = 50;
      const wide = await makeImageFile(400, 200);
      component.onFilesSelected(selectionEvent([wide]));
      await wait(300);

      expect(component.selectedPhotos.length).toBe(1);
      const url = URL.createObjectURL(component.selectedPhotos[0]);
      const dims = await imageDims(url);
      URL.revokeObjectURL(url);
      expect(dims.width).toBe(100);
      expect(dims.height).toBe(50);
    });

    it('keeps the original file when already within limits', async () => {
      component.maxWidth = 500;
      const small = await makeImageFile(100, 80);
      component.onFilesSelected(selectionEvent([small]));
      await wait(300);

      expect(component.selectedPhotos.length).toBe(1);
      expect(component.selectedPhotos[0].size).toBe(small.size);
    });

    it('skips non-raster image types', async () => {
      component.maxWidth = 50;
      const gif = new File(['GIF89a'], 'a.gif', { type: 'image/gif' });
      component.onFilesSelected(selectionEvent([gif]));
      await wait(50);

      expect(component.selectedPhotos.length).toBe(1);
      expect(component.selectedPhotos[0]).toBe(gif);
    });
  });

  describe('paste from clipboard', () => {
    it('adds images pasted from the clipboard', () => {
      const file = imageFile('pasted.png');
      const event = {
        clipboardData: {
          items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }]
        },
        preventDefault: jasmine.createSpy()
      } as unknown as ClipboardEvent;

      component.onDocumentPaste(event);

      expect(component.selectedPhotos).toEqual([file]);
      expect(onChangeSpy).toHaveBeenCalledWith([file]);
    });

    it('ignores clipboard content without images', () => {
      const event = {
        clipboardData: {
          items: [
            {
              kind: 'file',
              type: 'text/plain',
              getAsFile: () => new File(['x'], 'a.txt', { type: 'text/plain' })
            }
          ]
        },
        preventDefault: jasmine.createSpy()
      } as unknown as ClipboardEvent;

      component.onDocumentPaste(event);

      expect(component.selectedPhotos).toEqual([]);
      expect(onChangeSpy).not.toHaveBeenCalled();
    });

    it('ignores paste when disabled', () => {
      component.setDisabledState(true);
      const file = imageFile('pasted.png');
      const event = {
        clipboardData: {
          items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }]
        },
        preventDefault: jasmine.createSpy()
      } as unknown as ClipboardEvent;

      component.onDocumentPaste(event);

      expect(component.selectedPhotos).toEqual([]);
      expect(onChangeSpy).not.toHaveBeenCalled();
    });
  });

  describe('EXIF orientation correction', () => {
    it('swaps dimensions for orientation 6 and keeps the aspect ratio', async () => {
      component.maxWidth = 50;
      const file = await jpegWithExifOrientation(200, 100, 6);
      component.onFilesSelected(selectionEvent([file]));
      await wait(300);

      expect(component.selectedPhotos.length).toBe(1);
      const url = URL.createObjectURL(component.selectedPhotos[0]);
      const dims = await imageDims(url);
      URL.revokeObjectURL(url);
      expect(dims.width).toBe(50);
      expect(dims.height).toBe(100);
    });

    it('re-encodes JPEG with rotation even when within the size limits', async () => {
      component.maxWidth = 1000;
      const file = await jpegWithExifOrientation(200, 100, 3);
      component.onFilesSelected(selectionEvent([file]));
      await wait(300);

      expect(component.selectedPhotos.length).toBe(1);
      const url = URL.createObjectURL(component.selectedPhotos[0]);
      const dims = await imageDims(url);
      URL.revokeObjectURL(url);
      expect(dims.width).toBe(200);
      expect(dims.height).toBe(100);
      expect(component.selectedPhotos[0].size).not.toBe(file.size);
    });

    it('keeps the original JPEG when orientation is normal (1)', async () => {
      component.maxWidth = 1000;
      const file = await jpegWithExifOrientation(200, 100, 1);
      component.onFilesSelected(selectionEvent([file]));
      await wait(300);

      expect(component.selectedPhotos.length).toBe(1);
      expect(component.selectedPhotos[0]).toBe(file);
    });
  });

  describe('thumbnail reordering', () => {
    const dragEvent = {
      dataTransfer: { setData: () => undefined, effectAllowed: 'none', dropEffect: 'none' },
      preventDefault: () => undefined
    } as unknown as DragEvent;

    it('reorders photos when a thumbnail is dropped', () => {
      const a = imageFile('a.png');
      const b = imageFile('b.png');
      const c = imageFile('c.png');
      component.onFilesSelected(selectionEvent([a, b, c]));

      component.onDragStart(dragEvent, 0);
      component.onThumbDrop(dragEvent, 2);

      expect(component.selectedPhotos).toEqual([b, c, a]);
      expect(onChangeSpy).toHaveBeenCalledWith([b, c, a]);
      expect(component.dragIndex).toBeNull();
    });

    it('moves a thumbnail backwards in the list', () => {
      const a = imageFile('a.png');
      const b = imageFile('b.png');
      const c = imageFile('c.png');
      component.onFilesSelected(selectionEvent([a, b, c]));

      component.onDragStart(dragEvent, 2);
      component.onThumbDrop(dragEvent, 0);

      expect(component.selectedPhotos).toEqual([c, a, b]);
    });

    it('does nothing when dropping on the same index', () => {
      const a = imageFile('a.png');
      const b = imageFile('b.png');
      component.onFilesSelected(selectionEvent([a, b]));

      component.onDragStart(dragEvent, 0);
      component.onThumbDrop(dragEvent, 0);

      expect(component.selectedPhotos).toEqual([a, b]);
      expect(onChangeSpy).toHaveBeenCalledTimes(1);
    });

    it('ignores drops without a started drag', () => {
      const a = imageFile('a.png');
      const b = imageFile('b.png');
      component.onFilesSelected(selectionEvent([a, b]));

      component.onThumbDrop(dragEvent, 1);

      expect(component.selectedPhotos).toEqual([a, b]);
      expect(onChangeSpy).toHaveBeenCalledTimes(1);
    });

    it('ignores reordering when disabled', () => {
      const a = imageFile('a.png');
      const b = imageFile('b.png');
      component.onFilesSelected(selectionEvent([a, b]));

      component.setDisabledState(true);
      component.onDragStart(dragEvent, 0);
      component.onThumbDrop(dragEvent, 1);

      expect(component.selectedPhotos).toEqual([a, b]);
      expect(component.dragIndex).toBeNull();
    });
  });
});
