import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export type StorageResourceType = 'image' | 'video' | 'raw' | 'auto';

export interface StoredFile {
  /** public_id no Cloudinary (guardado em UserDocument.storageKey). */
  key: string;
  url: string;
  size: number;
  resourceType: string;
}

export interface UploadOptions {
  folder: string;
  resourceType?: StorageResourceType;
  /** Documentos sensíveis (identidade, diplomas) ficam como `authenticated`: o URL só funciona assinado. */
  private?: boolean;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(config: ConfigService) {
    this.cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME') ?? '';
    this.apiKey = config.get<string>('CLOUDINARY_API_KEY') ?? '';
    this.apiSecret = config.get<string>('CLOUDINARY_API_SECRET') ?? '';
    cloudinary.config({
      cloud_name: this.cloudName,
      api_key: this.apiKey,
      api_secret: this.apiSecret,
      secure: true,
    });
  }

  /**
   * Parâmetros assinados para upload directo do browser ao Cloudinary (vídeos grandes não
   * passam pela API). A pasta vai assinada: o cliente não a consegue alterar.
   */
  signUpload(params: { folder: string; resourceType: 'image' | 'video' | 'raw'; allowedFormats?: string[] }) {
    const timestamp = Math.round(Date.now() / 1000);
    const toSign: Record<string, string | number> = { folder: params.folder, timestamp };
    if (params.allowedFormats?.length) toSign.allowed_formats = params.allowedFormats.join(',');
    const signature = cloudinary.utils.api_sign_request(toSign, this.apiSecret);
    return {
      cloudName: this.cloudName,
      apiKey: this.apiKey,
      timestamp,
      signature,
      folder: params.folder,
      resourceType: params.resourceType,
      allowedFormats: params.allowedFormats?.join(',') ?? null,
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/${params.resourceType}/upload`,
    };
  }

  /** `true` se o URL é um asset público do nosso Cloudinary dentro de uma das pastas dadas. */
  isOwnAssetUnder(url: string, folderPrefix: string): boolean {
    try {
      const u = new URL(url);
      return (
        u.protocol === 'https:' &&
        u.hostname === 'res.cloudinary.com' &&
        u.pathname.startsWith(`/${this.cloudName}/`) &&
        decodeURIComponent(u.pathname).includes(`/${folderPrefix.replace(/\/+$/, '')}/`)
      );
    } catch {
      return false;
    }
  }

  /** Extrai public_id e resource_type de um URL do Cloudinary (…/<type>/upload/[v123/]<public_id>.<ext>). */
  parseUrl(url: string): { key: string; resourceType: string } | null {
    try {
      const u = new URL(url);
      if (u.hostname !== 'res.cloudinary.com') return null;
      const m = decodeURIComponent(u.pathname).match(/^\/[^/]+\/(image|video|raw)\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(.+)$/);
      if (!m) return null;
      const [, resourceType, rest] = m;
      // raw mantém a extensão no public_id; image/video não
      const key = resourceType === 'raw' ? rest : rest.replace(/\.[^./]+$/, '');
      return { key, resourceType };
    } catch {
      return null;
    }
  }

  /** Remove um asset a partir do URL guardado na base de dados (best-effort). */
  async removeByUrl(url: string | null | undefined): Promise<void> {
    if (!url) return;
    const parsed = this.parseUrl(url);
    if (!parsed) return;
    await this.remove(parsed.key, { resourceType: parsed.resourceType });
  }

  upload(file: Express.Multer.File, options: UploadOptions): Promise<StoredFile> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder,
          resource_type: options.resourceType ?? 'auto',
          type: options.private ? 'authenticated' : 'upload',
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Upload para o Cloudinary falhou'));
          resolve({
            key: result.public_id,
            url: result.secure_url,
            size: result.bytes,
            resourceType: result.resource_type,
          });
        },
      );
      stream.end(file.buffer);
    });
  }

  /** Remoção best-effort (usada para limpar uploads quando a transacção da base de dados falha). */
  async remove(key: string, options: { resourceType?: string; private?: boolean } = {}): Promise<void> {
    try {
      await cloudinary.uploader.destroy(key, {
        resource_type: options.resourceType ?? 'image',
        type: options.private ? 'authenticated' : 'upload',
      });
    } catch (err) {
      this.logger.warn(`Não foi possível remover ${key}: ${String(err)}`);
    }
  }

  /** URL assinado para um asset privado (para a equipa admin rever documentos). */
  signedUrl(key: string, resourceType = 'image'): string {
    return cloudinary.url(key, {
      resource_type: resourceType,
      type: 'authenticated',
      sign_url: true,
      secure: true,
    });
  }

  /**
   * URL de leitura para um ficheiro guardado: se for `authenticated` devolve uma versão assinada,
   * caso contrário devolve o URL tal como está.
   */
  readableUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
      const u = new URL(url);
      const m = decodeURIComponent(u.pathname).match(/^\/[^/]+\/(image|video|raw)\/authenticated\/(?:s--[^/]+--\/)?(?:v\d+\/)?(.+)$/);
      if (u.hostname !== 'res.cloudinary.com' || !m) return url;
      const [, resourceType, rest] = m;
      return this.signedUrl(resourceType === 'raw' ? rest : rest.replace(/\.[^./]+$/, ''), resourceType);
    } catch {
      return url;
    }
  }
}
