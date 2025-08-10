const { Community, CommunityMember, User, CommunityPost, StudyGroup, GroupMeeting, StudyGroupMember, Course, Enrollment } = require('../models');
const { Op, Sequelize } = require('sequelize');
const notificationService = require('./notification.service');
const { ForbiddenError, NotFoundError } = require('../utils/errors');

class CommunityService {
  // ========== RECOMENDAÇÕES PERSONALIZADAS ==========
  async recommendCommunities(userId) {
    try {
      const user = await User.findByPk(userId, {
        include: [{
          model: Course,
          as: 'coursesEnrolled',
          attributes: ['courseId']
        }]
      });

      // Comunidades relacionadas aos cursos do usuário
      const courseRelated = await Community.findAll({
        include: [{
          model: StudyGroup,
          as: 'studyGroups',
          attributes: [],
          include: [{
            model: Course,
            as: 'course',
            where: {
              courseId: {
                [Op.in]: user.coursesEnrolled.map(c => c.courseId)
              }
            },
            attributes: []
          }]
        }],
        limit: 3,
        order: Sequelize.literal('random()')
      });

      // Comunidades populares (com mais membros)
      const popular = await Community.findAll({
        attributes: {
          include: [
            [Sequelize.literal('(SELECT COUNT(*) FROM community_members WHERE community_members.communityId = Community.communityId)'), 'memberCount']
          ]
        },
        order: [[Sequelize.literal('memberCount'), 'DESC']],
        limit: 3
      });

      // Comunidades com membros similares
      const similarUsersCommunities = await Community.findAll({
        include: [{
          model: User,
          as: 'members',
          attributes: [],
          through: {
            where: {
              userId: {
                [Op.in]: Sequelize.literal(`(
                  SELECT DISTINCT cm.userId 
                  FROM community_members cm
                  WHERE cm.communityId IN (
                    SELECT communityId 
                    FROM community_members 
                    WHERE userId = '${userId}'
                  )
                  AND cm.userId != '${userId}'
                  LIMIT 10
                )`)
              }
            }
          }
        }],
        limit: 3,
        order: Sequelize.literal('random()')
      });

      // Combinar e remover duplicatas
      const allRecommendations = [...courseRelated, ...popular, ...similarUsersCommunities];
      const uniqueCommunities = [];
      const seen = new Set();

      for (const community of allRecommendations) {
        if (!seen.has(community.communityId)) {
          seen.add(community.communityId);
          uniqueCommunities.push(community);
        }
      }

      return uniqueCommunities.slice(0, 5);
    } catch (error) {
      throw error;
    }
  }

  // ========== GESTÃO DE MEMBROS ==========
  async addMemberWithRole(communityId, userId, role = 'member') {
    const [member, created] = await CommunityMember.findOrCreate({
      where: { communityId, userId },
      defaults: { role }
    });

    if (!created) {
      await member.update({ role, status: 'active' });
    }

    // Notificar o usuário
    await notificationService.createNotification({
      userId,
      type: 'community_membership',
      title: `Você foi adicionado a uma comunidade como ${role}`,
      metadata: { communityId }
    });

    return member;
  }

  async removeMember(communityId, userId, removerId) {
    const remover = await CommunityMember.findOne({
      where: { communityId, userId: removerId }
    });

    if (!remover || (remover.role !== 'admin' && removerId !== userId)) {
      throw new ForbiddenError('Sem permissão para remover membros');
    }

    const memberToRemove = await CommunityMember.findOne({
      where: { communityId, userId }
    });

    if (!memberToRemove) {
      throw new NotFoundError('Membro não encontrado');
    }

    // Admins não podem ser removidos por outros admins, apenas por si mesmos
    if (memberToRemove.role === 'admin' && removerId !== userId) {
      throw new ForbiddenError('Administradores só podem sair voluntariamente');
    }

    await memberToRemove.destroy();

    // Notificar o usuário removido
    if (removerId !== userId) {
      await notificationService.createNotification({
        userId,
        type: 'community_membership',
        title: 'Você foi removido de uma comunidade',
        metadata: { communityId }
      });
    }

    return true;
  }

  // ========== GRUPOS DE ESTUDO ==========
  async createStudyGroup(communityId, creatorId, groupData) {
    // Verificar se o criador é membro da comunidade
    const isMember = await CommunityMember.findOne({
      where: { communityId, userId: creatorId }
    });

    if (!isMember) {
      throw new ForbiddenError('Você precisa ser membro da comunidade para criar um grupo de estudo');
    }

    const group = await StudyGroup.create({
      ...groupData,
      communityId,
      creatorId
    });

    // Adicionar criador como líder do grupo
    await StudyGroupMember.create({
      groupId: group.groupId,
      userId: creatorId,
      role: 'leader'
    });

    // Notificar membros da comunidade sobre novo grupo
    const communityMembers = await CommunityMember.findAll({
      where: { communityId },
      attributes: ['userId']
    });

    await Promise.all(
      communityMembers.map(member => 
        notificationService.createNotification({
          userId: member.userId,
          type: 'new_study_group',
          title: 'Novo grupo de estudo criado na comunidade',
          metadata: { 
            communityId,
            groupId: group.groupId 
          }
        })
      )
    );

    return group;
  }

