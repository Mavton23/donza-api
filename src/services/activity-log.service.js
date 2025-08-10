const { Activity } = require('../models');

module.exports = {
  logActivity: async ({ userId, groupId = null, type, entityType, entityId, duration = null, metadata = {} }) => {
    try {
      // Validação básica dos parâmetros
      if (!userId || !type || !entityType || !entityId) {
        throw new Error('Parâmetros obrigatórios faltando para log de atividade');
      }

      // Criar a atividade
      const activity = await Activity.create({
        userId,
        groupId,
        type,
        entityType,
        entityId,
        duration,
        metadata
      });

      // Carregar relações básicas para possível uso posterior
      return activity.reload({
        include: [
          { association: 'user', attributes: ['userId', 'username', 'avatarUrl'] },
          ...(groupId ? [{ association: 'group', attributes: ['groupId', 'name'] }] : [])
        ]
      });
    } catch (error) {
      console.error('Falha ao registrar atividade:', error);
      return null;
    }
  },

  // Métodos específicos para tipos comuns de atividades
  logContentUpload: async ({ userId, groupId, contentId }) => {
    return module.exports.logActivity({
      userId,
      groupId,
      type: 'content_upload',
      entityType: 'group_content',
      entityId: contentId,
      metadata: { action: 'upload' }
    });
  },

  logLinkShared: async ({ userId, groupId, contentId }) => {
    return module.exports.logActivity({
      userId,
      groupId,
      type: 'link_shared',
      entityType: 'group_content',
      entityId: contentId,
      metadata: { action: 'share' }
    });
  },

  logContentUpdate: async ({ userId, groupId, contentId }) => {
    return module.exports.logActivity({
      userId,
      groupId,
      type: 'content_update',
      entityType: 'group_content',
      entityId: contentId,
      metadata: { action: 'update' }
    });
  },

  logContentDelete: async ({ userId, groupId, contentId }) => {
    return module.exports.logActivity({
      userId,
      groupId,
      type: 'content_delete',
      entityType: 'group_content',
      entityId: contentId,
      metadata: { action: 'delete' }
    });
  },

  logContentDownload: async ({ userId, groupId, contentId }) => {
    return module.exports.logActivity({
      userId,
      groupId,
      type: 'content_download',
      entityType: 'group_content',
      entityId: contentId,
      metadata: { action: 'download' }
    });
  }
};