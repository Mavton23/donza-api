const MB = 1024 * 1024;

/** Mesmos limites do constants.js original. */
export const MAX_FILE_SIZE = {
  IMAGE: 5 * MB,
  AVATAR: 2 * MB,
  COMMUNITY_IMAGE: 10 * MB,
  VIDEO: 500 * MB,
  PDF: 20 * MB,
  AUDIO: 30 * MB,
  BATCH_VIDEO: 500 * MB,
  BATCH_ATTACHMENT: 50 * MB,
  DOCUMENT: 20 * MB,
  ID_PROOF: 2 * MB,
  DIPLOMA: 10 * MB,
} as const;

const IMAGES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const OFFICE_AND_ARCHIVES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-rar-compressed',
] as const;

export const ALLOWED_MIME = {
  images: IMAGES,
  communityImages: [...IMAGES, 'image/gif'],
  avatar: IMAGES,
  video: ['video/mp4', 'video/quicktime', 'video/x-msvideo'],
  pdf: ['application/pdf'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/x-wav'],
  attachments: OFFICE_AND_ARCHIVES,
  batchVideo: ['video/mp4', 'video/webm', 'video/quicktime'],
  batchAttachment: [...OFFICE_AND_ARCHIVES, 'text/plain', 'image/jpeg', 'image/png'],
  /** Documentos de registo (alvará, diplomas, ...). */
  registrationDocuments: ['application/pdf', 'image/jpeg', 'image/png'],
  idProof: ['image/jpeg', 'image/png', 'application/pdf'],
  diploma: ['application/pdf', 'image/jpeg', 'image/png'],
} as const;

/** Tipos de documento aceites por role (valores de DocumentType no schema). */
export const DOCUMENT_TYPES_BY_ROLE = {
  institution: ['alvara', 'credenciamento', 'estatutos', 'endereco'],
  instructor: ['diplomas', 'certificacoes', 'experiencia', 'registroProfissional'],
  // Existem no schema mas nenhuma estratégia de upload do Express os aceitava; ficam para uso futuro.
  student: ['identidade', 'comprovante_matricula'],
} as const;

/** Campos multipart do registo (equivale ao `registrationDocuments.fields([...])`). */
export const REGISTRATION_DOCUMENT_FIELDS = [
  { name: 'alvara', maxCount: 5 },
  { name: 'credenciamento', maxCount: 5 },
  { name: 'estatutos', maxCount: 5 },
  { name: 'endereco', maxCount: 5 },
  { name: 'diplomas', maxCount: 5 },
  { name: 'certificacoes', maxCount: 5 },
  { name: 'experiencia', maxCount: 5 },
  { name: 'registroProfissional', maxCount: 2 },
];

export interface FilePolicy {
  allowed: readonly string[];
  maxSize: number;
  required?: boolean;
}

export const UPLOAD_POLICIES = {
  avatar: { allowed: ALLOWED_MIME.avatar, maxSize: MAX_FILE_SIZE.AVATAR },
  coverImage: { allowed: ALLOWED_MIME.images, maxSize: MAX_FILE_SIZE.IMAGE },
  communityImages: { allowed: ALLOWED_MIME.communityImages, maxSize: MAX_FILE_SIZE.COMMUNITY_IMAGE },
  registrationDocument: { allowed: ALLOWED_MIME.registrationDocuments, maxSize: MAX_FILE_SIZE.DOCUMENT },
} satisfies Record<string, FilePolicy>;
