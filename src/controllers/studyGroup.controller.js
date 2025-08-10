const { User, Community, CommunityMember, StudyGroup, StudyGroupMember, StudyGroupPendingMember , GroupMeeting, GroupTask, TaskAssignment, SharedContent } = require('../models');
const { BadRequestError, NotFoundError, ForbiddenError, ConflictError } = require('../utils/errors');
const notificationService = require('../services/notification.service');
const { Op } = require('sequelize');
const { sequelize } = require('../configs/db')
const crypto = require('crypto');

// Helper para calcular datas com base no período
function getDateThreshold(period) {
  const now = new Date();
  switch (period) {
    case '7d': return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case '30d': return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case '90d': return new Date(now - 90 * 24 * 60 * 60 * 1000);
    default: return new Date(now - 30 * 24 * 60 * 60 * 1000);
  }
}

// Helper para dados de atividade
async function getActivityData(groupId, sinceDate, transaction) {
  return await StudyGroupMember.findAll({
    attributes: [
      [sequelize.fn('DATE', sequelize.col('lastActiveAt')), 'date'],
      [sequelize.fn('COUNT', sequelize.col('userId')), 'activeUsers']
    ],
    where: { 
      groupId,
      lastActiveAt: { [Op.gte]: sinceDate }
    },
    group: ['date'],
    order: [['date', 'ASC']],
    raw: true,
    transaction
  });
}

// Helper para estatísticas de gamificação do usuário
async function getUserGamificationStats(groupId, userId, transaction) {
  // Busca o membro no grupo
  const member = await StudyGroupMember.findOne({
    where: { groupId, userId },
    transaction
  });

  if (!member) return null;

  // Calcula métricas específicas
  const [completedTasks, contributedContent] = await Promise.all([
    GroupTask.count({
      where: { 
        groupId,
        status: 'completed'
      },
      include: [{
        model: TaskAssignment,
        as: 'assignments',
        attributes: [],
        where: { userId },
        required: true
      }],
      transaction
    }),
    SharedContent.count({
      where: { 
        groupId,
        uploaderId: userId 
      },
      transaction
    })
  ]);

  // Níveis e progresso
  const points = member.contributionScore || 0;
  const level = Math.floor(points / 100) + 1;
  const currentLevelProgress = points % 100;

  return {
    username: member.User?.username,
    avatarUrl: member.User?.avatarUrl,
    level,
    points,
    currentLevelProgress,
    nextLevelThreshold: level * 100,
    completedTasks,
    contributedContent,
    helpfulReplies: member.achievements?.filter(a => a.includes('helpful_reply')).length || 0,
    recentAchievements: member.achievements?.slice(0, 3) || []
  };
}

