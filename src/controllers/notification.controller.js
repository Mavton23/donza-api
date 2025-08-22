const notificationService = require('../services/notification.service');
const { 
  BadRequestError, 
  ForbiddenError, 
  NotFoundError 
} = require('../utils/errors');
const { ROLES } = require('../constants/constants');

module.exports = {
  /**
   * Middleware para verificar se a notificação pertence ao usuário
   */
  verifyNotificationOwnership: async (req, res, next) => {
    try {
      const notification = await notificationService.getNotificationById(
        req.params.notificationId
      );

      if (!notification) {
        throw new NotFoundError('Notificação não encontrada');
      }

      // Admins podem acessar qualquer notificação
      if (req.user.role !== ROLES.ADMIN && notification.userId !== req.user.userId) {
        throw new ForbiddenError('Acesso não autorizado a esta notificação');
      }

      req.notification = notification;
      next();
    } catch (error) {
      next(error);
    }
  },

  /**
   * Obtém notificações do usuário com paginação e filtros
   */
  getUserNotifications: async (req, res, next) => {
    try {
      const { 
        limit = 20, 
        offset = 0, 
        includeRead = false,
        type,
        fromDate,
        toDate 
      } = req.query;

      const result = await notificationService.getUserNotifications(
        req.user.userId,
        {
          limit: parseInt(limit),
          offset: parseInt(offset),
          includeRead: includeRead === 'true',
          types: type ? [type] : [],
          fromDate,
          toDate
        }
      );

      res.json({
        success: true,
        data: result.notifications,
        meta: {
          total: result.total,
          unread: result.unread,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.log("ERROR GETTING NOTIFICATIONS: ", error instanceof Error ? error.message : error);
      next(error);
    }
  },

  /**
   * Obtém o status de notificações do usuário 
   */
  hasUnreadNotifications: async (req, res, next) => {
    try {
      const currentUserId = req.user.userId;

      // Verifica se há notificações não lidas
      const unreadCount = await Notification.count({
        where: {
          userId: currentUserId,
          isRead: false
        }
      });

      res.json({
        success: true,
        hasUnread: unreadCount > 0,
        count: unreadCount
      });

    } catch (error) {
      console.error("Error checking unread notifications:", error);
      next(error);
    }
  },

  /**
   * Versão administrativa para visualizar notificações de qualquer usuário
   */
  getUserNotificationsAdmin: async (req, res, next) => {
    try {
      const { userId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      const result = await notificationService.getUserNotifications(
        userId,
        {
          limit: parseInt(limit),
          offset: parseInt(offset),
          includeRead: true
        }
      );

      res.json({
        success: true,
        data: result.notifications,
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
   * Marca notificação como lida
   */
  markAsRead: async (req, res, next) => {
    try {
      const { notificationId } = req.params;
      const result = await notificationService.markAsRead(
        notificationId,
        req.user.userId
      );

      res.json({
        success: true,
        data: {
          notificationId,
          readAt: result.readAt
        }
      });
    } catch (error) {
      console.log("ERROR MARK AS READ: ", error instanceof Error ? error.message : error);
      next(error);
    }
  },

  /**
   * Marca todas as notificações como lidas
   */
  markAllAsRead: async (req, res, next) => {
    try {
      const result = await notificationService.markAllAsRead(
        req.user.userId
      );

      res.json({
        success: true,
        data: {
          markedCount: result.markedCount
        }
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Atualiza preferências de notificação
   */
  updatePreferences: async (req, res, next) => {
    try {
      const updatedPreferences = await notificationService.updateUserPreferences(
        req.user.userId,
        req.body
      );

      res.json({
        success: true,
        data: updatedPreferences
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Obtém preferências de notificação do usuário
   */
  getPreferences: async (req, res, next) => {
    try {
      const preferences = await notificationService.getUserPreferences(
        req.user.userId
      );

      res.json({
        success: true,
        data: preferences
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Cria uma notificação manualmente (apenas admin)
   */
  createNotification: async (req, res, next) => {
    try {
      const { userId, type, message, metadata } = req.body;
      const creatorId = req.user.userId;
      
      if (!userId || !type || !message) {
        throw new BadRequestError('Dados incompletos para criar notificação');
      }

      const notification = await notificationService.createNotification(
        userId,
        type,
        {
          message,
          metadata,
          createdBy: creatorId
        }
      );

      res.status(201).json({
        success: true,
        data: notification
      });
    } catch (error) {
      next(error);
    }
  }
};