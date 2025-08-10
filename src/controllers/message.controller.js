const { Conversation, Message, User, Course, Enrollment, ConversationParticipant } = require('../models');
const { Op, Sequelize } = require('sequelize');
const { sequelize } = require('../configs/db');
const logger = require('../utils/logger');
const NodeCache = require('node-cache');
const messageCache = new NodeCache({ stdTTL: 300 });
const notificationService = require('../services/notification.service');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../utils/errors');
const { startOfToday, endOfToday } = require('date-fns');

/**
* Verifica permissões de mensagem entre usuários
*/
const _checkMessagePermissions = async (sender, receiver, context = {}) => {
  if (['institution', 'admin'].includes(sender.role)) return true;

  // Instrutores podem enviar para estudantes e instituições
  if (sender.role === 'instructor') {
    return ['student', 'institution'].includes(receiver.role);
  }

  if (sender.role === 'student') {
    if (receiver.role === 'instructor') {
      if (context.courseId) {
        const [isEnrolled, isTeaching] = await Promise.all([
          Enrollment.findOne({
            where: {
              userId: sender.userId,
              courseId: context.courseId,
              status: 'active'
            }
          }),
          Course.findOne({
            where: {
              courseId: context.courseId,
              instructorId: receiver.userId
            }
          })
        ]);
        return !!isEnrolled && !!isTeaching;
      }
      
      return receiver.messagePreferences?.acceptsMessagesFromStudents;
    }

    if (receiver.role === 'institution') {
      return context.isTicket;
    }
  }

  return false;
};

/**
   * Método auxiliar: Formata resposta de conversa
   */
const _formatConversationResponse = async (conversation, currentUserId) => {
  const otherParticipants = conversation.participants?.filter(
    p => p.userId !== currentUserId
  ) || [];

  return {
    conversationId: conversation.conversationId,
    contextType: conversation.contextType,
    contextId: conversation.contextId,
    isGroup: conversation.isGroup,
    participants: otherParticipants,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt
  };
}

 /**
   * Método auxiliar: Notifica participantes
   */
 const _notifyParticipants = async (
  conversationId,
  senderId,
  content,
  isTicket = false,
  transaction = null
) => {
  const options = transaction ? { transaction } : {};

  try {
    const conversation = await Conversation.findOne({
      include: [{
        model: User,
        as: 'participants',
        where: { userId: { [Op.not]: senderId } },
        attributes: ['userId', 'notificationPreferences']
      }],
      where: { conversationId }
    }, options);

    if (!conversation) return;

    const notificationPromises = conversation.participants.map(participant => {
      const wantsNotification = participant.notificationPreferences?.inApp?.newMessages ?? true;

      if (!wantsNotification) return null;

      return notificationService.createNotification(
        participant.userId,
        'NEW_MESSAGE',
        {
          senderId,
          conversationId,
          preview: content.length > 50 ? `${content.substring(0, 50)}...` : content,
          context: isTicket ? 'ticket' : conversation.contextType || 'direct'
        },
        options
      );
    });

    await Promise.all(notificationPromises);
  } catch (error) {
    console.error('Erro ao notificar participantes:', error);
  }
};


