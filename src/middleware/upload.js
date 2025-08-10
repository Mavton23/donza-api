const multer = require('multer');
const path = require('path');
const { MAX_FILE_SIZE, ALLOWED_FILE_TYPES, DOCUMENT_TYPES } = require('../constants/constants');

// Configuração para armazenamento em memória (ideal para Cloudinary)
const memoryStorage = multer.memoryStorage();

// Filtro de arquivos genérico
const fileFilter = (req, file, cb) => {
  const fileType = file.fieldname;
  
  if (ALLOWED_FILE_TYPES[fileType]?.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 
      `Tipo de arquivo não permitido para ${fileType}. Tipos permitidos: ${ALLOWED_FILE_TYPES[fileType]?.join(', ') || 'n/a'}`), 
      false
    );
  }
};

// Cria instâncias de upload para diferentes cenários
const uploadStrategies = {
  singleImage: multer({
    storage: memoryStorage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE.IMAGE }
  }).single('coverImage'),


  // Configuração para avatares
    avatarUpload: multer({
        storage: memoryStorage,
        fileFilter: (req, file, cb) => {
            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
            if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
            } else {
            cb(new Error('Apenas imagens (JPEG, PNG, WEBP) são permitidas para avatar'), false);
            }
        },
        limits: {
            fileSize: MAX_FILE_SIZE.AVATAR || 2 * 1024 * 1024, // 2MB padrão para avatares
            files: 1
        }
    }).single('avatar'),

  lessonMaterials: multer({
    storage: memoryStorage,
    fileFilter,
    limits: { 
      fileSize: MAX_FILE_SIZE.VIDEO,
      files: 6 // 1 vídeo + 5 anexos
    }
  }).fields([
    { name: 'video', maxCount: 1 },
    { name: 'attachments', maxCount: 5 }
  ]),

  multipleImages: multer({
    storage: memoryStorage,
    fileFilter,
    limits: {
      fileSize: MAX_FILE_SIZE.IMAGE,
      files: 10
    }
  }).array('images', 10)
};

const genericLessonMaterials = multer({
  storage: memoryStorage,
  fileFilter: (req, file, cb) => {
    // Determina o tipo de arquivo esperado baseado no lessonType
    const lessonType = req.body.lessonType;
    let allowedTypes;
    
    switch(lessonType) {
      case 'video':
        allowedTypes = ALLOWED_FILE_TYPES.video || ['video/mp4', 'video/quicktime'];
        break;
      case 'pdf':
        allowedTypes = ALLOWED_FILE_TYPES.pdf || ['application/pdf'];
        break;
      case 'audio':
        allowedTypes = ALLOWED_FILE_TYPES.audio || ['audio/mpeg', 'audio/wav'];
        break;
      default:
        allowedTypes = [];
    }

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 
        `Tipo de arquivo não permitido para lições do tipo ${lessonType}`), 
        false
      );
    }
  },
  limits: { 
    fileSize: MAX_FILE_SIZE.VIDEO
  }
}).single('lessonFile');

// Estratégia para upload em lote
const lessonBatchMaterials = multer({
  storage: memoryStorage,
  fileFilter: (req, file, cb) => {
    const match = file.fieldname.match(/^lesson-(\d+)-(video|attachments)$/);
    
    if (!match) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Formato de campo inválido'), false);
    }

    const [, index, fileType] = match;
    const allowedTypes = fileType === 'video' 
      ? ALLOWED_FILE_TYPES.batchVideo 
      : ALLOWED_FILE_TYPES.batchAttachment;

    if (allowedTypes.includes(file.mimetype)) {
      // Adiciona metadados ao arquivo para processamento posterior
      file.lessonIndex = parseInt(index);
      file.fileType = fileType;
      cb(null, true);
    } else {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 
        `Tipo não permitido para ${fileType}. Tipos: ${allowedTypes.join(', ')}`), 
        false
      );
    }
  },
  limits: {
    fileSize: MAX_FILE_SIZE.BATCH_VIDEO,
    files: 20
  }
}).any();

