import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  PipeTransform,
} from '@nestjs/common';
import type { FilePolicy } from '@/common/config/upload.config';
import { matchesDeclaredType } from '../utils/file-signature';

type Uploaded =
  | Express.Multer.File
  | Express.Multer.File[]
  | Record<string, Express.Multer.File[]>
  | undefined;

/** Valida tipo declarado, tamanho e assinatura real do ficheiro. Aceita single, array ou fields. */
@Injectable()
export class FileValidationPipe implements PipeTransform<Uploaded, Promise<Uploaded>> {
  constructor(private readonly policy: FilePolicy) {}

  async transform(value: Uploaded): Promise<Uploaded> {
    const files = this.flatten(value);
    if (files.length === 0) {
      if (this.policy.required) throw new BadRequestException('Ficheiro obrigatório');
      return value;
    }
    for (const file of files) await validateFile(file, this.policy);
    return value;
  }

  private flatten(value: Uploaded): Express.Multer.File[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if ('buffer' in value) return [value as Express.Multer.File];
    return Object.values(value).flat();
  }
}

export async function validateFile(file: Express.Multer.File, policy: Pick<FilePolicy, 'allowed' | 'maxSize'>) {
  if (!policy.allowed.includes(file.mimetype)) {
    throw new BadRequestException(
      `Tipo de ficheiro não permitido (${file.mimetype}). Permitidos: ${policy.allowed.join(', ')}`,
    );
  }
  if (file.size > policy.maxSize) {
    throw new PayloadTooLargeException(`Ficheiro demasiado grande. Limite: ${Math.round(policy.maxSize / 1024 / 1024)}MB`);
  }
  if (!(await matchesDeclaredType(file))) {
    throw new BadRequestException(`O conteúdo de "${file.originalname}" não corresponde ao tipo declarado`);
  }
}