module.exports = {
  /**
 * Verifica e retorna conversa existente ou cria nova
 */
getOrCreateConversation: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { participants, contextType, contextId, initialMessage } = req.body;
    const currentUser = req.user;

    // Validação básica
    if (!participants || participants.length === 0) {
      throw new BadRequestError('Destinatários são obrigatórios');
    }

    // Busca participantes no banco
    const dbParticipants = await User.findAll({
      where: { userId: { [Op.in]: participants } },
      attributes: ['userId', 'role', 'messagePreferences']
    });

    if (dbParticipants.length !== participants.length) {
      throw new NotFoundError('Um ou mais destinatários não encontrados');
    }

    // Verifica permissões para cada destinatário
    for (const recipient of dbParticipants) {
      const canMessage = await _checkMessagePermissions(
        currentUser,
        recipient,
        { courseId: contextType === 'course' ? contextId : null }
      );

      if (!canMessage) {
        throw new ForbiddenError(`Você não pode enviar mensagens para ${recipient.username}`);
      }
    }

    // Tenta encontrar conversa existente
    const existingConversation = await Conversation.findOne({
      where: {
        contextType,
        contextId: contextType ? contextId : null,
        isGroup: participants.length > 1
      },
      include: [{
        model: User,
        as: 'participants',
        where: { userId: { [Op.in]: [...participants, currentUser.userId] }}
      }],
      group: ['Conversation.conversationId'],
      having: sequelize.literal(`COUNT(DISTINCT "participants"."userId") = ${participants.length + 1}`)
    });

    // Se existir, retorna a conversa existente
    if (existingConversation) {
      if (initialMessage) {
        await Message.create({
          content: initialMessage.trim(),
          conversationId: existingConversation.conversationId,
          senderId: currentUser.userId,
          contextType,
          courseId: contextType === 'course' ? contextId : null
        }, { transaction });

        await Conversation.update(
          { lastMessageAt: new Date() },
          { where: { conversationId: existingConversation.conversationId }, transaction }
        );
      }

      await transaction.commit();
      return res.json({
        success: true,
        data: await _formatConversationResponse(existingConversation, currentUser.userId),
        existing: true
      });
    }

    // Se não existir, cria nova conversa
    const conversation = await Conversation.create({
      lastMessageAt: new Date(),
      contextType,
      contextId,
      isGroup: participants.length > 1
    }, { transaction });

    // Adiciona participantes
    await conversation.addParticipants(
      [...participants, currentUser.userId],
      { transaction }
    );

    // Mensagem inicial
    let message = null;

    if (initialMessage) {
      message = await Message.create({
        content: initialMessage.trim(),
        conversationId: conversation.conversationId,
        senderId: currentUser.userId,
        contextType,
        courseId: contextType === 'course' ? contextId : null
      }, { transaction });
    }

    // Notifica novos participantes
    if (!existingConversation && initialMessage && message) {
      await notificationService.notifyNewConversation(
        currentUser.userId,
        participants
      );

      await Promise.all(participants.map(participantId => 
        notificationService.notifyNewMessage(
          currentUser.userId,
          participantId,
          message.messageId
        )
      ));
    }

    await transaction.commit();

    res.status(201).json({
      success: true,
      data: await _formatConversationResponse(conversation, currentUser.userId)
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

/**
 * Marca mensagens como lidas
 */
markAsRead: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { conversationId } = req.params;
    const currentUserId = req.user.userId;

    await Message.update(
      { isRead: true },
      {
        where: {
          conversationId,
          senderId: { [Op.ne]: currentUserId },
          isRead: false
        },
        transaction
      }
    );

    // Busca última mensagem da conversa
    const lastMessage = await Message.findOne({
      where: { conversationId },
      order: [['createdAt', 'DESC']]
    }, { transaction });

    if (!lastMessage) {
      throw new NotFoundError('Nenhuma mensagem encontrada');
    }
    
    // Busca participantes exceto o usuário atual
    const otherParticipants = await ConversationParticipant.findAll({
      where: {
        conversationId,
        userId: { [Op.ne]: currentUserId }
      },
      transaction
    });

    // Notifica cada participante que suas mensagens foram lidas
    await Promise.all(otherParticipants.map(participant =>
      notificationService.notifyConversationRead(
        currentUserId,
        conversationId,
        lastMessage.messageId,
        participant.userId
      )
    ));

    await transaction.commit();
    res.json({ success: true });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

  /**
 * Envia mensagem com validações completas + WebSocket
 */
sendMessage: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { content, isTicket = false } = req.body;
    const { conversationId } = req.params;
    const currentUser = req.user;

    // Validação básica
    if (!content || content.trim().length === 0) {
      throw new BadRequestError('Conteúdo da mensagem é obrigatório');
    }

    // Busca conversa com participantes
    const conversation = await Conversation.findOne({
      where: { conversationId },
      include: [{
        model: User,
        as: 'participants',
        attributes: ['userId', 'role', 'messagePreferences', 'username', 'avatarUrl'],
        through: { attributes: [] }
      }],
      transaction
    });

    if (!conversation) {
      throw new NotFoundError('Conversa não encontrada');
    }

    // Verificação de participação
    const isParticipant = conversation.participants.some(
      p => p.userId === currentUser.userId
    );
    if (!isParticipant) {
      throw new ForbiddenError('Você não tem acesso a esta conversa');
    }

    // Limite diário para estudantes
    if (currentUser.role === 'student' && !isTicket) {
      const cacheKey = `msgCount-${currentUser.userId}-${new Date().toISOString().split('T')[0]}`;
      let messageCount = messageCache.get(cacheKey) || 0;
      
      if (messageCount === 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        messageCount = await Message.count({
          where: {
            senderId: currentUser.userId,
            createdAt: { [Op.gte]: today },
            isTicket: false
          },
          transaction
        });
        messageCache.set(cacheKey, messageCount);
      }

      const dailyLimit = currentUser.messagePreferences?.dailyMessageLimit || 5;
      if (messageCount >= dailyLimit) {
        throw new ForbiddenError(`Limite diário de ${dailyLimit} mensagens atingido`);
      }
    }

    // Criação da mensagem com dados completos
    const message = await Message.create({
      content: content.trim(),
      senderId: currentUser.userId,
      conversationId,
      contextType: conversation.contextType,
      courseId: conversation.contextType === 'course' ? conversation.contextId : null,
      isTicket,
      status: isTicket ? 'pending' : 'delivered',
      isRead: false
    }, { transaction });

    // Carrega dados do sender para o WebSocket
    const messageWithSender = await Message.findByPk(message.messageId, {
      include: [{
        model: User,
        as: 'sender',
        attributes: ['userId', 'username', 'avatarUrl', 'role']
      }],
      transaction
    });

    // Atualiza última mensagem e contadores
    const key = `msgCount-${currentUser.userId}-${new Date().toISOString().split('T')[0]}`;

    await Promise.all([
      Conversation.update(
        { lastMessageAt: new Date() },
        { where: { conversationId }, transaction }
      )
    ]);

    // Atualiza cache de contagem
    messageCache.set(
      key,
      (messageCache.get(key) || 0) + 1
    ),

    // Broadcast via WebSocket
    req.app.locals.broadcastToConversation(conversationId, {
      type: 'NEW_MESSAGE',
      data: {
        ...messageWithSender.toJSON(),
        participants: conversation.participants 
      }
    });

    // Filtra participantes
    const recipients = conversation.participants
      .filter(p => p.userId !== currentUser.userId)
      .map(p => p.userId);

    // Notifica cada destinatário
    await Promise.all(recipients.map(async recipientId => {
      try {
        await notificationService.notifyNewMessage(
          currentUser.userId,
          recipientId,
          message.messageId
        );
      } catch (error) {
        logger.error(`Falha ao notificar usuário ${recipientId}`, {
          error: error.message,
          messageId: message.messageId
        });
      }
    }));

    // Se for ticket, notifica administradores
    if (isTicket) {
      const admins = await User.findAll({
        where: { role: 'admin' },
        attributes: ['userId'],
        transaction
      });
      
      await Promise.all(admins.map(admin =>
        notificationService.createNotification(
          admin.userId,
          'NEW_TICKET',
          {
            relatedEntityId: message.messageId,
            metadata: {
              senderId: currentUser.userId,
              senderUsername: currentUser.username,
              messagePreview: content.length > 50 ? content.substring(0, 50) + '...' : content
            }
          }
        )
      ));
    }

    await transaction.commit();

    // Resposta otimizada
    res.status(201).json({
      success: true,
      data: messageWithSender
    });

  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

  /**
 * Lista conversas do usuário com filtros (versão corrigida)
 */
  getUserConversations: async (req, res, next) => {
    try {
      const { contextType, courseId, unreadOnly } = req.query;
      const currentUserId = req.user.userId;

      // Primeiro verifica as conversas onde o usuário é participante
      const userConversations = await ConversationParticipant.findAll({
        where: { userId: currentUserId },
        attributes: ['conversationId'],
        raw: true
      });

      if (userConversations.length === 0) {
        return res.json({ success: true, data: [] });
      }

      const conversationIds = userConversations.map(uc => uc.conversationId);

      // Filtros adicionais
      const whereClause = {
        conversationId: { [Op.in]: conversationIds }
      };

      if (contextType) whereClause.contextType = contextType;
      if (courseId) whereClause.contextId = courseId;

      // Subquery para mensagens não lidas
      const unreadCountSubquery = Sequelize.literal(`(
        SELECT COUNT(*) FROM "messages" AS m
        JOIN "ConversationParticipants" AS cp ON cp."conversationId" = m."conversationId"
        WHERE m."conversationId" = "Conversation"."conversationId"
        AND m."isRead" = false
        AND m."senderId" != '${currentUserId}'
        AND cp."userId" = '${currentUserId}'
      )`);

      // Query principal
      const conversations = await Conversation.findAll({
        attributes: {
          include: [
            [unreadCountSubquery, 'unreadCount']
          ]
        },
        include: [
          {
            model: User,
            as: 'participants',
            attributes: ['userId', 'username', 'avatarUrl', 'role'],
            through: { attributes: [] },
            where: {
              userId: { [Op.ne]: currentUserId }
            }
          },
          {
            model: Message,
            as: 'lastMessage',
            separate: true,
            order: [['createdAt', 'DESC']],
            limit: 1,
            include: [{
              model: User,
              as: 'sender',
              attributes: ['userId', 'username']
            }]
          }
        ],
        where: whereClause,
        order: [['updatedAt', 'DESC']]
      });

      // Formatação da resposta
      const formatted = conversations.map(conv => ({
        conversationId: conv.conversationId,
        contextType: conv.contextType,
        contextId: conv.contextId,
        isGroup: conv.isGroup,
        participants: conv.participants,
        lastMessage: conv.lastMessage[0] || null,
        unreadCount: conv.dataValues.unreadCount || 0,
        updatedAt: conv.updatedAt
      }));

      // Filtro adicional para mensagens não lidas
      const filteredResults = unreadOnly 
        ? formatted.filter(conv => conv.unreadCount > 0)
        : formatted;

      res.json({
        success: true,
        data: filteredResults
      });

    } catch (error) {
      console.error("Error in getUserConversations:", error instanceof Error ? error.message : error);
      next(error);
    }
  },

  /**
   * @function getTodayMessageCount
   * @description Obtém a contagem de mensagens enviadas pelo usuário hoje
   * @param {import('express').Request} req - Objeto da requisição
   * @param {import('express').Response} res - Objeto da resposta
   * @param {Function} next - Função next para tratamento de erros
   */
  getTodayMessageCount: async (req, res, next) => {
    try {
      const cacheKey = `msgCount-${req.user.userId}-${new Date().toISOString().split('T')[0]}`;
      const cachedCount = messageCache.get(cacheKey);
      
      if (cachedCount !== undefined) {
        return res.json({
          success: true,
          data: {
            count: cachedCount,
            cached: true
          }
        });
      }
  
      const todayStart = startOfToday();
      const todayEnd = endOfToday();
  
      const count = await Message.count({
        where: {
          senderId: req.user.userId,
          createdAt: {
            [Op.between]: [todayStart, todayEnd]
          }
        }
      });
  
      messageCache.set(cacheKey, count);
      
      res.json({
        success: true,
        data: {
          count
        }
      });
    } catch (error) {
      console.error('Error getting today message count:', error);
      next(error);
    }
  },

  /**
   * Busca mensagens de uma conversa
   */
  getMessages: async (req, res, next) => {
    try {
      const { conversationId } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      const currentUserId = req.user.userId;
  
      // Usa a verificação de acesso que já inclui a verificação de participação
      const messages = await Message.findAll({
        where: { conversationId },
        include: [{
          model: User,
          as: 'sender',
          attributes: ['userId', 'username', 'avatarUrl', 'role']
        }],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
  
      // Marca mensagens como lidas
      await Message.update(
        { isRead: true },
        {
          where: {
            conversationId,
            senderId: { [Op.not]: currentUserId },
            isRead: false
          }
        }
      );
  
      res.json({
        success: true,
        data: messages.reverse()
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Cria conversa automática para um curso
   */
  createCourseConversation: async (courseId, instructorId) => {
    const transaction = await sequelize.transaction();
    try {
      // Verifica se já existe
      const existing = await Conversation.findOne({
        where: {
          contextType: 'course',
          contextId: courseId
        }
      });

      if (existing) return existing;

      const conversation = await Conversation.create({
        lastMessageAt: new Date(),
        contextType: 'course',
        contextId: courseId,
        isGroup: false
      }, { transaction });

      await conversation.addParticipants([instructorId], { transaction });

      await transaction.commit();
      return conversation;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  /**
   * Middleware de verificação de acesso
   */
  verifyConversationAccess: async (req, res, next) => {
    try {
      const { conversationId } = req.params;
      const currentUserId = req.user.userId;
  
      const isParticipant = await ConversationParticipant.findOne({
        where: {
          conversationId,
          userId: currentUserId
        },
        include: [{
          model: Conversation,
          as: 'Conversation',
          attributes: ['conversationId', 'contextType', 'contextId']
        }]
      });
  
      if (!isParticipant || !isParticipant.Conversation) {
        throw new ForbiddenError('Acesso não autorizado');
      }
  
      // Verificação adicional para cursos
      if (isParticipant.Conversation.contextType === 'course') {
        const isEnrolledOrInstructor = await Enrollment.findOne({
          where: {
            userId: currentUserId,
            courseId: isParticipant.Conversation.contextId,
            status: 'active'
          }
        });
  
        if (!isEnrolledOrInstructor && req.user.role !== 'instructor') {
          throw new ForbiddenError('Você não está matriculado neste curso');
        }
      }
  
      req.conversation = isParticipant.Conversation;
      next();
    } catch (error) {
      next(error);
    }
  },

 

};