// Estratégia para documentos de registro
const registrationDocuments = multer({
  storage: memoryStorage,
  fileFilter: (req, file, cb) => {
    const { role } = req.body;
    
    // Tipos de documentos permitidos por role
    const DOCUMENT_TYPES = {
      INSTITUTION: ['alvara', 'credenciamento', 'estatutos', 'endereco'],
      INSTRUCTOR: ['diplomas', 'certificacoes', 'experiencia', 'registroProfissional']
    };

    // Tipos MIME permitidos
    const ALLOWED_MIMES = [
      'application/pdf', 
      'image/jpeg', 
      'image/png'
    ];

    const allowedDocs = DOCUMENT_TYPES[role?.toUpperCase()] || [];
    const docType = file.fieldname;

    // Verifica se o tipo de documento é permitido
    if (!allowedDocs.includes(docType)) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 
        `Tipo de documento não permitido para perfil ${role}`), false);
    }

    // Verifica o tipo MIME
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      file.documentType = docType;
      cb(null, true);
    } else {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 
        `Tipo de arquivo não permitido para ${docType}`), false);
    }
  },
  limits: {
    fileSize: MAX_FILE_SIZE.DOCUMENT,
    files: 10
  }
}).fields([
  // Campos para instituições
  { name: 'alvara', maxCount: 5 },
  { name: 'credenciamento', maxCount: 5 },
  { name: 'estatutos', maxCount: 5 },
  { name: 'endereco', maxCount: 5 },
  // Campos para instrutores
  { name: 'diplomas', maxCount: 5 },
  { name: 'certificacoes', maxCount: 5 },
  { name: 'experiencia', maxCount: 5 },
  { name: 'registroProfissional', maxCount: 2 }
]);

// Middleware de tratamento de erros
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const errors = {
      LIMIT_FILE_SIZE: `Arquivo muito grande. Limite: ${MAX_FILE_SIZE[err.field] ? `${MAX_FILE_SIZE[err.field] / (1024*1024)}MB` : '5MB'}`,
      LIMIT_FILE_COUNT: 'Número máximo de arquivos excedido',
      LIMIT_UNEXPECTED_FILE: err.message || 'Tipo de arquivo não permitido'
    };
    
    return res.status(413).json({
      success: false,
      error: errors[err.code] || 'Erro no upload de arquivo'
    });
  }
  next(err);
};

// Middleware de tratamento de erros para documentos
const handleDocumentErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const errors = {
      LIMIT_FILE_SIZE: `Documento muito grande. Limite: ${MAX_FILE_SIZE.DOCUMENT / (1024*1024)}MB`,
      LIMIT_FILE_COUNT: 'Número máximo de documentos excedido (10)',
      LIMIT_UNEXPECTED_FILE: err.message || 'Tipo de documento não permitido'
    };
    
    return res.status(413).json({
      success: false,
      error: errors[err.code] || 'Erro no upload de documentos'
    });
  }
  next(err);
};

const handleBatchUploads = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const errors = {
      LIMIT_FILE_SIZE: `Arquivo muito grande. Limites: Vídeos ${MAX_FILE_SIZE.BATCH_VIDEO / (1024*1024)}MB, Anexos ${MAX_FILE_SIZE.BATCH_ATTACHMENT / (1024*1024)}MB`,
      LIMIT_FILE_COUNT: 'Número máximo de arquivos excedido (20)',
      LIMIT_UNEXPECTED_FILE: err.message || 'Tipo de arquivo ou formato de campo inválido'
    };
    
    return res.status(413).json({
      success: false,
      error: errors[err.code] || 'Erro no upload de arquivos em lote'
    });
  }
  next(err);
};

module.exports = {
  ...uploadStrategies,
  lessonBatchMaterials,
  genericLessonMaterials,
  registrationDocuments,
  handleUploadErrors,
  handleDocumentErrors,
  handleBatchUploads
};