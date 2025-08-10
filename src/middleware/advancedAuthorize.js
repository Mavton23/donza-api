const { ModerationPermissions } = require('../models');
const { ForbiddenError } = require('../utils/errors');

module.exports = (action, resourceType) => {
  return async (req, res, next) => {
    try {
      const { groupId } = req.params;
      const userId = req.user.userId;
      
      // Verificar se o usuário é membro do grupo
      const member = await StudyGroupMember.findOne({
        where: { groupId, userId }
      });
      
      if (!member) {
        throw new ForbiddenError('Você não é membro deste grupo');
      }
      
      // Obter permissões para o cargo
      const permissions = await ModerationPermissions.findOne({
        where: { role: member.role }
      });
      
      if (!permissions || !permissions.permissions[resourceType][action]) {
        throw new ForbiddenError('Ação não permitida para seu cargo');
      }
      
      // Verificar restrições adicionais
      if (action === 'ban') {
        const targetUserId = req.params.userId;
        const targetMember = await StudyGroupMember.findOne({
          where: { groupId, userId: targetUserId }
        });
        
        // Líderes não podem banir outros líderes
        if (targetMember.role === 'leader' && member.role !== 'admin') {
          throw new ForbiddenError('Não é permitido banir outros líderes');
        }
        
        // Não pode banir alguém com cargo superior
        const roleHierarchy = ['member', 'assistant-moderator', 'moderator', 'co-leader', 'leader'];
        if (roleHierarchy.indexOf(targetMember.role) > roleHierarchy.indexOf(member.role)) {
          throw new ForbiddenError('Não é permitido banir membros com cargo superior');
        }
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};