  async scheduleGroupMeeting(groupId, organizerId, meetingData) {
    // Verificar se o organizador é membro do grupo
    const organizerMembership = await StudyGroupMember.findOne({
      where: { groupId, userId: organizerId }
    });

    if (!organizerMembership) {
      throw new ForbiddenError('Você precisa ser membro do grupo para agendar reuniões');
    }

    // Verificar conflitos de horário para o grupo
    const conflictingMeetings = await GroupMeeting.findAll({
      where: {
        groupId,
        [Op.or]: [
          {
            startTime: { [Op.lt]: meetingData.endTime },
            endTime: { [Op.gt]: meetingData.startTime }
          },
          {
            startTime: { [Op.between]: [meetingData.startTime, meetingData.endTime] }
          }
        ]
      }
    });

    if (conflictingMeetings.length > 0) {
      throw new Error('Já existe uma reunião agendada para este horário');
    }

    const meeting = await GroupMeeting.create({
      ...meetingData,
      groupId,
      organizerId,
      status: 'scheduled'
    });

    // Notificar todos os membros do grupo
    const groupMembers = await StudyGroupMember.findAll({
      where: { groupId },
      include: [{
        model: User,
        attributes: ['userId', 'notificationPreferences']
      }]
    });

    await Promise.all(
      groupMembers.map(member => {
        // Verificar preferências de notificação
        if (member.User.notificationPreferences?.inApp !== false) {
          return notificationService.createNotification({
            userId: member.userId,
            type: 'group_meeting',
            title: 'Nova reunião agendada para o grupo de estudo',
            metadata: {
              groupId,
              meetingId: meeting.meetingId,
              startTime: meeting.startTime
            }
          });
        }
      })
    );

    return meeting;
  }

  // ========== ESTATÍSTICAS E ANÁLISES ==========
  async getCommunityStats(communityId) {
    const [
      memberCount,
      activeMemberCount,
      groupCount,
      meetingCount,
      postsCount,
      engagementStats
    ] = await Promise.all([
      CommunityMember.count({ where: { communityId } }),
      CommunityMember.count({ 
        where: { 
          communityId,
          lastActive: { [Op.gte]: Sequelize.literal("NOW() - INTERVAL '30 days'") }
        }
      }),
      StudyGroup.count({ where: { communityId } }),
      GroupMeeting.count({ 
        where: { 
          groupId: { 
            [Op.in]: Sequelize.literal(`(
              SELECT groupId FROM study_groups WHERE communityId = '${communityId}'
            )`)
          },
          status: 'completed'
        }
      }),
      CommunityPost.count({ where: { communityId } }),
      CommunityPost.findAll({
        attributes: [
          [Sequelize.fn('date_trunc', 'week', Sequelize.col('createdAt')), 'week'],
          [Sequelize.fn('count', '*'), 'postCount']
        ],
        where: {
          communityId,
          createdAt: { [Op.gte]: Sequelize.literal("NOW() - INTERVAL '12 weeks'") }
        },
        group: ['week'],
        order: [['week', 'ASC']],
        raw: true
      })
    ]);

    return {
      memberCount,
      activeMemberCount,
      groupCount,
      meetingCount,
      postsCount,
      engagementStats
    };
  }

  // ========== MODERAÇÃO ==========
  async transferOwnership(communityId, currentOwnerId, newOwnerId) {
    const transaction = await sequelize.transaction();
    
    try {
      // Verificar se o atual é realmente o dono
      const currentOwner = await CommunityMember.findOne({
        where: { 
          communityId, 
          userId: currentOwnerId,
          role: 'admin'
        },
        transaction
      });

      if (!currentOwner) {
        throw new ForbiddenError('Apenas o administrador pode transferir a propriedade');
      }

      // Verificar se o novo dono é membro
      const newOwnerMembership = await CommunityMember.findOne({
        where: { communityId, userId: newOwnerId },
        transaction
      });

      if (!newOwnerMembership) {
        throw new NotFoundError('Novo proprietário não é membro da comunidade');
      }

      // Atualizar roles
      await Promise.all([
        currentOwner.update({ role: 'member' }, { transaction }),
        newOwnerMembership.update({ role: 'admin' }, { transaction }),
        Community.update({ creatorId: newOwnerId }, { 
          where: { communityId },
          transaction
        })
      ]);

      await transaction.commit();

      // Notificar ambos os usuários
      await Promise.all([
        notificationService.createNotification({
          userId: newOwnerId,
          type: 'community_ownership',
          title: 'Você agora é o administrador da comunidade',
          metadata: { communityId }
        }),
        notificationService.createNotification({
          userId: currentOwnerId,
          type: 'community_ownership',
          title: 'Você transferiu a administração da comunidade',
          metadata: { communityId, newOwnerId }
        })
      ]);

      return true;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // ========== INTEGRAÇÃO COM CURSOS ==========
  async linkCourseToCommunity(communityId, courseId, userId) {
    // Verificar permissões
    const [isCommunityAdmin, isCourseInstructor] = await Promise.all([
      CommunityMember.findOne({
        where: { 
          communityId, 
          userId,
          role: 'admin' 
        }
      }),
      Course.findOne({
        where: { 
          courseId,
          instructorId: userId 
        }
      })
    ]);

    if (!isCommunityAdmin && !isCourseInstructor) {
      throw new ForbiddenError('Você precisa ser administrador ou instrutor para vincular este curso');
    }

    // Criar grupo de estudo especial para o curso
    const course = await Course.findByPk(courseId);
    const group = await StudyGroup.create({
      name: `Grupo de Estudo: ${course.title}`,
      description: `Grupo de discussão e estudo para o curso ${course.title}`,
      communityId,
      creatorId: userId,
      isCourseGroup: true,
      linkedCourseId: courseId
    });

    // Adicionar todos os alunos matriculados no curso ao grupo
    const enrollments = await Enrollment.findAll({
      where: { courseId },
      attributes: ['userId']
    });

    await Promise.all(
      enrollments.map(enrollment => 
        StudyGroupMember.create({
          groupId: group.groupId,
          userId: enrollment.userId,
          role: 'member'
        })
      )
    );

    return group;
  }
}

module.exports = new CommunityService();