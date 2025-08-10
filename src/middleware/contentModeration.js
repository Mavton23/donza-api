const { StudyGroupMember } = require('../models');

module.exports = (options = {}) => {
    return async (req, res, next) => {
      const { groupId } = req.params;
      const member = await StudyGroupMember.findOne({
        where: { 
          groupId, 
          userId: req.user.userId,
          status: 'active'
        }
      });
  
      // Verifica se é moderador ou dono do conteúdo
      let isAllowed = member?.role === 'leader' || member?.role === 'co-leader';
      
      if (options.allowOwner) {
        const content = await options.model.findByPk(req.params.contentId || req.params.topicId);
        isAllowed = isAllowed || content?.authorId === req.user.userId;
      }
  
      if (!isAllowed) throw new ForbiddenError('Ação não permitida');
      next();
    };
  };