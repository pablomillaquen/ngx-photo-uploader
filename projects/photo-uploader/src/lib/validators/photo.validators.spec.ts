import { FormControl } from '@angular/forms';
import { photoAllowedTypes, photoMaxFiles, photoMaxSize, photoRequired } from './photo.validators';

describe('photo validators', () => {
  const file = (name: string, size: number, type: string) =>
    new File([new Uint8Array(size)], name, { type });

  describe('photoRequired', () => {
    it('passes with files', () => {
      expect(photoRequired(new FormControl([file('a.png', 10, 'image/png')]))).toBeNull();
    });

    it('fails with empty array', () => {
      expect(photoRequired(new FormControl([]))).toEqual({ required: true });
    });

    it('fails with null', () => {
      expect(photoRequired(new FormControl(null))).toEqual({ required: true });
    });
  });

  describe('photoMaxFiles', () => {
    it('passes when under the limit', () => {
      const control = new FormControl([file('a.png', 10, 'image/png')]);
      expect(photoMaxFiles(3)(control)).toBeNull();
    });

    it('fails when over the limit', () => {
      const control = new FormControl([
        file('a.png', 10, 'image/png'),
        file('b.png', 10, 'image/png'),
        file('c.png', 10, 'image/png'),
        file('d.png', 10, 'image/png')
      ]);
      expect(photoMaxFiles(3)(control)).toEqual({ maxFiles: { max: 3, actual: 4 } });
    });
  });

  describe('photoMaxSize', () => {
    it('passes when files are small enough', () => {
      const control = new FormControl([file('a.png', 100, 'image/png')]);
      expect(photoMaxSize(1024)(control)).toBeNull();
    });

    it('fails when a file exceeds the size', () => {
      const control = new FormControl([file('big.png', 2048, 'image/png')]);
      expect(photoMaxSize(1024)(control)).toEqual({
        maxSize: { maxSize: 1024, actualSize: 2048, fileName: 'big.png' }
      });
    });
  });

  describe('photoAllowedTypes', () => {
    it('passes when all files have allowed types', () => {
      const control = new FormControl([file('a.png', 10, 'image/png')]);
      expect(photoAllowedTypes(['image/png', 'image/jpeg'])(control)).toBeNull();
    });

    it('fails when a file type is not allowed', () => {
      const control = new FormControl([file('doc.pdf', 10, 'application/pdf')]);
      expect(photoAllowedTypes(['image/png'])(control)).toEqual({
        fileType: { allowed: ['image/png'], actual: 'application/pdf', fileName: 'doc.pdf' }
      });
    });
  });
});
