import { TestBed } from '@angular/core/testing';

import { PhotoUploaderService } from './photo-uploader.service';

describe('PhotoUploaderService', () => {
  let service: PhotoUploaderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PhotoUploaderService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
