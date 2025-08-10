const { body } = require('express-validator');

const adminRegisterValidations = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 30 })
        .withMessage('Username deve ter entre 3 e 30 caracteres')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username pode conter apenas letras, números e underscores'),
    
    body('email')
        .isEmail()
        .withMessage('Email inválido')
        .normalizeEmail(),
    
    body('password')
        .isLength({ min: 8 })
        .withMessage('Senha deve ter no mínimo 8 caracteres')
        .matches(/[A-Z]/)
        .withMessage('Senha deve conter pelo menos uma letra maiúscula')
        .matches(/[0-9]/)
        .withMessage('Senha deve conter pelo menos um número'),
    
    body('secretKey')
        .notEmpty()
        .withMessage('Chave secreta é obrigatória'),
    
    body('fullName')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Nome completo deve ter no máximo 100 caracteres')
];

module.exports = adminRegisterValidations;