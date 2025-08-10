const { body, query, validationResult } = require('express-validator');
const { User, TempUser } = require('../models');
const { Op } = require('sequelize');

/**
 * Validação para a primeira etapa do registro (email e senha)
 */
const validateFirstStep = [
  body('email')
    .trim()
    .notEmpty().withMessage('O email é obrigatório')
    .isEmail().withMessage('Por favor, forneça um email válido')
    .normalizeEmail()
    .custom(async (email) => {
      // Verifica se já existe como usuário permanente
      const user = await User.findOne({ where: { email } });
      if (user) {
        throw new Error('Email já está em uso');
      }
      
      // Verifica se já existe um tempUser não expirado
      const tempUser = await TempUser.findOne({ 
        where: { 
          email,
          tokenExpires: { [Op.gt]: new Date() }
        } 
      });
      
      if (tempUser && tempUser.verificationAttempts >= 5) {
        throw new Error('Limite de tentativas excedido. Por favor, aguarde antes de tentar novamente.');
      }
    }),

  body('password')
    .notEmpty().withMessage('A senha é obrigatória'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg,
        }))
      });
    }
    next();
  }
];

/**
 * Validação para a segunda etapa do registro (dados complementares)
 */
const validateSecondStep = [
  body('token')
    .trim()
    .notEmpty().withMessage('Token de verificação é obrigatório')
    .isLength({ min: 20, max: 100 }).withMessage('Token inválido')
    .custom(async (token, { req }) => {
      try {
        const tempUser = await TempUser.findOne({
          where: {
            verificationToken: token,
            isEmailVerified: true,
            tokenExpires: { [Op.gt]: new Date() }
          }
        });
        
        if (!tempUser) {
          throw new Error('Token inválido, expirado ou e-mail não verificado');
        }
        
        // Verifica se o email já está registrado como usuário permanente
        const existingUser = await User.findOne({ 
          where: { email: tempUser.email } 
        });
        
        if (existingUser) {
          throw new Error('Este e-mail já está registrado');
        }

        // Anexa dados importantes ao request
        req.tempUser = tempUser;
        req.email = tempUser.email;
      } catch (error) {
        console.error('Erro na validação do token:', error);
        throw error;
      }
    }),

  body('username')
    .trim()
    .notEmpty().withMessage('O nome de usuário é obrigatório')
    .isLength({ min: 3, max: 30 }).withMessage('O nome de usuário deve ter entre 3 e 30 caracteres')
    .matches(/^[\wÀ-ÿ-]+$/).withMessage('O nome de usuário só pode conter letras, números e underscores')
    .custom(async (username, { req }) => {
      const user = await User.findOne({ where: { username } });
      if (user) {
        throw new Error('Nome de usuário já está em uso');
      }
      
      // Adiciona verificação adicional
      if (username.match(/admin/i)) {
        throw new Error('Nome de usuário não permitido');
      }
    }),

  body('role')
    .notEmpty().withMessage('O tipo de conta é obrigatório')
    .isIn(['student', 'instructor', 'institution']).withMessage('Tipo de usuário inválido')
    .custom(async (role, { req }) => {
      // Verificação adicional para instituições
      if (role === 'institution' && !req.body.institutionName) {
        throw new Error('Nome da instituição é obrigatório');
      }
    }),

  body('institutionName')
    .if((value, { req }) => req.body.role === 'institution')
    .trim()
    .notEmpty().withMessage('O nome da instituição é obrigatório')
    .isLength({ min: 3, max: 100 }).withMessage('O nome da instituição deve ter entre 3 e 100 caracteres')
    .matches(/^[a-zA-Z0-9\u00C0-\u00FF\s\-.,&]+$/).withMessage('Nome da instituição contém caracteres inválidos'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        error: {
          type: 'VALIDATION_ERROR',
          messages: errors.array().map(err => ({
            field: err.param,
            message: err.msg,
            value: err.value
          })),
          timestamp: new Date().toISOString()
        }
      });
    }
    next();
  }
];

const validateCompleteProfile = [
  body('fullName').trim().notEmpty().withMessage('Nome completo é obrigatório'),
  body('bio').optional().trim(),
  body('expertise')
    .if((value, { req }) => req.user.role === 'instructor')
    .isArray({ min: 3 }).withMessage('Instrutores devem ter pelo menos 3 áreas de especialização'),
  body('website').optional().isURL().withMessage('URL inválida'),
  body('avatarUrl').optional().isURL().withMessage('URL do avatar inválida'),
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

/**
 * Validação para login
 */
const validateLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('O email é obrigatório')
    .isEmail().withMessage('Por favor, forneça um email válido')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('A senha é obrigatória'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg,
        }))
      });
    }
    next();
  }
];

/**
 * Validação para reenvio de email de verificação
 */
const validateResendVerification = [
  body('email')
    .trim()
    .notEmpty().withMessage('O email é obrigatório')
    .isEmail().withMessage('Por favor, forneça um email válido')
    .normalizeEmail()
    .custom(async (email) => {
      const tempUser = await TempUser.findOne({ 
        where: { 
          email,
          tokenExpires: { [Op.gt]: new Date() }
        } 
      });
      
      if (!tempUser) {
        throw new Error('Nenhum registro pendente encontrado para este email');
      }
      
      if (tempUser.verificationAttempts >= 5) {
        throw new Error('Limite de tentativas excedido. Por favor, aguarde antes de tentar novamente.');
      }
    }),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg,
        }))
      });
    }
    next();
  }
];

/**
 * Validação para verificação de token via URL
 */
const validateTokenVerification = [
  query('token')
    .notEmpty().withMessage('Token de verificação é obrigatório')
    .custom(async (token) => {
      const tempUser = await TempUser.findOne({
        where: {
          verificationToken: token,
          tokenExpires: { [Op.gt]: new Date() }
        }
      });
      
      if (!tempUser) {
        throw new Error('Token inválido ou expirado');
      }
    }),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg,
        }))
      });
    }
    next();
  }
];

module.exports = {
  validateFirstStep,
  validateSecondStep,
  validateCompleteProfile,
  validateLogin,
  validateResendVerification,
  validateTokenVerification
};