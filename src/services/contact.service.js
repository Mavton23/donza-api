const { ContactRequest, User } = require('../models');
const emailService = require('./email.service');
const logger = require('../utils/logger');

class ContactService {
  constructor() {
    this.contactMethods = {
      email: {
        handler: this._handleEmailRequest,
        requiredFields: ['subject', 'message']
      },
      callback: {
        handler: this._handleCallbackRequest,
        requiredFields: ['phone', 'preferredTime']
      },
      chat: {
        handler: this._handleChatRequest,
        immediate: true
      }
    };
  }

  /**
   * Cria uma nova solicitação de contato
   */
  async createRequest(data) {
    const transaction = await ContactRequest.sequelize.transaction();
    
    try {
      const methodConfig = this.contactMethods[data.contactMethod];
      if (!methodConfig) {
        throw new Error('Método de contato inválido');
      }

      // Valida campos obrigatórios
      if (methodConfig.requiredFields) {
        for (const field of methodConfig.requiredFields) {
          if (!data[field]) {
            throw new Error(`Campo obrigatório faltando: ${field}`);
          }
        }
      }

      const request = await ContactRequest.create({
        userId: data.userId,
        name: data.name,
        email: data.email,
        contactMethod: data.contactMethod,
        subject: data.subject,
        message: data.message,
        phone: data.phone,
        preferredTime: data.preferredTime,
        status: 'pending',
        metadata: {
          ip: data.ip,
          userAgent: data.userAgent
        }
      }, { transaction });

      // Processa de acordo com o método de contato
      await methodConfig.handler(request, transaction);

      await transaction.commit();
      return request;
    } catch (error) {
      await transaction.rollback();
      logger.error('Falha ao criar solicitação de contato:', error);
      throw error;
    }
  }

  /**
   * Lista solicitações com filtros
   */
  async listRequests({ status, contactMethod, userId, limit, offset }) {
    const where = {};
    
    if (status) where.status = status;
    if (contactMethod) where.contactMethod = contactMethod;
    if (userId) where.userId = userId;

    const { count, rows } = await ContactRequest.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      include: userId ? [] : [
        {
          model: User,
          attributes: ['userId', 'name', 'email'],
          as: 'user'
        }
      ]
    });

    return {
      requests: rows,
      total: count
    };
  }

  /**
   * Obtém uma solicitação por ID
   */
  async getRequestById(requestId) {
    return ContactRequest.findByPk(requestId, {
      include: [
        {
          model: User,
          attributes: ['userId', 'name', 'email', 'avatarUrl'],
          as: 'user'
        }
      ]
    });
  }

  /**
   * Atualiza o status de uma solicitação
   */
  async updateRequestStatus(requestId, status, updatedBy) {
    const request = await ContactRequest.findByPk(requestId);
    if (!request) {
      throw new Error('Solicitação não encontrada');
    }

    request.status = status;
    request.updatedBy = updatedBy;
    await request.save();

    // Dispara eventos baseados no status
    if (status === 'in_progress') {
      this._notifyRequestInProgress(request);
    } else if (status === 'resolved') {
      this._notifyRequestResolved(request);
    }

    return request;
  }

  /**
   * Inicia uma sessão de chat
   */
  // async startChatSession(data) {
  //   const session = await chatService.createSession({
  //     userId: data.userId,
  //     userName: data.name,
  //     userEmail: data.email,
  //     subject: data.subject
  //   });

  //   // Cria registro da solicitação de contato
  //   await ContactRequest.create({
  //     userId: data.userId,
  //     name: data.name,
  //     email: data.email,
  //     contactMethod: 'chat',
  //     subject: data.subject,
  //     status: 'in_progress',
  //     metadata: {
  //       chatSessionId: session.sessionId
  //     }
  //   });

  //   return session;
  // }

  // Métodos privados para tratamento específico
  async _handleEmailRequest(request) {
    await emailService.sendContactEmail({
      to: 'suporte@plataforma.com',
      subject: `[Contato] ${request.subject}`,
      text: `
        Nova mensagem de ${request.name} (${request.email}):
        ${request.message}
        
        Método: E-mail
        Data: ${request.createdAt}
      `,
      replyTo: request.email
    });
  }

  async _handleCallbackRequest(request) {
    await emailService.sendCallbackRequest({
      to: 'agendamento@plataforma.com',
      name: request.name,
      phone: request.phone,
      preferredTime: request.preferredTime,
      subject: request.subject || 'Retorno solicitado'
    });
  }

  async _handleChatRequest(request) {
    // Já tratado no startChatSession
  }

  async _notifyRequestInProgress(request) {
    if (request.userId) {
      await notificationService.createNotification(
        request.userId,
        'CONTACT_REQUEST_UPDATE',
        {
          message: `Sua solicitação de ${request.contactMethod} está em andamento`,
          metadata: {
            requestId: request.requestId
          }
        }
      );
    }
  }

  async _notifyRequestResolved(request) {
    if (request.userId) {
      await notificationService.createNotification(
        request.userId,
        'CONTACT_REQUEST_RESOLVED',
        {
          message: `Sua solicitação de ${request.contactMethod} foi resolvida`,
          metadata: {
            requestId: request.requestId
          }
        }
      );
      
      if (request.contactMethod === 'email') {
        await emailService.sendRequestResolvedEmail({
          to: request.email,
          name: request.name,
          requestId: request.requestId,
          contactMethod: request.contactMethod
        });
      }
    }
  }
}

module.exports = new ContactService();