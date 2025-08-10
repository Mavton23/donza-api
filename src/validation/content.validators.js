const { body } = require('express-validator');

module.exports = {
  validateContentUpload: [
    body('title')
      .trim()
      .notEmpty().withMessage('Título é obrigatório')
      .isLength({ max: 100 }).withMessage('Título deve ter no máximo 100 caracteres'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Descrição deve ter no máximo 500 caracteres'),
    body('externalUrl')
      .optional()
  ],

  validateLinkUpload: [
    body('title')
      .trim()
      .notEmpty().withMessage('Título é obrigatório')
      .isLength({ max: 100 }).withMessage('Título deve ter no máximo 100 caracteres'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Descrição deve ter no máximo 500 caracteres'),
    body('url')
      .notEmpty().withMessage('URL é obrigatória')
  ],

  validateContentUpdate: [
    body('title')
      .optional()
      .trim()
      .notEmpty().withMessage('Título não pode ser vazio')
      .isLength({ max: 100 }).withMessage('Título deve ter no máximo 100 caracteres'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Descrição deve ter no máximo 500 caracteres')
  ]
};