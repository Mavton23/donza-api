const express = require('express');
const router = express.Router();
const contentController = require('../controllers/content.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { singleImage, handleUploadErrors } = require('../middleware/upload');
const contentValidators = require('../validation/content.validators');

router.use(authenticate);

// Upload de arquivo
router.post('/groups/:groupId/contents', 
  authorize(['instructor','leader', 'co-leader', 'student', 'member']),
  singleImage,
  handleUploadErrors,
  contentValidators.validateContentUpload,
  contentController.uploadContent
);

// Adicionar link
router.post('/groups/:groupId/links',
  authorize(['instructor','leader', 'co-leader', 'student', 'member']),
  contentValidators.validateLinkUpload,
  contentController.addLink
);

// Listar conteúdos
router.get('/groups/:groupId/contents', 
  authorize(['instructor','leader', 'co-leader', 'student', 'member']),
  contentController.listContents
);

// Visualizar conteúdo
router.get('/contents/:contentId',
  authorize(['instructor','leader', 'co-leader', 'student', 'member']),
  contentController.getContent
);

// Atualizar conteúdo
router.put('/contents/:contentId',
  authorize(['instructor','leader', 'co-leader', 'student', 'member']),
  contentValidators.validateContentUpdate,
  contentController.updateContent
);

// Deletar conteúdo
router.delete('/contents/:contentId',
  authorize(['instructor', 'student']),
  contentController.deleteContent
);

// Registrar download
router.post('/contents/:contentId/download',
  authorize(['instructor', 'student']),
  contentController.registerDownload
);

module.exports = router;