module.exports = {
    ROLES: {
      ADMIN: 'admin',
      INSTRUCTOR: 'instructor',
      STUDENT: 'student',
      INSTITUTION: 'institution',
    },
    COURSE_STATUS: {
      DRAFT: 'draft',
      PUBLISHED: 'published',
      ARCHIVED: 'archived'
    },
    LESSON_TYPES: {
      VIDEO: 'video',
      TEXT: 'text',
      PDF: 'pdf',
      QUIZ: 'quiz',
      AUDIO: 'audio',
      ASSIGNMENT: 'assignment'
  },
    EVENT_STATUS: {
      SCHEDULED: 'scheduled',
      LIVE: 'live',
      COMPLETED: 'completed',
      CANCELED: 'canceled'
    },
    REVIEW_STATUS: {
      PENDING: 'pending',
      APPROVED: 'approved',
      REJECTED: 'rejected'
    },
    MAX_FILE_SIZE: {
    IMAGE: 5 * 1024 * 1024, // 5MB
    VIDEO: 500 * 1024 * 1024, // 500MB
    PDF: 20 * 1024 * 1024,    // 20MB
    AUDIO: 30 * 1024 * 1024,  // 30MB
    BATCH_VIDEO: 500 * 1024 * 1024, // 500MB por vídeo
    BATCH_ATTACHMENT: 50 * 1024 * 1024, // 50MB por anexo
    DOCUMENT: 20 * 1024 * 1024, // 20MB
    ID_PROOF: 2 * 1024 * 1024, // 2MB para comprovantes de identidade
    DIPLOMA: 10 * 1024 * 1024
  },
  DOCUMENT_TYPES: {
    INSTITUTION: [
      'alvara',
      'credenciamento',
      'estatutos',
      'endereco'
    ],
    INSTRUCTOR: [
      'diplomas',
      'certificacoes',
      'experiencia',
      'registroProfissional'
    ],
    STUDENT: [
      'identidade',
      'comprovante_matricula'
    ]
  },

  ALLOWED_FILE_TYPES: {
    coverImage: ['image/jpeg', 'image/png', 'image/webp'],
    video: ['video/mp4', 'video/quicktime', 'video/x-msvideo'],
    pdf: ['application/pdf'],
    audio: ['audio/mpeg', 'audio/wav', 'audio/x-wav'],
    attachments: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip',
      'application/x-rar-compressed'
    ],
    batchVideo: ['video/mp4', 'video/webm', 'video/quicktime'],
    batchAttachment: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip',
      'application/x-rar-compressed',
      'text/plain',
      'image/jpeg',
      'image/png'
    ],
    documents: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    idProof: ['image/jpeg', 'image/png', 'application/pdf'],
    diploma: ['application/pdf', 'image/jpeg', 'image/png'],
    images: ['image/jpeg', 'image/png', 'image/webp']
  },
  };