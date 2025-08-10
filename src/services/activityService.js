const { Activity } = require('../models');
const logger = require('../utils/logger');

module.exports = {
  /**
   * Registra uma nova atividade no sistema
   */
  async logActivity({
    userId,
    type,
    entityType,
    entityId,
    metadata = {}
  }) {
    try {
      return await Activity.create({
        userId,
        type,
        entityType,
        entityId,
        metadata
      });
    } catch (error) {
      logger.error('Failed to log activity', {
        error,
        activityData: { userId, type, entityType, entityId }
      });
      throw error;
    }
  },

  /**
   * Registra atividade administrativa
   */
  async logAdminActivity(adminId, action, targetEntity, details = {}) {
    return this.logActivity({
      userId: adminId,
      type: `admin_${action}`,
      entityType: targetEntity.type,
      entityId: targetEntity.id,
      metadata: {
        action,
        ...details
      }
    });
  },

  /**
   * Registra atividade do sistema
   */
  async logSystemActivity(type, details = {}) {
    return this.logActivity({
      userId: null,
      type: `system_${type}`,
      entityType: 'system',
      entityId: null,
      metadata: details
    });
  },

  /**
   * Obtém atividades com filtros
   */
  async getActivities(filters = {}, pagination = { page: 1, limit: 20 }) {
    const { type, userId, entityType, startDate, endDate } = filters;
    const { page, limit } = pagination;

    const where = {};
    if (type) where.type = type;
    if (userId) where.userId = userId;
    if (entityType) where.entityType = entityType;
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }

    const offset = (page - 1) * limit;

    return Activity.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      include: ['user']
    });
  }
};