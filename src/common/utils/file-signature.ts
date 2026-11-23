import { fileTypeFromBuffer } from 'file-type';

interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
}

/** O file-type devolve alguns MIME diferentes dos que os browsers declaram. */
const COMPATIBLE: Record<string, string[]> = {
  'application/x-cfb': ['application/msword', 'application/vnd.ms-powerpoint'],
  'audio/vnd.wave': ['audio/wav', 'audio/x-wav'],
  'audio/x-wav': ['audio/wav'],
  'video/vnd.avi': ['video/x-msvideo'],
  'application/x-zip-compressed': ['application/zip'],
};

/**
 * Confirma que o conteúdo (magic numbers) corresponde ao MIME declarado.
 * O `mimetype` do multipart vem do cliente e pode ser falsificado.
 * Ficheiros sem assinatura (texto simples) só passam se declarados como text/plain.
 */
export async function matchesDeclaredType(
  file: UploadedFile,
): Promise<boolean> {
  const detected = await fileTypeFromBuffer(file.buffer);

  if (!detected) return file.mimetype === 'text/plain';

  if (detected.mime === file.mimetype) return true;

  return COMPATIBLE[detected.mime]?.includes(file.mimetype) ?? false;
}