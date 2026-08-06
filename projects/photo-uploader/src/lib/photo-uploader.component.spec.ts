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
});
