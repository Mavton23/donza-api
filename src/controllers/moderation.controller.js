const { 
  StudyGroupMember, 
  SharedContent, 
  DiscussionTopic,
  ModerationLog,
  User,
  ModerationAction
} = require('../models');
  const { ForbiddenError, NotFoundError } = require('../utils/errors');
  
async function getModerationTrends(groupId) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));

  // Reports por dia
  const reportsByDay = await Report.findAll({
    attributes: [
      [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
      [sequelize.fn('COUNT', sequelize.col('*')), 'count']
    ],
    where: {
      groupId,
      createdAt: { [Op.gte]: thirtyDaysAgo }
    },
    group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
    order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
    raw: true
  });

  // Ações por tipo
  const actionsByType = await ModerationLog.findAll({
    attributes: [
      'actionType',
      [sequelize.fn('COUNT', sequelize.col('*')), 'count']
    ],
    where: {
      groupId,
      createdAt: { [Op.gte]: thirtyDaysAgo }
    },
    group: ['actionType'],
    raw: true
  });

  return {
    reportsByDay,
    actionsByType
  };
}

module.exports = { 
  banMember: async (req, res, next) => {
    try {
      const { groupId, userId } = req.params;
  
      // Impede auto-banimento
      if (userId === req.user.userId) {
        throw new ForbiddenError('Você não pode se banir');
      }
  
      const targetMember = await StudyGroupMember.findOne({ 
        where: { groupId, userId } 
      });
      
      if (!targetMember) throw new NotFoundError('Membro não encontrado');
  
      // Líderes não podem banir outros líderes
      if (targetMember.role === 'leader') {
        throw new ForbiddenError('Líderes só podem ser removidos manualmente');
      }
  
      await targetMember.update({ status: 'banned' });
      res.json({ success: true, message: 'Membro banido com sucesso' });
    } catch (error) {
      next(error);
    }
  },
  
  toggleTopicStatus: async (req, res, next) => {
    try {
      const { topicId } = req.params;
      const { isClosed } = req.body;
  
      const topic = await DiscussionTopic.findByPk(topicId);
      if (!topic) throw new NotFoundError('Tópico não encontrado');
  
      await topic.update({ isClosed });
      res.json({ 
        success: true, 
        message: `Tópico ${isClosed ? 'fechado' : 'reaberto'} com sucesso` 
      });
    } catch (error) {
      next(error);
    }
  },

  // Ação de advertência
  warnMember: async (req, res, next) => {
    try {
      const { groupId, userId } = req.params;
      const { reason, severity } = req.body;
      
      // Registrar ação
      const action = await ModerationAction.create({
        actionType: 'warning',
        moderatorId: req.user.userId,
        targetUserId: userId,
        groupId,
        reason,
        severity,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });
      
      // Notificar usuário
      await NotificationService.sendWarningNotification(userId, {
        groupId,
        reason,
        moderator: req.user.username,
        actionId: action.actionId
      });
      
      res.json({ 
        success: true,
        actionId: action.actionId,
        message: 'Advertência registrada com sucesso'
      });
    } catch (error) {
      next(error);
    }
  },

  // Sistema de mute com temporizador
  muteMember: async (req, res, next) => {
    try {
      const { groupId, userId } = req.params;
      const { duration, reason } = req.body;
      
      const muteDuration = Math.min(parseInt(duration) || 1, 168); // Máximo 1 semana
      const muteUntil = new Date(Date.now() + muteDuration * 60 * 60 * 1000);
      
      await StudyGroupMember.update(
        { status: 'muted', mutedUntil: muteUntil },
        { where: { groupId, userId } }
      );
      
      // Registrar no histórico
      await ModerationLog.create({
        action: 'mute',
        moderatorId: req.user.userId,
        targetUserId: userId,
        groupId,
        duration: muteDuration,
        reason,
        status: 'active'
      });
      
      res.json({ 
        success: true,
        muteUntil,
        message: `Usuário mutado por ${muteDuration} horas`
      });
    } catch (error) {
      next(error);
    }
  },

  // Sistema de apelação
  handleAppeal: async (req, res, next) => {
    try {
      const { actionId } = req.params;
      const { decision, notes } = req.body;
      
      const action = await ModerationAction.findByPk(actionId);
      if (!action) throw new NotFoundError('Ação de moderação não encontrada');
      
      // Verificar se o moderador tem permissão
      const moderator = await StudyGroupMember.findOne({
        where: { 
          groupId: action.groupId, 
          userId: req.user.userId,
          role: ['leader', 'co-leader', 'moderator']
        }
      });
      
      if (!moderator) throw new ForbiddenError('Sem permissão para revisar esta ação');
      
      // Atualizar status
      await action.update({
        appealStatus: decision,
        appealNotes: notes,
        appealReviewedBy: req.user.userId,
        appealReviewedAt: new Date()
      });
      
      // Se decisão foi revertida, reverter ação
      if (decision === 'overturned') {
        await revertModerationAction(action);
      }
      
      res.json({ 
        success: true,
        message: `Apelação ${decision} com sucesso`
      });
    } catch (error) {
      next(error);
    }
  },

  // Sistema de análise de conteúdo
  scanContent: async (req, res, next) => {
    try {
      const { contentId, contentType } = req.params;
      
      // Obter conteúdo baseado no tipo
      let content;
      switch(contentType) {
        case 'shared':
          content = await SharedContent.findByPk(contentId);
          break;
        case 'topic':
          content = await DiscussionTopic.findByPk(contentId);
          break;
        default:
          throw new BadRequestError('Tipo de conteúdo não suportado');
      }
      
      if (!content) throw new NotFoundError('Conteúdo não encontrado');
      
      // Chamar serviço de análise (integração com API de IA)
      const scanResult = await AIService.scanContent({
        text: content.title + ' ' + content.description,
        fileUrl: content.fileUrl,
        contentType: content.fileType || contentType
      });
      
      // Salvar resultado
      const result = await ContentScanResult.create({
        contentId,
        contentType,
        scanType: 'automated',
        riskScore: scanResult.riskScore,
        flaggedCategories: scanResult.categories,
        details: scanResult.details
      });
      
      // Tomar ação automática se risco alto
      if (scanResult.riskScore > 0.8) {
        await this.takeAutomaticAction(content, result);
      }
      
      res.json({
        success: true,
        riskScore: scanResult.riskScore,
        flaggedCategories: scanResult.categories,
        actionTaken: scanResult.riskScore > 0.8
      });
    } catch (error) {
      next(error);
    }
  },

  getModerationDashboard: async (req, res, next) => {
    try {
      const { groupId } = req.params;
      
      // Verificar se o grupo existe e o usuário tem acesso
      const group = await StudyGroup.findByPk(groupId);
      if (!group) {
        throw new NotFoundError('Grupo não encontrado');
      }

      // Verificar se o usuário é moderador do grupo
      const member = await StudyGroupMember.findOne({
        where: {
          groupId,
          userId: req.user.userId,
          role: ['leader', 'co-leader', 'moderator']
        }
      });
      
      if (!member) {
        throw new ForbiddenError('Acesso não autorizado ao painel de moderação');
      }

      // Obter estatísticas
      const pendingReports = await Report.count({
        where: { 
          groupId,
          status: 'pending'
        }
      });

      const bannedMembers = await StudyGroupMember.count({
        where: { 
          groupId,
          status: 'banned'
        }
      });

      const resolvedToday = await Report.count({
        where: { 
          groupId,
          status: 'resolved',
          resolvedAt: {
            [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      });

      // Calcular tempo médio de resposta (em minutos)
      const avgResponseResult = await Report.findOne({
        attributes: [
          [sequelize.fn('AVG', sequelize.literal('EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")/60')), 'avgTime']
        ],
        where: {
          groupId,
          status: 'resolved'
        },
        raw: true
      });

      const avgResponseTime = Math.round(avgResponseResult?.avgTime || 0);

      // Obter últimos reports
      const recentReports = await Report.findAll({
        where: { groupId },
        order: [['createdAt', 'DESC']],
        limit: 5,
        include: [
          {
            model: User,
            as: 'reportedBy',
            attributes: ['userId', 'username', 'avatarUrl']
          },
          {
            model: User,
            as: 'reportedUser',
            attributes: ['userId', 'username', 'avatarUrl']
          }
        ]
      });

      // Obter últimas ações de moderação
      const recentActions = await ModerationLog.findAll({
        where: { groupId },
        order: [['createdAt', 'DESC']],
        limit: 5,
        include: [
          {
            model: User,
            as: 'moderator',
            attributes: ['userId', 'username', 'avatarUrl']
          },
          {
            model: User,
            as: 'targetUser',
            attributes: ['userId', 'username', 'avatarUrl']
          }
        ]
      });

      // Calcular "trust score" do grupo
      const totalMembers = await StudyGroupMember.count({ where: { groupId } });
      const positiveMembers = await StudyGroupMember.count({
        where: { 
          groupId,
          contributionScore: { [Op.gte]: 10 }
        }
      });

      const trustScore = totalMembers > 0 
        ? Math.round((positiveMembers / totalMembers) * 100)
        : 100;

      res.json({
        stats: {
          pendingReports,
          bannedMembers,
          resolvedToday,
          avgResponseTime,
          trustScore,
          totalMembers
        },
        recentReports,
        recentActions,
        trends: await getModerationTrends(groupId)
      });

    } catch (error) {
      next(error);
    }
  }

}