module.exports = {

  /**
 * Obtém detalhes de um grupo de estudo específico (versão corrigida)
 */
getStudyGroupDetails: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  const weekperiod = '7d'
  const monthperiod = '30d'


  try {
    const { communityId, groupId } = req.params;
    const { userId } = req.user;
    console.log("USERID: ", userId);

    // Primeiro busca o grupo básico
    const group = await StudyGroup.findOne({
      where: { groupId, communityId },
      include: [{
        model: User,
        as: 'creator',
        attributes: ['userId', 'username', 'avatarUrl']
      }],
      transaction
    });

    if (!group) {
      await transaction.rollback();
      throw new NotFoundError('Grupo de estudo não encontrado');
    }

    // Depois busca os membros separadamente
    const members = await StudyGroupMember.findAll({
      where: { groupId },
      include: [{
        model: User,
        as: 'user',
        attributes: ['userId', 'username', 'avatarUrl']
      }],
      transaction
    });

    // Contagem de membros
    const membersCount = await StudyGroupMember.count({
      where: { groupId },
      transaction
    });

      const dateThreshold = getDateThreshold(monthperiod);

      // Membros ativos (último período)
      const activeMembersReports = await StudyGroupMember.count({
        where: { 
          groupId,
          lastActiveAt: { [Op.gte]: dateThreshold }
        },
        transaction
      });

      // Tarefas concluídas
      const completedTasks = await GroupTask.count({
        where: { 
          groupId,
          status: 'completed',
        },
        transaction
      });

      // Novos conteúdos compartilhados
      const newContent = await SharedContent.count({
        where: { 
          groupId,
          createdAt: { [Op.gte]: dateThreshold }
        },
        transaction
      });

      // Taxa de engajamento
      const totalMembers = membersCount;
      const engagedMembers = await StudyGroupMember.count({
        where: {
          groupId,
          [Op.or]: [
            { lastActiveAt: { [Op.gte]: dateThreshold } },
            { contributionScore: { [Op.gt]: 0 } }
          ]
        },
        transaction
      });
      const engagementRate = totalMembers > 0 
        ? Math.round((engagedMembers / totalMembers) * 100) 
        : 0;

      // Dados para gráficos
      const activityData = await getActivityData(groupId, dateThreshold, transaction);
      const tasks = await GroupTask.findAll({
        where: { groupId },
        order: [['createdAt', 'ASC']],
        transaction
      });

      reportsData = {
        activeMembersReports,
        completedTasks,
        newContent,
        engagementRate,
        activityData,
        tasks
      };

    // (STATS) 
    // Total de reuniões
      const meetingCount = await GroupMeeting.count({
        where: { groupId },
        transaction
      });

    // (GAMIFICATION
    // Busca membros com dados de gamificação (ordenados por pontuação)
      const membersWithStats = await StudyGroupMember.findAll({
        where: { groupId },
        include: [{
          model: User,
          as: 'user',
          attributes: ['userId', 'username', 'avatarUrl']
        }],
        order: [['contributionScore', 'DESC']],
        transaction
      });

      // Calcula estatísticas do usuário atual
      const currentUserStats = await getUserGamificationStats(
        groupId, 
        userId, 
        transaction
      );

      gamificationData = {
        members: membersWithStats.map(member => ({
          userId: member.user.userId,
          username: member.user.username,
          avatarUrl: member.user.avatarUrl,
          points: member.contributionScore || 0,
          role: member.role,
          completedTasks: member.achievements?.filter(a => a.includes('task_')).length || 0,
          lastActiveAt: member.lastActiveAt
        })),
        gamificationUser: currentUserStats
      };

      // Atividade dos membros (últimos 30 dias)
      const activeMembers = await StudyGroupMember.count({
        where: { 
          groupId,
          lastActiveAt: { 
            [Op.gte]: getDateThreshold(monthperiod)
          }
        },
        transaction
      });

      // Média de participação em reuniões
      const completedMeetings = await GroupMeeting.findAll({
        where: { 
          groupId,
          status: 'completed' 
        },
        attributes: ['meetingId'],
        transaction
      });

      const meetingIds = completedMeetings.map(m => m.meetingId);

      let avgAttendance = 0;

      if (meetingIds.length > 0) {
        const participantCounts = await MeetingParticipant.findAll({
          where: {
            meetingId: meetingIds
          },
          attributes: ['meetingId', [sequelize.fn('COUNT', sequelize.col('userId')), 'count']],
          group: ['meetingId'],
          raw: true,
          transaction
        });

        const total = participantCounts.reduce((acc, p) => acc + parseInt(p.count), 0);
        avgAttendance = total / meetingIds.length;
      }

      statsData = {
        meetingCount,
        activeMembers,
        avgAttendance
      };

    await transaction.commit();

    // Formata a resposta
    const response = {
      groupId: group.groupId,
      name: group.name,
      description: group.description,
      meetingSchedule: group.meetingSchedule,
      maxMembers: group.maxMembers,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      communityId: group.communityId,
      creator: {
        userId: group.creator.userId,
        username: group.creator.username,
        avatarUrl: group.creator.avatarUrl
      },
      membersCount,
      members: members.map(member => ({
        userId: member.user.userId,
        username: member.user.username,
        avatarUrl: member.user.avatarUrl,
        role: member.role,
        joinedAt: member.joinedAt
      })),
      ...statsData,
      ...gamificationData,
      ...{stats : reportsData}
    };

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.log("ERROR IN getStudyGroupDetails: ", error instanceof Error ? error.message : error);
    await transaction.rollback();
    next(error);
  }
},

