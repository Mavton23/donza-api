const contactService = require('../services/contact.service');
const { 
  BadRequestError, 
  ForbiddenError, 
  NotFoundError 
} = require('../utils/errors');
const { ROLES } = require('../constants/constants');

module.exports = {
  /**
   * Middleware para verificar acesso à solicitação
   */
  verifyRequestOwnership: async (req, res, next) => {
    try {
      const request = await contactService.getRequestById(
        req.params.requestId
      );

      if (!request) {
        throw new NotFoundError('Solicitação não encontrada');
      }

      // Admins podem acessar qualquer solicitação
      if (![ROLES.ADMIN].includes(req.user.role)) {
        if (request.userId !== req.user.userId) {
          throw new ForbiddenError('Acesso não autorizado a esta solicitação');
        }
      }

      req.contactRequest = request;
      next();
    } catch (error) {
      next(error);
    }
  },

  /**
   * Cria uma nova solicitação de contato
   */
  createContactRequest: async (req, res, next) => {
    try {
      const request = await contactService.createRequest({
        ...req.body,
        userId: req.user?.userId || null
      });

      res.status(201).json({
        success: true,
        data: request
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Lista solicitações de contato com filtros
   */
  listContactRequests: async (req, res, next) => {
    try {
      const { 
        status, 
        contactMethod, 
        limit = 20, 
        offset = 0 
      } = req.query;

      const result = await contactService.listRequests({
        status,
        contactMethod,
        limit: parseInt(limit),
        offset: parseInt(offset),
        // Restringe a consulta se não for admin
        userId: [ROLES.ADMIN].includes(req.user.role) 
          ? null 
          : req.user.userId
      });

      res.json({
        success: true,
        data: result.requests,
        meta: {
          total: result.total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Obtém detalhes de uma solicitação
   */
  getContactRequest: async (req, res, next) => {
    try {
      res.json({
        success: true,
        data: req.contactRequest
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Atualiza o status de uma solicitação
   */
  updateRequestStatus: async (req, res, next) => {
    try {
      const { status } = req.body;
      const { requestId } = req.params;
      const { userId } = req.user;
      
      if (!['pending', 'in_progress', 'resolved'].includes(status)) {
        throw new BadRequestError('Status inválido');
      }

      const updatedRequest = await contactService.updateRequestStatus(
        requestId,
        status,
        userId
      );

      res.json({
        success: true,
        data: updatedRequest
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Inicia uma sessão de chat
   */
  startChatSession: async (req, res, next) => {
    try {
      const session = await contactService.startChatSession({
        userId: req.user.userId,
        name: req.user.fullName || req.user.username,
        email: req.user.email,
        subject: req.body.subject || 'Ajuda via Chat'
      });

      res.json({
        success: true,
        data: session
      });
    } catch (error) {
      next(error);
    }
  }
};