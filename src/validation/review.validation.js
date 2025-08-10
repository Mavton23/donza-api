const { body, validationResult } = require('express-validator');
const models = require('../models');

/**
 * Validação para criação de avaliação
 */
const validateReviewCreation = [
  body('rating')
    .notEmpty().withMessage('A avaliação é obrigatória')
    .isInt({ min: 1, max: 5 }).withMessage('A avaliação deve ser entre 1 e 5 estrelas')
    .toInt(),

  // Validação do comentário
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('O comentário não pode exceder 500 caracteres')
    .escape(),

  // Validação customizada para verificar se o usuário está matriculado
  body().custom(async (_, { req }) => {
    const { courseId } = req.params;
    const userId = req.user.userId;

    // Verifica se o curso existe e está publicado
    const course = await models.Course.findOne({
      where: { 
        courseId,
        status: 'published' 
      }
    });
    if (!course) {
      throw new Error('Curso não encontrado ou não publicado');
    }

    // Verifica matrícula do usuário
    const enrollment = await models.Enrollment.findOne({
      where: { 
        userId,
        courseId 
      }
    });
    if (!enrollment) {
      throw new Error('Você precisa estar matriculado para avaliar este curso');
    }

    // Verifica se já existe avaliação do usuário
    const existingReview = await models.Review.findOne({
      where: { 
        userId,
        courseId 
      }
    });
    if (existingReview) {
      throw new Error('Você já avaliou este curso');
    }
  }),

  // Middleware para tratar erros
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array().map(err => ({
          param: err.param,
          message: err.msg,
          location: err.location
        }))
      });
    }
    next();
  }
];

/**
 * Validação para atualização de avaliação
 */
const validateReviewUpdate = [
  // Validação da avaliação (rating)
  body('rating')
    .optional()
    .isInt({ min: 1, max: 5 }).withMessage('A avaliação deve ser entre 1 e 5 estrelas')
    .toInt(),

  // Validação do comentário
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('O comentário não pode exceder 500 caracteres')
    .escape(),

  // Validação do status
  body('isApproved')
    .optional()
    .isBoolean().withMessage('O status de aprovação deve ser verdadeiro ou falso'),

  // Middleware para tratar erros
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array().map(err => ({
          param: err.param,
          message: err.msg,
          location: err.location
        }))
      });
    }
    next();
  }
];

/**
 * Validação para resposta do instrutor
 */
const validateReviewReply = [
  body('reply')
    .trim()
    .notEmpty().withMessage('A resposta não pode estar vazia')
    .isLength({ max: 500 }).withMessage('A resposta não pode exceder 500 caracteres'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }
    next();
  }
];

module.exports = {
  validateReviewCreation,
  validateReviewUpdate,
  validateReviewReply
};