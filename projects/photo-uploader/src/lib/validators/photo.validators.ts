import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Requiere al menos una foto.
 * Nota: `Validators.required` NO funciona con arrays vacíos en Angular,
 * por eso este validador existe.
 */
export function photoRequired(control: AbstractControl): ValidationErrors | null {
  const files = control.value as File[] | null;
  return !files || files.length === 0 ? { required: true } : null;
}

/**
 * Limita la cantidad máxima de fotos.
 */
export function photoMaxFiles(max: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const files = control.value as File[] | null;
    if (!files) {
      return null;
    }
    return files.length > max ? { maxFiles: { max, actual: files.length } } : null;
  };
}

/**
 * Limita el tamaño máximo (en bytes) de cada archivo.
 */
export function photoMaxSize(maxSize: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const files = control.value as File[] | null;
    if (!files) {
      return null;
    }
    const oversized = files.find((file) => file.size > maxSize);
    return oversized
      ? { maxSize: { maxSize, actualSize: oversized.size, fileName: oversized.name } }
      : null;
  };
}

/**
 * Restringe los MIME types permitidos.
 */
export function photoAllowedTypes(types: string[]): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const files = control.value as File[] | null;
    if (!files) {
      return null;
    }
    const invalid = files.find((file) => !types.includes(file.type));
    return invalid
      ? { fileType: { allowed: types, actual: invalid.type, fileName: invalid.name } }
      : null;
  };
}
