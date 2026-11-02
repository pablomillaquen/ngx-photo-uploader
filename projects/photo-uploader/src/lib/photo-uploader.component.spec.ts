import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, ElementRef, ViewChild } from '@angular/core';

import { PhotoUploaderComponent } from './photo-uploader.component';

@Component({
  selector: 'pu-projection-host',
  standalone: true,
  imports: [PhotoUploaderComponent],
  template: `
    <photo-uploader [enableCropping]="enableCropping">
      <ng-template #placeholder let-ph="placeholder">
        <p class="custom-placeholder">{{ ph }}</p>
      </ng-template>
      <ng-template
        #thumbActions
        let-file
        let-i="index"
        let-total="total"
        let-disabled="disabled"
        let-remove="remove"
        let-crop="crop"
      >
        <span class="custom-ctx">{{ i }}/{{ total }} {{ file.name }} {{ disabled }}</span>
        <button type="button" class="custom-remove" (click)="remove()">Quitar</button>
        <button type="button" class="custom-crop" (click)="crop()">Recortar</button>
      </ng-template>
    </photo-uploader>
  `
})
class PuProjectionHostComponent {
  @ViewChild(PhotoUploaderComponent) uploader!: PhotoUploaderComponent;
  enableCropping = false;
}

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

  describe('camera controls', () => {
    const makeTrack = () => ({
      getCapabilities: jasmine
        .createSpy('getCapabilities')
        .and.returnValue({ zoom: { min: 1, max: 4 } }),
      applyConstraints: jasmine.createSpy('applyConstraints').and.returnValue(Promise.resolve()),
      stop: jasmine.createSpy('stop')
    });

    const makeStream = (track: ReturnType<typeof makeTrack>) => ({
      getVideoTracks: () => [track],
      getTracks: () => [track]
    });

    const mocks = () => {
      const track = makeTrack();
      const stream = makeStream(track);
      const getUserMedia = jasmine
        .createSpy('getUserMedia')
        .and.returnValue(Promise.resolve(stream));
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia },
        configurable: true,
        writable: true
      });
      return { getUserMedia, stream, track };
    };

    afterEach(() => {
      delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
    });

    it('opens the camera with the environment facing mode and detects capabilities', async () => {
      const { getUserMedia } = mocks();
      await component.openCamera();

      expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'environment' } });
      expect(component.isCameraOpen).toBe(true);
      expect(component.zoomSupported).toBe(true);
      expect(component.cameraZoomMax).toBe(4);
      expect(component.flashSupported).toBe(true);
    });

    it('switchCamera stops the previous stream and reopens with the user facing mode', async () => {
      const { getUserMedia, track } = mocks();
      await component.openCamera();
      expect(component.cameraFacing).toBe('environment');

      await component.switchCamera();

      expect(component.cameraFacing).toBe('user');
      expect(track.stop).toHaveBeenCalled();
      expect(getUserMedia.calls.allArgs()[1]).toEqual([{ video: { facingMode: 'user' } }]);
      expect(component.cameraZoom).toBe(1);
    });

    it('setCameraZoom clamps to the supported range and applies the native zoom constraint', async () => {
      const { track } = mocks();
      await component.openCamera();

      await component.setCameraZoom(10);

      expect(component.cameraZoom).toBe(4);
      const calls = track.applyConstraints.calls.allArgs();
      expect(
        calls.some(
          ([c]) => c.advanced?.some((s: MediaTrackConstraintSet) => (s as { zoom?: number }).zoom === 4)
        )
      ).toBe(true);
    });

    it('setCameraZoom does not go below 1', async () => {
      mocks();
      await component.openCamera();

      await component.setCameraZoom(0.2);

      expect(component.cameraZoom).toBe(1);
    });

    it('toggleFlash applies the torch constraint and updates state', async () => {
      const { track } = mocks();
      await component.openCamera();

      await component.toggleFlash();

      expect(component.cameraFlash).toBe(true);
      const calls = track.applyConstraints.calls.allArgs();
      expect(
        calls.some(
          ([c]) => c.advanced?.some((s: MediaTrackConstraintSet) => (s as { torch?: boolean }).torch === true)
        )
      ).toBe(true);
    });

    it('takePhoto crops the central area when zoomed without native zoom support', (done) => {
      const drawImageSpy = jasmine.createSpy('drawImage');
      spyOn(HTMLCanvasElement.prototype, 'getContext').and.returnValue({
        drawImage: drawImageSpy
      } as unknown as CanvasRenderingContext2D);

      component.videoStream = { getTracks: () => [] } as unknown as MediaStream;
      component.videoElement = {
        nativeElement: { videoWidth: 50, videoHeight: 40 }
      } as unknown as ElementRef<HTMLVideoElement>;
      component.cameraZoom = 2;
      component.zoomSupported = false;

      component.takePhoto();
      expect(drawImageSpy.calls.first().args.length).toBe(9);
      const args = drawImageSpy.calls.first().args;
      expect(args[0]).toBe(component.videoElement!.nativeElement);
      expect(args[1]).toBeCloseTo(12.5);
      expect(args[2]).toBeCloseTo(10);
      expect(args[3]).toBeCloseTo(25);
      expect(args[4]).toBeCloseTo(20);

      setTimeout(() => {
        expect(component.selectedPhotos.length).toBe(1);
        done();
      }, 300);
    });
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

  describe('touch reordering', () => {
    const mkThumb = (left: number, width = 100) => ({
      getBoundingClientRect: () => ({ left, width, right: left + width })
    });

    const mkElementFromPoint = (thumbs: unknown[]) =>
      spyOn(document, 'elementFromPoint').and.returnValue({
        closest: (sel: string) => (sel === '.thumbnail' ? thumbs[1] : null)
      } as unknown as Element);

    const setupTouch = (thumbs: unknown[]) => {
      component.thumbnailsEl = new ElementRef({ children: thumbs } as unknown as HTMLDivElement);
      mkElementFromPoint(thumbs);
    };

    const touchEvent = (x: number, y = 0) =>
      ({ touches: [{ clientX: x, clientY: y }], preventDefault: () => undefined }) as unknown as TouchEvent;

    beforeEach(() => {
      jasmine.clock().install();
    });

    afterEach(() => {
      jasmine.clock().uninstall();
      component.onTouchCancel();
    });

    it('starts dragging after a long press (>400ms)', () => {
      const a = imageFile('a.png');
      const b = imageFile('b.png');
      component.onFilesSelected(selectionEvent([a, b]));

      component.onTouchStart({ touches: [{ clientX: 50, clientY: 50 }] } as unknown as TouchEvent, 0);

      expect(component.touchDragIndex).toBeNull();
      jasmine.clock().tick(400);
      expect(component.touchDragIndex).toBe(0);
      expect(component.isTouchDragging).toBe(true);
      expect(component.touchDragSize).toBe(component.thumbnailSize);
    });

    it('reorders the list when the touch ends on a drop target', () => {
      const a = imageFile('a.png');
      const b = imageFile('b.png');
      const c = imageFile('c.png');
      component.onFilesSelected(selectionEvent([a, b, c]));
      const thumbs = [mkThumb(0), mkThumb(120), mkThumb(240)];
      setupTouch(thumbs);

      component.onTouchStart(touchEvent(50), 0);
      jasmine.clock().tick(400);
      component.onTouchMove(touchEvent(159)); // center of thumb 1 = 170 -> insert before it (1)
      component.onTouchEnd();

      expect(component.selectedPhotos).toEqual([b, a, c]);
      expect(onChangeSpy).toHaveBeenCalledWith([b, a, c]);
      expect(component.isTouchDragging).toBe(false);
    });

    it('moves the thumbnail to the end when dropped past the last one', () => {
      const a = imageFile('a.png');
      const b = imageFile('b.png');
      const c = imageFile('c.png');
      component.onFilesSelected(selectionEvent([a, b, c]));
      const thumbs = [mkThumb(0), mkThumb(120), mkThumb(240)];
      setupTouch(thumbs);

      component.onTouchStart(touchEvent(50), 0);
      jasmine.clock().tick(400);
      component.onTouchMove(touchEvent(500)); // past last centera -> to=3 (end)
      component.onTouchEnd();

      expect(component.selectedPhotos).toEqual([b, c, a]);
    });

    it('cancelling the gesture does not reorder', () => {
      const a = imageFile('a.png');
      const b = imageFile('b.png');
      component.onFilesSelected(selectionEvent([a, b]));

      component.onTouchStart(touchEvent(50), 0);
      jasmine.clock().tick(400);
      component.onTouchCancel();

      expect(component.selectedPhotos).toEqual([a, b]);
      expect(component.isTouchDragging).toBe(false);
      expect(component.touchDragIndex).toBeNull();
    });

    it('does not start dragging when there is a single photo', () => {
      const a = imageFile('a.png');
      component.onFilesSelected(selectionEvent([a]));

      component.onTouchStart(touchEvent(50), 0);
      jasmine.clock().tick(400);

      expect(component.touchDragIndex).toBeNull();
      expect(component.isTouchDragging).toBe(false);
    });
  });

  describe('accessibility (WCAG 2.2)', () => {
    const dispatchKey = (el: Element, key: string) => {
      const evt = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      el.dispatchEvent(evt);
      return evt;
    };

    const zone = () => fixture.nativeElement.querySelector('.upload-container') as HTMLElement;
    const thumbs = () =>
      Array.from(fixture.nativeElement.querySelectorAll('.thumbnail')) as HTMLElement[];

    it('exposes the drop zone as a button with a described hint', () => {
      const el = zone();
      expect(el.getAttribute('role')).toBe('button');
      expect(el.getAttribute('tabindex')).toBe('0');

      const hintId = el.getAttribute('aria-describedby');
      expect(hintId).toBeTruthy();
      const hint = fixture.nativeElement.querySelector('#' + hintId) as HTMLElement;
      expect(hint).toBeTruthy();
      expect(hint.textContent).toContain('Enter');
    });

    it('marks the drop zone disabled when the control is disabled', () => {
      component.setDisabledState(true);
      fixture.detectChanges();

      const el = zone();
      expect(el.getAttribute('tabindex')).toBe('-1');
      expect(el.getAttribute('aria-disabled')).toBe('true');
    });

    it('opens the file picker with Enter and Space', () => {
      const spy = spyOn(component, 'openFilePicker');

      dispatchKey(zone(), 'Enter');
      expect(spy).toHaveBeenCalledTimes(1);

      const space = dispatchKey(zone(), ' ');
      expect(spy).toHaveBeenCalledTimes(2);
      expect(space.defaultPrevented).toBe(true);
    });

    it('ignores keyboard activation when disabled', () => {
      const spy = spyOn(component, 'openFilePicker');
      component.setDisabledState(true);
      fixture.detectChanges();

      dispatchKey(zone(), 'Enter');

      expect(spy).not.toHaveBeenCalled();
    });

    it('renders thumbnails as a labelled list of focusable items', () => {
      component.onFilesSelected(selectionEvent([imageFile('a.png'), imageFile('b.png')]));
      fixture.detectChanges();

      const list = fixture.nativeElement.querySelector('.thumbnails');
      expect(list.getAttribute('role')).toBe('list');
      expect(list.getAttribute('aria-label')).toContain('2');

      const items = thumbs();
      expect(items.length).toBe(2);
      items.forEach((item, i) => {
        expect(item.getAttribute('role')).toBe('listitem');
        expect(item.getAttribute('tabindex')).toBe('0');
        expect(item.getAttribute('aria-label')).toContain(`Foto ${i + 1} de 2`);
      });
    });

    it('reorders with arrow keys, announces the move and keeps focus', async () => {
      const a = imageFile('a.png');
      const b = imageFile('b.png');
      const c = imageFile('c.png');
      component.onFilesSelected(selectionEvent([a, b, c]));
      fixture.detectChanges();

      dispatchKey(thumbs()[0], 'ArrowRight');
      fixture.detectChanges();

      expect(component.selectedPhotos).toEqual([b, a, c]);
      await wait(20);
      expect(component.announcement).toContain('posición 2 de 3');
      expect(document.activeElement).toBe(thumbs()[1]);
    });

    it('jumps to first and last with Home and End', () => {
      component.onFilesSelected(
        selectionEvent([imageFile('a.png'), imageFile('b.png'), imageFile('c.png')])
      );
      fixture.detectChanges();

      dispatchKey(thumbs()[2], 'Home');
      expect(component.selectedPhotos.map((f) => f.name)).toEqual(['c.png', 'a.png', 'b.png']);

      dispatchKey(thumbs()[0], 'End');
      expect(component.selectedPhotos.map((f) => f.name)).toEqual(['a.png', 'b.png', 'c.png']);
    });

    it('ignores reordering keys when disabled', () => {
      component.onFilesSelected(selectionEvent([imageFile('a.png'), imageFile('b.png')]));
      component.setDisabledState(true);
      fixture.detectChanges();

      dispatchKey(thumbs()[0], 'ArrowRight');

      expect(component.selectedPhotos.map((f) => f.name)).toEqual(['a.png', 'b.png']);
    });

    it('announces additions through the live region', async () => {
      component.onFilesSelected(selectionEvent([imageFile('a.png')]));
      await wait(20);

      expect(component.announcement).toContain('Foto añadida');
      const live = fixture.nativeElement.querySelector('[role="status"]');
      expect(live.getAttribute('aria-live')).toBe('polite');
      fixture.detectChanges();
      expect(live.textContent).toContain('Foto añadida');
    });

    it('announces removal and moves focus to the next thumbnail', async () => {
      component.onFilesSelected(selectionEvent([imageFile('a.png'), imageFile('b.png')]));
      fixture.detectChanges();

      (fixture.nativeElement.querySelector('.thumbnail .remove') as HTMLElement).click();
      fixture.detectChanges();
      await wait(20);

      expect(component.selectedPhotos.length).toBe(1);
      expect(component.announcement).toContain('Foto eliminada');
      expect(document.activeElement).toBe(thumbs()[0]);
    });

    it('moves focus back to the drop zone when the last photo is removed', async () => {
      component.onFilesSelected(selectionEvent([imageFile('a.png')]));
      fixture.detectChanges();

      (fixture.nativeElement.querySelector('.thumbnail .remove') as HTMLElement).click();
      fixture.detectChanges();
      await wait(20);

      expect(document.activeElement).toBe(zone());
    });

    it('announces clearing all photos', async () => {
      component.onFilesSelected(selectionEvent([imageFile('a.png')]));
      component.clearPhotos();
      await wait(20);

      expect(component.announcement).toContain('Todas las fotos eliminadas');
    });

    it('stops the stream and revokes blob urls on destroy', () => {
      const track = { stop: jasmine.createSpy('stop') };
      component.videoStream = { getTracks: () => [track] } as unknown as MediaStream;
      component.isCameraOpen = true;
      component.onFilesSelected(selectionEvent([imageFile('a.png')]));
      const url = component.thumbnails[0];
      spyOn(URL, 'revokeObjectURL');

      fixture.destroy();

      expect(track.stop).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
    });

    it('assigns a unique hint id per instance', () => {
      const other = TestBed.createComponent(PhotoUploaderComponent);
      expect(component.hintId).not.toBe(other.componentInstance.hintId);
      other.destroy();
    });
  });

  describe('thumbnail badges', () => {
    const dragEvent = {
      dataTransfer: { setData: () => undefined, effectAllowed: 'none', dropEffect: 'none' },
      preventDefault: () => undefined
    } as unknown as DragEvent;

    it('loads dimensions and renders the badge text', async () => {
      const file = await makeImageFile(320, 240);
      component.onFilesSelected(selectionEvent([file]));
      await wait(100);

      expect(component.thumbMeta[0]).toEqual({ width: 320, height: 240 });
      expect(component.badgeText(0)).toBe(`320×240 · ${component.formatSize(file.size)}`);

      fixture.detectChanges();
      const badge = fixture.nativeElement.querySelector('.thumbnail .badge');
      expect(badge).toBeTruthy();
      expect(badge.textContent).toContain('320×240');
      expect(badge.getAttribute('aria-hidden')).toBe('true');
    });

    it('hides badges when showBadges is false', async () => {
      component.showBadges = false;
      const file = await makeImageFile(100, 50);
      component.onFilesSelected(selectionEvent([file]));
      await wait(100);
      fixture.detectChanges();

      expect(component.badgeText(0)).toBeNull();
      expect(fixture.nativeElement.querySelector('.thumbnail .badge')).toBeNull();
    });

    it('formats file sizes', () => {
      expect(component.formatSize(0)).toBe('0 B');
      expect(component.formatSize(512)).toBe('512 B');
      expect(component.formatSize(2048)).toBe('2.0 KB');
      expect(component.formatSize(3 * 1024 * 1024)).toBe('3.0 MB');
    });

    it('includes dimensions and size in the thumbnail aria-label', async () => {
      const file = await makeImageFile(320, 240);
      component.onFilesSelected(selectionEvent([file]));
      await wait(100);
      fixture.detectChanges();

      const label = fixture.nativeElement.querySelector('.thumbnail').getAttribute('aria-label');
      expect(label).toContain('Foto 1 de 1');
      expect(label).toContain('320×240');
      expect(label).toContain(component.formatSize(file.size));
    });

    it('keeps badge metadata aligned on reorder and removal', async () => {
      const a = await makeImageFile(100, 80);
      const b = await makeImageFile(200, 60);
      component.onFilesSelected(selectionEvent([a, b]));
      await wait(100);

      component.onDragStart(dragEvent, 0);
      component.onThumbDrop(dragEvent, 1);
      expect(component.thumbMeta).toEqual([
        { width: 200, height: 60 },
        { width: 100, height: 80 }
      ]);

      component.removePhoto(0);
      expect(component.thumbnails.length).toBe(1);
      expect(component.selectedPhotos.length).toBe(1);
      expect(component.thumbMeta).toEqual([{ width: 100, height: 80 }]);
      expect(component.badgeText(0)).toBe(`100×80 · ${component.formatSize(a.size)}`);
    });

    it('fills metadata on writeValue and clears it with the photos', async () => {
      const file = await makeImageFile(64, 64);
      component.writeValue([file]);
      await wait(100);
      expect(component.thumbMeta[0]).toEqual({ width: 64, height: 64 });

      component.clearPhotos();
      expect(component.thumbMeta).toEqual([]);
      expect(component.thumbnails).toEqual([]);
    });
  });

  describe('cropping', () => {
    const waitUntil = async (condition: () => boolean, timeout = 3000) => {
      const start = Date.now();
      while (!condition() && Date.now() - start < timeout) {
        await wait(20);
      }
    };

    const mockStage = (width: number, height: number) => {
      const stage = fixture.nativeElement.querySelector('.crop-stage') as HTMLElement;
      spyOn(stage, 'getBoundingClientRect').and.returnValue({
        width,
        height,
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        x: 0,
        y: 0,
        toJSON: () => ({})
      } as unknown as DOMRect);
    };

    const setupCrop = async (
      file: File,
      opts: {
        aspect?: 'free' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16';
        stageW?: number;
        stageH?: number;
      } = {}
    ) => {
      component.enableCropping = true;
      if (opts.aspect) {
        component.cropAspect = opts.aspect;
      }
      component.onFilesSelected(selectionEvent([file]));
      component.openCrop(0);
      fixture.detectChanges();
      mockStage(opts.stageW ?? 400, opts.stageH ?? 300);
      await waitUntil(() => !component.cropLoading);
    };

    const dispatchKey = (el: Element, key: string, shiftKey = false) =>
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
      );

    it('hides the crop button when enableCropping is false', async () => {
      const file = await makeImageFile(40, 30);
      component.onFilesSelected(selectionEvent([file]));
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.thumbnail .crop')).toBeNull();

      component.enableCropping = true;
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.thumbnail .crop')).toBeTruthy();
    });

    it('opens the dialog with ARIA attributes and moves focus to the stage', async () => {
      component.enableCropping = true;
      component.onFilesSelected(selectionEvent([await makeImageFile(60, 40)]));
      fixture.detectChanges();

      const btn = fixture.nativeElement.querySelector('.thumbnail .crop') as HTMLButtonElement;
      expect(btn.getAttribute('aria-label')).toBe('Recortar foto 1');
      btn.click();
      fixture.detectChanges();

      const dialog = fixture.nativeElement.querySelector('.crop-dialog');
      expect(dialog.getAttribute('role')).toBe('dialog');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      const title = fixture.nativeElement.querySelector('#' + dialog.getAttribute('aria-labelledby'));
      expect(title).toBeTruthy();
      expect(title.textContent).toContain('Recortar foto');

      await wait(20);
      expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.crop-stage'));
    });

    it('does not open the crop dialog when disabled', async () => {
      component.enableCropping = true;
      component.onFilesSelected(selectionEvent([await makeImageFile(40, 30)]));
      component.setDisabledState(true);
      fixture.detectChanges();

      const btn = fixture.nativeElement.querySelector('.thumbnail .crop') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);

      component.openCrop(0);
      expect(component.cropOpen).toBe(false);
    });

    it('computes a centered frame for a fixed aspect ratio', async () => {
      await setupCrop(await makeImageFile(400, 300), { aspect: '1:1' });

      expect(component.cropFrameW).toBe(300);
      expect(component.cropFrameH).toBe(300);
      expect(component.cropFrameX).toBe(50);
      expect(component.cropFrameY).toBe(0);
      expect(component.cropBaseScale).toBe(1);
      expect(component.cropOffsetX).toBe(-50);
      expect(component.cropOffsetY).toBe(0);
    });

    it('uses the full stage with the free aspect ratio', async () => {
      await setupCrop(await makeImageFile(800, 600));

      expect(component.cropFrameW).toBe(400);
      expect(component.cropFrameH).toBe(300);
      expect(component.cropOffsetX).toBe(0);
      expect(component.cropOffsetY).toBe(0);
      expect(component.cropBaseScale).toBe(0.5);
    });

    it('pans with arrow keys and clamps zoom offsets', async () => {
      await setupCrop(await makeImageFile(400, 300), { aspect: '1:1' });
      const stage = fixture.nativeElement.querySelector('.crop-stage') as HTMLElement;

      dispatchKey(stage, 'ArrowLeft');
      expect(component.cropOffsetX).toBe(-66);
      dispatchKey(stage, 'ArrowLeft', true);
      expect(component.cropOffsetX).toBe(-67);

      component.setCropZoom(2);
      expect(component.cropOffsetX).toBe(-67);
      dispatchKey(stage, 'ArrowUp');
      expect(component.cropOffsetY).toBe(-16);

      component.cropOffsetX = 500;
      component.cropOffsetY = -5000;
      component.setCropZoom(4);
      expect(component.cropOffsetX).toBe(0);
      expect(component.cropOffsetY).toBe(component.cropFrameH - component.cropDisplayH);
    });

    it('crops to the selected frame and notifies the form', async () => {
      const file = await makeImageFile(400, 300);
      await setupCrop(file, { aspect: '1:1' });
      const oldUrl = component.thumbnails[0];

      component.applyCrop();
      await waitUntil(() => !component.cropOpen);
      await wait(200);

      expect(component.thumbnails[0]).not.toBe(oldUrl);
      expect(component.thumbnails[0]).toMatch(/^blob:/);
      const cropped = component.selectedPhotos[0];
      expect(cropped.type).toBe('image/png');
      expect(cropped.name).toBe(file.name);
      const dims = await imageDims(component.thumbnails[0]);
      expect(dims.width).toBe(300);
      expect(dims.height).toBe(300);
      expect(onChangeSpy).toHaveBeenCalledWith([cropped]);
      expect(component.thumbMeta[0]).toEqual({ width: 300, height: 300 });
      expect(component.announcement).toContain('Foto recortada');
    });

    it('crops the zoomed region with the free aspect ratio', async () => {
      await setupCrop(await makeImageFile(800, 600));
      component.setCropZoom(2);

      component.applyCrop();
      await waitUntil(() => !component.cropOpen);

      const dims = await imageDims(component.thumbnails[0]);
      expect(dims.width).toBe(400);
      expect(dims.height).toBe(300);
    });

    it('closes the dialog on Escape and restores focus to the crop button', async () => {
      await setupCrop(await makeImageFile(60, 40));

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(component.cropOpen).toBe(false);
      await wait(20);
      expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.thumbnail .crop'));
    });

    it('closes and announces an error when the image cannot be loaded', async () => {
      await setupCrop(await makeImageFile(60, 40));

      const img = fixture.nativeElement.querySelector('.crop-stage img') as HTMLImageElement;
      img.dispatchEvent(new Event('error'));

      expect(component.cropOpen).toBe(false);
      await wait(20);
      expect(component.announcement).toContain('No se pudo recortar');
    });
  });
});

