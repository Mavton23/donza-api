const { body, query } = require('express-validator');

module.exports = {
  validateContactRequest: [
    body('name')
      .trim()
      .notEmpty().withMessage('Nome é obrigatório')
      .isLength({ min: 3 }).withMessage('Nome deve ter pelo menos 3 caracteres'),
      
    body('email')
      .trim()
      .notEmpty().withMessage('E-mail é obrigatório')
      .isEmail().withMessage('E-mail inválido'),
      
    body('contactMethod')
      .isIn(['email', 'chat', 'callback']).withMessage('Método de contato inválido'),
      
    body('subject')
      .if(body('contactMethod').equals('email'))
      .notEmpty().withMessage('Assunto é obrigatório para e-mail')
      .isLength({ max: 100 }).withMessage('Assunto muito longo'),
      
    body('message')
      .if(body('contactMethod').equals('email'))
      .notEmpty().withMessage('Mensagem é obrigatória para e-mail')
      .isLength({ min: 10, max: 2000 }).withMessage('Mensagem deve ter entre 10 e 2000 caracteres'),
      
    body('phone')
      .if(body('contactMethod').equals('callback'))
      .notEmpty().withMessage('Telefone é obrigatório para agendamento')
      .isMobilePhone('pt-BR').withMessage('Número de telefone inválido'),
      
    body('preferredTime')
      .if(body('contactMethod').equals('callback'))
      .notEmpty().withMessage('Horário preferencial é obrigatório')
      .isISO8601().withMessage('Formato de data/horário inválido')
      .custom(value => {
        return new Date(value) > new Date();
      }).withMessage('O horário deve ser futuro')
  ],

  validateListRequests: [
    query('status')
      .optional()
      .isIn(['pending', 'in_progress', 'resolved']).withMessage('Status inválido'),
      
    query('contactMethod')
      .optional()
      .isIn(['email', 'chat', 'callback']).withMessage('Método de contato inválido'),
      
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Limit deve ser entre 1 e 100')
      .toInt(),
      
    query('offset')
      .optional()
      .isInt({ min: 0 }).withMessage('Offset deve ser um número positivo')
      .toInt()
  ]
};