const activityService = require('../services/activityService');

module.exports = {
  /**
   * Middleware para log de atividades administrativas
   */
  logAdminAction(action, entityType) {
    return async (req, res, next) => {
      try {
        if (req.user?.role === 'admin') {
          await activityService.logAdminActivity(
            req.user.userId,
            action,
            { 
              type: entityType, 
              id: req.params.id || req.body.id 
            },
            {
              method: req.method,
              endpoint: req.originalUrl,
              changes: req.method !== 'GET' ? req.body : undefined
            }
          );
        }
        next();
      } catch (error) {
        console.error('Failed to log admin activity', error);
        next();
      }
    };
  },

  /**
   * Middleware para log de acesso
   */
  logAccess() {
    return async (req, res, next) => {
      try {
        if (req.user?.role === 'admin') {
          await activityService.logActivity({
            userId: req.user.userId,
            type: 'admin_access',
            entityType: 'endpoint',
            entityId: null,
            metadata: {
              method: req.method,
              endpoint: req.originalUrl,
              statusCode: res.statusCode
            }
          });
        }
        next();
      } catch (error) {
        console.error('Failed to log access', error);
        next();
      }
    };
  }
};