describe('PhotoUploaderComponent — content projection (ng-template)', () => {
  let fixture: ComponentFixture<PuProjectionHostComponent>;
  let host: PuProjectionHostComponent;
  let uploader: PhotoUploaderComponent;

  const imageFile = (name: string, size = 10) =>
    new File([new Uint8Array(size)], name, { type: 'image/png' });

  const selectionEvent = (files: File[]) =>
    ({ target: { files } }) as unknown as Event;

  const dispatchKey = (el: Element, key: string) => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PuProjectionHostComponent, PhotoUploaderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PuProjectionHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    uploader = host.uploader;
  });

  it('projects a custom #placeholder template and hides the default one', () => {
    const custom = fixture.nativeElement.querySelector('.custom-placeholder') as HTMLElement;
    expect(custom).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.upload-icon')).toBeNull();
    expect(fixture.nativeElement.querySelector('.upload-placeholder')).toBeNull();
  });

  it('exposes the placeholder input through the template context', () => {
    uploader.placeholder = 'Suelta aquí';
    fixture.detectChanges();

    const custom = fixture.nativeElement.querySelector('.custom-placeholder') as HTMLElement;
    expect(custom.textContent).toContain('Suelta aquí');
  });

  it('renders the default placeholder when no template is projected', () => {
    const plain = TestBed.createComponent(PhotoUploaderComponent);
    plain.detectChanges();

    const el = plain.nativeElement.querySelector('.upload-placeholder') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.textContent).toContain('Click o arrastra');
    expect(plain.nativeElement.querySelector('.custom-placeholder')).toBeNull();
  });

  it('projects #thumbActions on every thumbnail with its context', () => {
    uploader.onFilesSelected(selectionEvent([imageFile('a.png'), imageFile('b.png')]));
    fixture.detectChanges();

    const actions = fixture.nativeElement.querySelectorAll('.thumb-actions');
    expect(actions.length).toBe(2);

    const ctx = fixture.nativeElement.querySelector('.custom-ctx') as HTMLElement;
    expect(ctx.textContent).toContain('0/2 a.png');
    expect(ctx.textContent).toContain('false');

    const second = fixture.nativeElement.querySelectorAll('.custom-ctx')[1] as HTMLElement;
    expect(second.textContent).toContain('1/2 b.png');
  });

  it('removes the photo through the remove() exposed in the context', () => {
    uploader.onFilesSelected(selectionEvent([imageFile('a.png'), imageFile('b.png')]));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.custom-remove') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(uploader.selectedPhotos.map((f) => f.name)).toEqual(['b.png']);
    expect(fixture.nativeElement.querySelectorAll('.thumb-actions').length).toBe(1);
  });

  it('opens the crop dialog through the crop() exposed in the context', () => {
    host.enableCropping = true;
    uploader.onFilesSelected(selectionEvent([imageFile('a.png')]));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.custom-crop') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(uploader.cropOpen).toBe(true);
    uploader.closeCrop();
  });

  it('reflects the disabled state in the context', () => {
    uploader.onFilesSelected(selectionEvent([imageFile('a.png')]));
    uploader.setDisabledState(true);
    fixture.detectChanges();

    const ctx = fixture.nativeElement.querySelector('.custom-ctx') as HTMLElement;
    expect(ctx.textContent).toContain('true');
  });

  it('does not reorder with arrow keys when focus is inside the projected actions', () => {
    uploader.onFilesSelected(selectionEvent([imageFile('a.png'), imageFile('b.png')]));
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('.custom-remove') as HTMLElement;
    dispatchKey(btn, 'ArrowRight');
    fixture.detectChanges();

    expect(uploader.selectedPhotos.map((f) => f.name)).toEqual(['a.png', 'b.png']);
  });
});