/**
 * Obtém informações de membership do usuário atual no grupo
 */
getUserMembership: async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.userId;

    const membership = await StudyGroupMember.findOne({
      where: { groupId, userId },
      include: [
        {
          model: StudyGroup,
          attributes: ['groupId', 'name', 'communityId', 'maxMembers']
        }
      ]
    });

    if (!membership) {
      return res.json({
        success: true,
        data: null
      });
    }

    // Formata a resposta
    const response = {
      membershipId: membership.membershipId,
      groupId: membership.groupId,
      userId: membership.userId,
      role: membership.role,
      joinedAt: membership.joinedAt,
      contributionScore: membership.contributionScore,
      group: {
        groupId: membership.StudyGroup.groupId,
        name: membership.StudyGroup.name,
        communityId: membership.StudyGroup.communityId
      }
    };

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    next(error);
  }
},

/**
 * @typedef {Object} StudyGroupResponse
 * @property {string} groupId - ID do grupo
 * @property {string} name - Nome do grupo
 * @property {string} description - Descrição do grupo
 * @property {number} maxMembers - Número máximo de membros
 * @property {number} membersCount - Número atual de membros
 * @property {string} communityId - ID da comunidade
 * @property {string} creatorId - ID do criador
 * @property {Date} createdAt - Data de criação
 * @property {Date} updatedAt - Data de atualização
 */

/**
 * Cria um novo grupo de estudo na comunidade
 * @param {Object} req - Requisição HTTP
 * @param {Object} req.params - Parâmetros da rota
 * @param {string} req.params.communityId - ID da comunidade
 * @param {Object} req.body - Dados do grupo
 * @param {string} req.body.name - Nome do grupo
 * @param {string} req.body.description - Descrição do grupo
 * @param {number} req.body.maxMembers - Número máximo de membros
 * @param {Object} req.user - Usuário autenticado
 * @param {string} req.user.userId - ID do usuário
 * @param {Object} res - Resposta HTTP
 * @param {Function} next - Próximo middleware
 * @returns {Promise<StudyGroupResponse>}
 */
