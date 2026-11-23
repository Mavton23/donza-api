import { Transform } from 'class-transformer';

/** Remove espaços nas pontas de strings. */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/**
 * Trim + minúsculas. Não usa o normalizeEmail do express-validator, que remove pontos e
 * sub-endereços (+tag) de contas Gmail e podia fundir contas distintas.
 */
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

/** multipart/form-data entrega tudo como string: 'true'/'false' -> boolean. */
export const ToBoolean = () =>
  Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true || value === '1') return true;
    if (value === 'false' || value === false || value === '0') return false;
    return value;
  });

/**
 * Array vindo de multipart: aceita array real, JSON ('["a","b"]') ou lista separada por vírgulas.
 * (Mesma tolerância do parseArrayField do Express, mas com limite e sem entradas vazias.)
 */
export const ToStringArray = () =>
  Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') return undefined;
    let arr: unknown = value;
    if (typeof value === 'string') {
      try {
        const parsed: unknown = JSON.parse(value);
        arr = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        arr = value.split(',');
      }
    }
    return Array.isArray(arr) ? arr.map((v) => (typeof v === 'string' ? v.trim() : v)).filter((v) => v !== '') : arr;
  });