createStudyGroup: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { communityId } = req.params;
    const { 
      name, 
      description, 
      maxMembers,
      tags,
      meetingSchedule,
      privacy = 'public',
      approvalRequired = false,
      coverImageUrl = null
    } = req.body;

    // Verifica se é membro ativo da comunidade
    const isMember = await CommunityMember.findOne({
      where: {
        communityId,
        userId: req.user.userId,
        status: 'active'
      },
      transaction
    });

    if (!isMember) {
      throw new ForbiddenError('Você precisa ser membro ativo da comunidade');
    }

    // Validação do tipo de privacidade
    const validPrivacyOptions = ['public', 'private', 'invite_only'];
    if (!validPrivacyOptions.includes(privacy)) {
      throw new BadRequestError('Tipo de privacidade inválido');
    }

    // Configuração automática para grupos privados/invite_only
    const finalApprovalRequired = privacy !== 'public' ? true : approvalRequired;
    const inviteCode = privacy !== 'public' 
      ? crypto.randomBytes(8).toString('hex') 
      : null;

    // Cria o grupo
    const group = await StudyGroup.create({
      name,
      description,
      maxMembers: maxMembers || null,
      communityId,
      creatorId: req.user.userId,
      tags: tags || [],
      meetingSchedule: meetingSchedule || null,
      privacy,
      approvalRequired: finalApprovalRequired,
      inviteCode,
      coverImageUrl,
      status: 'active'
    }, { transaction });

    // Adiciona criador como líder
    await StudyGroupMember.create({
      groupId: group.groupId,
      userId: req.user.userId,
      role: 'leader',
      joinMethod: 'direct',
      lastActiveAt: new Date()
    }, { transaction });

    // Se for grupo por convite, cria um convite padrão para o criador
    if (privacy === 'invite_only') {
      await StudyGroupPendingMember.create({
        groupId: group.groupId,
        userId: req.user.userId,
        status: 'approved',
        requestedAt: new Date(),
        reviewedAt: new Date(),
        reviewedBy: req.user.userId,
        responseMessage: 'Convite automático para o líder',
        inviteCode
      }, { transaction });
    }

    // Notifica comunidade sobre novo grupo (se for público)
    if (privacy === 'public') {
      // await notificationService.notifyCommunityMembers(
      //   communityId,
      //   'NEW_STUDY_GROUP',
      //   {
      //     groupId: group.groupId,
      //     creatorId: req.user.userId,
      //     communityId
      //   },
      //   transaction
      // );
    }

    await transaction.commit();

    res.status(201).json({
      success: true,
      data: {
        ...group.toJSON(),
        membersCount: 1,
        isCreator: true
      }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

/**
 * Obtém grupos de estudo de uma comunidade com paginação
 * @param {Object} req - Requisição HTTP
 * @param {Object} req.params - Parâmetros da rota
 * @param {string} req.params.communityId - ID da comunidade
 * @param {Object} req.query - Query parameters
 * @param {number} [req.query.limit=10] - Limite de resultados
 * @param {number} [req.query.offset=0] - Offset para paginação
 * @param {Object} res - Resposta HTTP
 * @param {Function} next - Próximo middleware
 * @returns {Promise<StudyGroupResponse[]>}
 */
getCommunityGroups: async (req, res, next) => {
  try {
    const { communityId } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    // Verifica se a comunidade existe
    const communityExists = await Community.findByPk(communityId);
    if (!communityExists) {
      throw new NotFoundError('Comunidade não encontrada');
    }

    // Se comunidade privada, verifica se é membro
    if (!communityExists.isPublic) {
      const isMember = await CommunityMember.findOne({
        where: {
          communityId,
          userId: req.user?.userId,
          status: 'active'
        }
      });

      if (!isMember) {
        throw new ForbiddenError('Acesso restrito a membros da comunidade');
      }
    }

    // Primeiro buscamos os grupos
    const groups = await StudyGroup.findAll({
      where: { communityId },
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['userId', 'username', 'avatarUrl']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Depois buscamos a contagem de membros para cada grupo
    const groupsWithMembers = await Promise.all(groups.map(async group => {
      const membersCount = await StudyGroupMember.count({
        where: {
          groupId: group.groupId,
          status: 'active'
        }
      });

      return {
        ...group.get({ plain: true }),
        membersCount
      };
    }));

    // Contagem total de grupos (para paginação)
    const total = await StudyGroup.count({
      where: { communityId }
    });

    res.json({
      success: true,
      data: {
        groups: groupsWithMembers,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    next(error);
  }
},

/**
 * Atualizar o grupo
 */
updateGroup: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { groupId } = req.params;
    const { userId } = req.user;
    const { name, description, maxMembers } = req.body;
    const changes = req.body;

    const group = await StudyGroup.findByPk(groupId, { transaction });
    if (!group) {
      await transaction.rollback();
      throw new NotFoundError('Grupo não encontrado');
    }

    // Atualiza apenas campos fornecidos
    if (name) group.name = name;
    if (description) group.description = description;
    if (maxMembers) group.maxMembers = maxMembers;

    await group.save({ transaction });

    // Notificação para todos os membros
    await notificationService.notifyGroupUpdate(
      groupId,
      userId,
      changes
    );

    await transaction.commit();

    res.json({
      success: true,
      data: group
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

/**
 * Deletar grupo
 */
deleteGroup: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { groupId } = req.params;
    const { userId } = req.user;

    const group = await StudyGroup.findByPk(groupId, { transaction });
    if (!group) {
      await transaction.rollback();
      throw new NotFoundError('Grupo não encontrado');
    }

    // Verifica se o grupo está vazio (opcional)
    const memberCount = await StudyGroupMember.count({ 
      where: { groupId },
      transaction
    });

    if (memberCount > 1) {
      await transaction.rollback();
      throw new ConflictError('Transfira a liderança antes de deletar o grupo');
    }

    await group.destroy({ transaction });

    // Notificação para todos os membros
    await notificationService.notifyGroupDeletion(
      groupId,
      userId
    );

    await transaction.commit();

    res.json({
      success: true,
      message: 'Grupo deletado com sucesso'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},


// ------- --------- - GESTAO DE MEMBROS - -------------- ----------
getActiveMembers: async (req, res, next) => {
  const { communityId, groupId } = req.params;

  try {
    const members = StudyGroupMember.findAll({ 
      where: {
        groupId,
        status: 'active'
      },
      include: [{ 
        model: User, 
        as: 'user',
        attributes: ['userId', 'username', 'avatarUrl'] }] 
    })

    res.json({
      success: true,
      data: members
    });

  } catch (error) {
    console.log("ERROR GETTING MEMBERS: ", error instanceof Error ? error.message : error);
    next(error)
  }
},

addMember: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { groupId } = req.params;
    const { userId, role = 'member' } = req.body;

    // Verifica se o grupo existe e tem vaga
    const group = await StudyGroup.findByPk(groupId, { transaction });
    if (!group) throw new NotFoundError('Grupo não encontrado');

    if (group.maxMembers) {
      const currentMembers = await StudyGroupMember.count({ where: { groupId }, transaction });
      if (currentMembers >= group.maxMembers) {
        throw new ConflictError('Limite de membros atingido');
      }
    }

    // Verifica se o usuário é membro da comunidade
    const isCommunityMember = await CommunityMember.findOne({
      where: { communityId: group.communityId, userId },
      transaction
    });
    if (!isCommunityMember) {
      throw new ForbiddenError('O usuário não é membro da comunidade');
    }

    // Adiciona ao grupo
    await StudyGroupMember.create({ groupId, userId, role }, { transaction });

    // Dentro do método addMember:
    // await notificationService.notifyUser(
    //   userId,
    //   'NEW_MEMBER',
    //   `Você foi adicionado ao grupo "${group.name}"`,
    //   { groupId }
    // );

    // // Notifica o grupo sobre o novo membro (exceto o próprio usuário)
    // await notificationService.notifyGroupMembers(
    //   groupId,
    //   'NEW_MEMBER',
    //   `Novo membro: ${user.username} entrou no grupo!`,
    //   { userId },
    //   userId
    // );
    
    await transaction.commit();

    res.status(201).json({
      success: true,
      message: 'Membro adicionado com sucesso'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

removeMember: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { groupId, userId } = req.params;
    const removerId = req.user.userId;

    // Verifica se o alvo é membro
    const targetMember = await StudyGroupMember.findOne({ 
      where: { groupId, userId },
      transaction
    });
    if (!targetMember) throw new NotFoundError('Membro não encontrado');

    // Verifica permissões do remetente
    const remover = await StudyGroupMember.findOne({
      where: { groupId, userId: removerId },
      transaction
    });

    if (targetMember.role === 'leader') {
      throw new ForbiddenError('Líderes só podem ser removidos por si mesmos');
    }

    if (remover.role !== 'leader' && targetMember.role === 'co-leader') {
      throw new ForbiddenError('Co-líderes não podem remover outros co-líderes');
    }

    await targetMember.destroy({ transaction });
    await transaction.commit();

    res.json({
      success: true,
      message: 'Membro removido com sucesso'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

updateMemberRole: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { groupId, userId } = req.params;
    const { role } = req.body;

    // Valida a nova role
    if (!['member', 'co-leader'].includes(role)) {
      throw new BadRequestError('Role inválida');
    }

    // Busca o membro alvo
    const member = await StudyGroupMember.findOne({ 
      where: { groupId, userId },
      transaction
    });
    if (!member) throw new NotFoundError('Membro não encontrado');

    // Apenas líderes podem alterar roles
    const requester = await StudyGroupMember.findOne({
      where: { groupId, userId: req.user.userId },
      transaction
    });
    if (requester.role !== 'leader') {
      throw new ForbiddenError('Apenas líderes podem alterar roles');
    }

    member.role = role;
    await member.save({ transaction });

    await notificationService.notifyRoleChange(userId, groupId, role)

    await transaction.commit();

    res.json({
      success: true,
      message: 'Role atualizada com sucesso'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

/**
 * Entrar diretamente em grupo público
 * POST /study-groups/:groupId/join
 */
joinPublicGroup: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { groupId } = req.params;
    const userId = req.user.userId;

    // Verifica se o grupo existe e obtém informações de privacidade
    const group = await StudyGroup.findOne({
      where: { groupId },
      transaction
    });

    if (!group) {
      await transaction.rollback();
      throw new NotFoundError('Grupo não encontrado');
    }

    // Verifica se o grupo é público
    if (group.privacy !== 'public') {
      await transaction.rollback();
      throw new BadRequestError('Este grupo não é público. Solicite participação através do endpoint apropriado.');
    }

    // Verifica se o usuário já é membro
    const isMember = await StudyGroupMember.findOne({
      where: { groupId, userId },
      transaction
    });

    if (isMember) {
      await transaction.rollback();
      throw new ConflictError('Você já é membro deste grupo');
    }

    // Verifica se o grupo está cheio
    if (group.maxMembers) {
      const memberCount = await StudyGroupMember.count({
        where: { groupId },
        transaction
      });

      if (memberCount >= group.maxMembers) {
        await transaction.rollback();
        throw new BadRequestError('Este grupo atingiu o número máximo de membros');
      }
    }

    // Adiciona o usuário como membro
    await StudyGroupMember.create({
      groupId,
      userId,
      role: 'member',
      joinedAt: new Date(),
      joinMethod: 'direct'
    }, { transaction });

    // TO DO: Registrar atividade ou notificação
    // await createGroupActivity(...);

    await transaction.commit();

    res.status(200).json({
      success: true,
      message: 'Você entrou no grupo com sucesso',
      data: {
        groupId,
        membership: {
          role: 'member',
          joinedAt: new Date()
        }
      }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

/**
   * Solicitar entrada em grupo privado
   * POST /study-groups/:groupId/join-request
   */
requestToJoinGroup: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { groupId } = req.params;
    const { userId } = req.user;
    const { message } = req.body;

    // Verifica se o grupo existe e é privado
    const group = await StudyGroup.findOne({
      where: { groupId },
      transaction
    });

    if (!group) {
      await transaction.rollback();
      throw new NotFoundError('Grupo não encontrado');
    }

    if (group.privacy === 'public') {
      await transaction.rollback();
      throw new BadRequestError('Este grupo é público, não requer aprovação');
    }

    // Verifica se o usuário já é membro
    const isMember = await StudyGroupMember.findOne({
      where: { groupId, userId },
      transaction
    });

    if (isMember) {
      await transaction.rollback();
      throw new ConflictError('Você já é membro deste grupo');
    }

    // Verifica se já existe solicitação pendente
    const existingRequest = await StudyGroupPendingMember.findOne({
      where: { 
        groupId, 
        userId,
        status: 'pending'
      },
      transaction
    });

    if (existingRequest) {
      await transaction.rollback();
      throw new ConflictError('Você já tem uma solicitação pendente para este grupo');
    }

    // Cria a solicitação
    await StudyGroupPendingMember.create({
      groupId,
      userId,
      message: message || null,
      status: 'pending',
      requestedAt: new Date()
    }, { transaction });

    await notificationService.notifyJoinRequest(userId, groupId)

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: 'Solicitação de entrada enviada com sucesso'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

/**
 * Listar membros pendentes (para líderes)
 * GET /study-groups/:groupId/pending-members
 */
getPendingMembers: async (req, res, next) => {
  try {
    const { groupId } = req.params;

    // Verificação simplificada de permissão
    const isLeader = await StudyGroupMember.findOne({
      where: {
        groupId,
        userId: req.user.userId,
        role: ['leader', 'co-leader', 'moderator'],
        status: 'active'
      },
      raw: true
    });

    if (!isLeader) {
      throw new ForbiddenError('Apenas líderes podem ver membros pendentes');
    }

    // Consulta segura com associações explícitas
    const pendingMembers = await StudyGroupPendingMember.findAll({
      where: { 
        groupId,
        status: 'pending'
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['userId', 'username', 'avatarUrl', 'email']
      }],
      order: [['requestedAt', 'ASC']]
    });

    res.json({
      success: true,
      data: pendingMembers.map(member => ({
        requestId: member.requestId,
        userId: member.user.userId,
        username: member.user.username,
        avatarUrl: member.user.avatarUrl,
        email: member.user.email,
        message: member.message,
        requestedAt: member.requestedAt
      }))
    });
  } catch (error) {
    console.error("Error details:", error instanceof Error ? error.message : error);
    next(error);
  }
},

/**
 * Aprovar membro
 * PATCH /study-groups/:groupId/members/:userId/approve
 */
approveMember: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { groupId, userId } = req.params;
    const reviewerId = req.user.userId;
    const { responseMessage } = req.body;

    // Verifica se a solicitação existe
    const request = await StudyGroupPendingMember.findOne({
      where: { 
        groupId, 
        userId,
        status: 'pending'
      },
      transaction
    });

    if (!request) {
      await transaction.rollback();
      throw new NotFoundError('Solicitação não encontrada ou já processada');
    }

    // Verifica se o usuário já é membro
    const isAlreadyMember = await StudyGroupMember.findOne({
      where: { groupId, userId },
      transaction
    });

    if (isAlreadyMember) {
      await StudyGroupPendingMember.update({
        status: 'approved',
        reviewedAt: new Date(),
        reviewedBy: reviewerId,
        responseMessage: 'Aprovado automaticamente (já era membro)'
      }, { 
        where: { requestId: request.requestId },
        transaction
      });

      await transaction.commit();
      return res.json({
        success: true,
        message: 'Usuário já era membro do grupo'
      });
    }

    // Adiciona o usuário como membro
    await StudyGroupMember.create({
      groupId,
      userId,
      role: 'member',
      joinMethod: 'approval'
    }, { transaction });

    // Atualiza a solicitação como aprovada
    await StudyGroupPendingMember.update({
      status: 'approved',
      reviewedAt: new Date(),
      reviewedBy: reviewerId,
      responseMessage
    }, { 
      where: { requestId: request.requestId },
      transaction
    });

    // Atualiza a contagem de membros no grupo
    await StudyGroup.increment('membersCount', {
      where: { groupId },
      transaction
    });

    await transaction.commit();

    res.json({
      success: true,
      message: 'Membro aprovado com sucesso'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

/**
 * Rejeitar membro
 * PATCH /study-groups/:groupId/members/:userId/reject
 */
rejectMember: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { groupId, userId } = req.params;
    const reviewerId = req.user.userId;
    const { responseMessage } = req.body;

    // Verifica se a solicitação existe
    const request = await StudyGroupPendingMember.findOne({
      where: { 
        groupId, 
        userId,
        status: 'pending'
      },
      transaction
    });

    if (!request) {
      await transaction.rollback();
      throw new NotFoundError('Solicitação não encontrada ou já processada');
    }

    // Atualiza a solicitação como rejeitada
    await StudyGroupPendingMember.update({
      status: 'rejected',
      reviewedAt: new Date(),
      reviewedBy: reviewerId,
      responseMessage
    }, { 
      where: { requestId: request.requestId },
      transaction
    });

    await transaction.commit();

    res.json({
      success: true,
      message: 'Solicitação rejeitada com sucesso'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

inviteUserToGroup: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { groupId } = req.params;
    const { userIds } = req.body;
    const inviterId = req.user.userId;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      await transaction.rollback();
      throw new BadRequestError('Informe um array de user IDs válido');
    }

    for (const userId of userIds) {
      const group = await StudyGroup.findOne({
        where: { groupId },
        transaction
      });

      if (!group) {
        await transaction.rollback();
        throw new NotFoundError('Grupo não encontrado');
      }

      if (group.privacy !== 'private' && group.privacy !== 'invite_only') {
        await transaction.rollback();
        throw new BadRequestError('Este grupo não requer convites para entrada');
      }

      const userToInvite = await User.findOne({
        where: { userId },
        transaction
      });

      if (!userToInvite) {
        await transaction.rollback();
        throw new NotFoundError(`Usuário com ID ${userId} não encontrado`);
      }

      // Verifica se o usuário já é membro
      const isMember = await StudyGroupMember.findOne({
        where: { groupId, userId },
        transaction
      });

      if (isMember) {
        await transaction.rollback();
        throw new ConflictError(`O usuário ${userId} já é membro do grupo`);
      }

      // Verifica se já existe convite pendente
      const existingInvite = await StudyGroupPendingMember.findOne({
        where: { 
          groupId, 
          userId,
          status: 'pending'
        },
        transaction
      });

      if (existingInvite) {
        await transaction.rollback();
        throw new ConflictError(`Já existe um convite pendente para o usuário ${userId}`);
      }

      // Cria um código de convite único
      const inviteCode = crypto.randomBytes(8).toString('hex');

      // Cria o convite
      await StudyGroupPendingMember.create({
        groupId,
        userId,
        status: 'approved',
        requestedAt: new Date(),
        reviewedAt: new Date(),
        reviewedBy: inviterId,
        responseMessage: 'Convite direto',
        inviteCode
      }, { transaction });
    }

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: 'Convites enviados com sucesso',
      data: {
        invitedCount: userIds.length
      }
    });
  } catch (error) {
    console.log("ERROR SENDING INVITE: ", error instanceof Error ? error.message : error);
    await transaction.rollback();
    next(error);
  }
},

/**
 * Verificar código de convite
 * GET /study-groups/:groupId/invite/:code
 */
verifyInviteCode: async (req, res, next) => {
  try {
    const { groupId, code } = req.params;

    // Verifica se o convite existe e é válido
    const invite = await StudyGroupPendingMember.findOne({
      where: { 
        groupId,
        inviteCode: code,
        status: 'approved'
      },
      include: [
        {
          model: StudyGroup,
          attributes: ['groupId', 'name', 'description', 'privacy']
        },
        {
          model: User,
          as: 'reviewer',
          attributes: ['userId', 'username']
        }
      ]
    });

    if (!invite) {
      throw new NotFoundError('Convite inválido ou expirado');
    }

    res.json({
      success: true,
      data: {
        groupId: invite.StudyGroup.groupId,
        groupName: invite.StudyGroup.name,
        groupDescription: invite.StudyGroup.description,
        invitedBy: invite.reviewer ? {
          userId: invite.reviewer.userId,
          username: invite.reviewer.username
        } : null,
        createdAt: invite.requestedAt
      }
    });
  } catch (error) {
    next(error);
  }
},


  // ========== MIDDLEWARE ==========
  verifyGroupMember: async (req, res, next) => {
    const { groupId } = req.params;
    const { userId } = req.user;

    try {
      const isMember = await StudyGroupMember.findOne({
        where: {
          groupId: groupId,
          userId: userId
        }
      });

      if (!isMember) {
        throw new ForbiddenError('Acesso restrito a membros do grupo');
      }

      req.groupMember = isMember;
      next();
    } catch (error) {
      next(error);
    }
  },

  // ========== REUNIÕES ==========
  getGroupMeetings: async (req, res, next) => {
    try {
      const { groupId } = req.params;
      const { limit = 10, offset = 0 } = req.query;

      const meetings = await GroupMeeting.findAll({
        where: { groupId },
        order: [['startTime', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json(meetings);
    } catch (error) {
      next(error);
    }
  },

  scheduleMeeting: async (req, res, next) => {
    
    const transaction = await sequelize.transaction();
    
    try {

      const { groupId } = req.params;
      const { title, description, startTime, endTime, meetingUrl } = req.body;

      // Verifica se é líder/co-líder
      if (!['leader', 'co-leader'].includes(req.groupMember.role)) {
        throw new ForbiddenError('Somente líderes podem agendar reuniões');
      }

      const meeting = await GroupMeeting.create({
        title,
        description,
        startTime,
        endTime,
        meetingUrl,
        groupId,
        organizerId: req.user.userId
      }, { transaction });

      // Notifica todos os membros
      await notificationService.notifyMeetingScheduled(
        meeting.meetingId
      );

      await transaction.commit();


      res.status(201).json({
        success: true,
        data: meeting
      });
    } catch (error) {
      await transaction.rollback();
      console.log("ERROR: ", error instanceof Error ? error.message : error);
      next(error);
    }
  }
};