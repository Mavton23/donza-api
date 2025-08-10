const { 
  User, 
  Notification, 
  Submission,
  Assignment, 
  Event, 
  Course, 
  Enrollment, 
  Lesson, 
  Module, 
  StudyGroupMember, 
  Achievement, 
  PostComment, 
  StudyGroup 
} = require('../models');
const emailService = require('./email.service');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
const { sequelize } = require('../configs/db');

class NotificationService {
  constructor() {
    this.notificationTypes = {
      USER_REVIEW_REQUIRED: {
        key: 'adminReviews',
        defaultEmail: true,
        defaultInApp: true,
        priority: 'high',
        audience: 'admin'
      },
      USER_APPROVED: {
        key: 'accountUpdates',
        defaultEmail: true,
        defaultInApp: true,
        priority: 'normal'
      },
      USER_REJECTED: {
        key: 'accountUpdates',
        defaultEmail: true,
        defaultInApp: true,
        priority: 'high'
      },
      EVENT_REMINDER: {
        key: 'eventReminders',
        defaultEmail: true,
        defaultInApp: true,
        priority: 'high'
      },
      EVENT_CREATED: {
        key: 'eventCreated',
        defaultEmail: true,
        defaultInApp: true,
        priority: 'high'
      },
      EVENT_UPDATED: {
        key: 'eventUpdated',
        defaultEmail: true,
        defaultInApp: true,
        priority: 'normal'
      },
      EVENT_DELETED: {
        key: 'eventDeleted',
        defaultEmail: true,
        defaultInApp: true,
        priority: 'high'
      },
      EVENT_REGISTRATION: {
        key: 'eventRegistration',
        defaultEmail: true,
        defaultInApp: true,
        priority: 'normal'
      },
      EVENT_REGISTRATION_CANCELLED: {
        key: 'eventRegistrationCancelled',
        defaultEmail: true,
        defaultInApp: true,
        priority: 'normal'
      },
      TASK_DEADLINE: {
        key: 'taskDeadlines',
        defaultEmail: true,
        defaultInApp: true,
        priority: 'high'
      },
      COURSE_UPDATE: {
        key: 'courseUpdates',
        defaultEmail: false,
        defaultInApp: true,
        priority: 'normal'
      },
      NEW_MESSAGE: {
        key: 'newMessages',
        defaultEmail: true,
        defaultInApp: true,
        priority: 'normal'
      },
    REVIEW_REPLY: {
      key: 'reviewReplies',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal'
    },
    SYSTEM_ALERT: {
      key: 'systemAlerts',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high'
    },
    NEW_FOLLOWER: {
      key: 'newFollowers',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (follower) => `${follower.username} começou a te acompanhar`
    },
    // NEW_INVITE_INSTITUTION: {
    //   key: 'newInvites',
    //   defaultEmail: true,
    //   defaultInApp: true,
    //   priority: 'normal',
    //   template: (follower) => `${follower.username} começou a te acompanhar`
    // },
    // RESPOND_INVITE_INSTITUTION: {
    //   key: 'respondInvites',
    //   defaultEmail: true,
    //   defaultInApp: true,
    //   priority: 'normal',
    //   template: (follower) => `${follower.username} começou a te acompanhar`
    // },
    FOLLOWING_UPDATE: {
      key: 'followingUpdates',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'low',
      template: (user) => `Você começou a acompanhar ${user.username}`
    },
    UNFOLLOWED: {
      key: 'unfollowed',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'low',
      template: (user) => `${user.username} deixou de te acompanhar`
    },
    LESSON_CREATED: {
      key: 'lessonCreated',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'normal',
      template: (course, lesson) => `Nova lição disponível: "${lesson.title}" no curso "${course.title}"`
    },
    LESSON_UPDATED: {
      key: 'lessonUpdated',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'normal',
      template: (course, lesson) => `Lição atualizada: "${lesson.title}" no curso "${course.title}"`
    },
    LESSON_DELETED: {
      key: 'lessonDeleted',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high',
      template: (course, lessonTitle) => `Lição removida: "${lessonTitle}" do curso "${course.title}"`
    },
    LESSON_COMPLETED: {
      key: 'lessonCompleted',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (lesson) => `Você completou a lição "${lesson.title}"!`
    },
    LESSON_PUBLISHED: {
      key: 'lessonPublished',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'normal',
      template: (lesson) => `Sua lição "${lesson.title}" foi publicada`
    },
    MODULE_CREATED: {
      key: 'moduleCreated',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'normal',
      template: (course, module) => `Novo módulo disponível: "${module.title}" no curso "${course.title}"`
    },
    MODULE_UPDATED: {
      key: 'moduleUpdated',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'normal',
      template: (course, module) => `Módulo atualizado: "${module.title}" no curso "${course.title}"`
    },
    MODULE_DELETED: {
      key: 'moduleDeleted',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high',
      template: (course, moduleTitle) => `Módulo removido: "${moduleTitle}" do curso "${course.title}"`
    },
    MODULE_PUBLISHED: {
      key: 'modulePublished',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (module) => `Seu módulo "${module.title}" foi publicado`
    },
    MODULE_REORDERED: {
      key: 'moduleReordered',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'low',
      template: (course) => `Módulos reorganizados no curso "${course.title}"`
    },
    COURSE_CREATED: {
      key: 'courseCreated',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (course, user) => `${user.username} criou um novo curso: "${course.title}"`
    },
    COURSE_DELETED: {
      key: 'courseDeleted',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high',
      template: (course) => `O curso "${course.title}" foi eliminado`
    },
    COURSE_PUBLISHED: {
      key: 'coursePublished',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (course) => `Seu curso "${course.title}" foi publicado com sucesso!`
    },
    COURSE_ENROLLMENT: {
      key: 'courseEnrollment',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (course, user) => `${user.username} se inscreveu no seu curso "${course.title}"`
    },
    COURSE_UNENROLLMENT: {
      key: 'courseUnenrollment',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'low',
      template: (course, user) => `${user.username} cancelou a inscrição no curso "${course.title}"`
    },
    COURSE_COMPLETION: {
      key: 'courseCompletion',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (course) => `Parabéns! Você completou o curso "${course.title}"`
    },
    COURSE_APPROVAL: {
      key: 'courseApproval',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high',
      template: (course) => `Seu curso "${course.title}" foi aprovado pelos administradores`
    },
    COURSE_REJECTION: {
      key: 'courseRejection',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high',
      template: (course) => `Seu curso "${course.title}" precisa de ajustes antes da publicação`
    },
    COURSE_MATERIAL_UPDATE: {
      key: 'courseMaterialUpdate',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (course) => `Novo material disponível no curso "${course.title}"`
    },
    COURSE_DEADLINE_REMINDER: {
      key: 'courseDeadlineReminder',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high',
      template: (course, daysLeft) => `Apenas ${daysLeft} dias restantes para completar o curso "${course.title}"`
    },
    COURSE_NEW_ANNOUNCEMENT: {
      key: 'courseNewAnnouncement',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (course) => `Novo anúncio publicado no curso "${course.title}"`
    },
    // Course Assignments
    COURSE_ASSIGNMENT_CREATED: {
      key: 'courseAssignmentCreated',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high',
      template: (course, assignment) => `Nova tarefa disponível: "${assignment.title}" no curso "${course.title}"`
    },
    COURSE_ASSIGNMENT_UPDATED: {
      key: 'courseAssignmentUpdated',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (course, assignment, changes) => `Tarefa atualizada: "${assignment.title}" (${changes})`
    },
    COURSE_ASSIGNMENT_DELETED: {
      key: 'courseAssignmentDeleted',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high',
      template: (course, assignmentTitle) => `Tarefa removida: "${assignmentTitle}" do curso "${course.title}"`
    },
    COURSE_ASSIGNMENT_SUBMITTED: {
      key: 'courseAssignmentSubmitted',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (student, assignment) => `${student.username} submeteu a tarefa "${assignment.title}"`
    },
    COURSE_ASSIGNMENT_GRADED: {
      key: 'courseAssignmentGraded',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high',
      template: (assignment, grade) => `Sua tarefa "${assignment.title}" foi avaliada: ${grade.score}/${assignment.maxScore}`
    },
    // Messages
    NEW_DIRECT_MESSAGE: {
      key: 'newDirectMessage',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high',
      template: (sender, message) => `${sender.username}: ${truncate(message.content, 50)}`
    },
    CONVERSATION_READ: {
      key: 'conversationRead',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'low',
      template: (user) => `${user.username} visualizou sua mensagem`
    },
    NEW_CONVERSATION: {
      key: 'newConversation',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (sender) => `${sender.username} iniciou uma nova conversa`
    },
    NEW_TICKET: {
      key: 'newTicket',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high',
      template: (sender, preview) => `Novo ticket de ${sender.username}: ${preview}`
    },
    // Group chat
    STUDY_GROUP_NEW_MESSAGE: {
      key: 'studyGroupNewMessage',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'normal',
      template: (sender, group, message) => `${sender.username} no grupo ${group.name}: ${message.content.substring(0, 30)}...`
    },
    STUDY_GROUP_TOPIC_CHANGED: {
      key: 'studyGroupTopicChanged',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'normal',
      template: (moderator, group, topic) => `${moderator.username} definiu novo tópico: "${topic}"`
    },
    STUDY_GROUP_MESSAGE_EDITED: {
      key: 'studyGroupMessageEdited',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'low',
      template: (sender) => `${sender.username} editou uma mensagem`
    },
    STUDY_GROUP_MESSAGE_DELETED: {
      key: 'studyGroupMessageDeleted',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'high',
      template: (moderator) => `${moderator.username} removeu uma mensagem`
    },
    STUDY_GROUP_MESSAGE_OFF_TOPIC: {
      key: 'studyGroupMessageOffTopic',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'normal',
      template: (moderator) => `${moderator.username} marcou uma mensagem como fora do tópico`
    },
    // Content (Study Group)
    STUDY_GROUP_CONTENT_UPLOADED: {
      key: 'studyGroupContentUploaded',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'normal',
      template: (uploader, group, content) => `${uploader.username} compartilhou um novo arquivo: "${content.title}"`
    },
    STUDY_GROUP_LINK_ADDED: {
      key: 'studyGroupLinkAdded',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'normal',
      template: (uploader, group, link) => `${uploader.username} adicionou um novo link: "${link.title}"`
    },
    STUDY_GROUP_CONTENT_UPDATED: {
      key: 'studyGroupContentUpdated',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'low',
      template: (updater, content) => `${updater.username} atualizou o conteúdo: "${content.title}"`
    },
    STUDY_GROUP_CONTENT_DELETED: {
      key: 'studyGroupContentDeleted',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'high',
      template: (deleter, contentTitle) => `${deleter.username} removeu o conteúdo: "${contentTitle}"`
    },
    // Discussion
    DISCUSSION_TOPIC_CREATED: {
      key: 'discussionTopicCreated',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'normal',
      template: (author, group, topic) => `${author.username} criou um novo tópico: "${topic.title}"`
    },
    DISCUSSION_TOPIC_UPDATED: {
      key: 'discussionTopicUpdated',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'low',
      template: (updater, topic, changes) => `${updater.username} atualizou o tópico "${topic.title}"`
    },
    DISCUSSION_REPLY_ADDED: {
      key: 'discussionReplyAdded',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'normal',
      template: (author, topic, reply) => `${author.username} respondeu no tópico "${topic.title}"`
    },
    DISCUSSION_REPLY_UPDATED: {
      key: 'discussionReplyUpdated',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'low',
      template: (updater, topic) => `${updater.username} editou uma resposta no tópico "${topic.title}"`
    },
    DISCUSSION_REPLY_VOTED: {
      key: 'discussionReplyVoted',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'low',
      template: (voter, replyAuthor, topic) => `${voter.username} votou na sua resposta no tópico "${topic.title}"`
    },
    // Tasks
    STUDY_GROUP_TASK_CREATED: {
      key: 'studyGroupTaskCreated',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (creator, group, task) => `${creator.username} criou a tarefa "${task.title}" no grupo ${group.name}`
    },
    STUDY_GROUP_TASK_UPDATED: {
      key: 'studyGroupTaskUpdated',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (updater, task, changes) => `${updater.username} atualizou a tarefa "${task.title}" (${changes})`
    },
    STUDY_GROUP_TASK_DELETED: {
      key: 'studyGroupTaskDeleted',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high',
      template: (deleter, taskTitle) => `${deleter.username} removeu a tarefa "${taskTitle}"`
    },
    STUDY_GROUP_TASK_ASSIGNED: {
      key: 'studyGroupTaskAssigned',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high',
      template: (assigner, task) => `${assigner.username} atribuiu a tarefa "${task.title}" para você`
    },
    STUDY_GROUP_TASK_STATUS_CHANGED: {
      key: 'studyGroupTaskStatusChanged',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (user, task, newStatus) => `${user.username} alterou o status da tarefa "${task.title}" para ${newStatus}`
    },
    // Communities
    COMMUNITY_CREATED: {
      key: 'communityCreated',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal'
    },
    COMMUNITY_UPDATED: {
      key: 'communityUpdated',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'normal'
    },
    NEW_COMMUNITY_MEMBER: {
      key: 'newCommunityMember',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'low'
    },
    MEMBER_LEFT_COMMUNITY: {
      key: 'memberLeftCommunity',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'low'
    },
    MEMBER_REQUEST: {
      key: 'memberRequest',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal'
    },
    NEW_COMMUNITY_POST: {
      key: 'newCommunityPost',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'normal'
    },
    POST_REACTION: {
      key: 'postReaction',
      defaultEmail: false,
      defaultInApp: true,
      priority: 'low'
    },
    NEW_COMMENT: {
      key: 'newComment',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal'
    },
    COMMENT_REPLY: {
      key: 'commentReply',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal'
    },
    POST_DELETED: {
      key: 'postDeleted',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high'
    },
    COMMENT_DELETED: {
      key: 'commentDeleted',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal'
    },
    STUDY_GROUP_INVITE: {
      key: 'studyGroupInvite',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high',
      template: (group, inviter) => `${inviter.username} te convidou para o grupo "${group.name}"`
    },
    STUDY_GROUP_JOIN_REQUEST: {
      key: 'studyGroupJoinRequest',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (user, group) => `${user.username} solicitou entrar no grupo "${group.name}"`
    },
    STUDY_GROUP_REQUEST_APPROVED: {
      key: 'studyGroupRequestApproved',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (group) => `Sua solicitação para o grupo "${group.name}" foi aprovada`
    },
    STUDY_GROUP_REQUEST_REJECTED: {
      key: 'studyGroupRequestRejected',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (group) => `Sua solicitação para o grupo "${group.name}" foi recusada`
    },
    STUDY_GROUP_ROLE_CHANGE: {
      key: 'studyGroupRoleChange',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (group, newRole) => `Sua função no grupo "${group.name}" foi alterada para ${newRole}`
    },
    STUDY_GROUP_REMOVED: {
      key: 'studyGroupRemoved',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high',
      template: (group) => `Você foi removido do grupo "${group.name}"`
    },
    STUDY_GROUP_UPDATED: {
      key: 'studyGroupUpdated',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'normal',
      template: (group) => `O grupo "${group.name}" foi atualizado`
    },
    STUDY_GROUP_DELETED: {
      key: 'studyGroupDeleted',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high',
      template: (groupName) => `O grupo "${groupName}" foi excluído`
    },
    STUDY_GROUP_MEETING_SCHEDULED: {
      key: 'studyGroupMeetingScheduled',
      defaultEmail: true,
      defaultInApp: true,
      priority: 'high',
      template: (meeting) => `Nova reunião agendada: "${meeting.title}" para ${meeting.startTime}`
    }
  };
}

  /**
   * Cria e envia uma notificação com tratamento completo
   */
  async createNotification(userId, type, payload = {}, externalTransaction = null) {
    const transaction = externalTransaction || await sequelize.transaction();
    const shouldCommit = !externalTransaction;
    
    try {
      // Validação do tipo de notificação
      if (!this.notificationTypes[type]) {
        throw new Error(`Tipo de notificação inválido: ${type}`);
      }

      // Busca o usuário com suas preferências
      const user = await User.findByPk(userId, {
        attributes: ['userId', 'email', 'username', 'notificationPreferences'],
        transaction
      });

      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      // Configura a notificação
      const { title, message, metadata } = this._prepareNotificationContent(type, payload, user);
      const isEmailAllowed = this._checkEmailPreference(user, type);

      // Cria a notificação no banco de dados
      const notification = await Notification.create({
        userId,
        type,
        title,
        message,
        metadata,
        relatedEntityId: payload.relatedEntityId,
        scheduledAt: payload.scheduledAt || null,
        isRead: false,
        emailSent: false
      }, { transaction });

      // Envio de e-mail assíncrono e desacoplado
      if (isEmailAllowed) {
        this._sendEmailNotification(user, type, {
          title,
          message,
          ...payload,
          notificationId: notification.notificationId
        }).catch(error => {
          logger.error('Falha no envio assíncrono de e-mail:', error);
        });
      }

      if (shouldCommit) {
        await transaction.commit();
      }
      
      logger.info(`Notificação criada para usuário ${userId}`, {
        notificationId: notification.notificationId,
        type
      });

      return notification;
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback();
      }
      logger.error('Falha ao criar notificação:', {
        userId,
        type,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Notifica um usuário específico
   */
  async notifyUser (userId, type, message, metadata = {}) {
    return Notification.create({
      userId,
      type,
      message,
      metadata
    });
  }

  /**
  * Notifica os administradores sobre um novo usuário que precisa de revisão
 */
  async notifyAdminsForUserReview(newUserId, userRole, documentsCount) {
    const transaction = await sequelize.transaction()
    try {
      // Busca todos os administradores ativos
      const admins = await User.findAll({
        where: { 
          role: 'admin',
          status: 'approved'
        },
        attributes: ['userId', 'email', 'notificationPreferences'],
        transaction
      });

      if (admins.length === 0) {
        throw new Error('Nenhum administrador encontrado para notificação');
      }

      // Prepara os dados da notificação
      const newUser = await User.findByPk(newUserId, {
        attributes: ['userId', 'username', 'email', 'createdAt'],
        transaction
      });

      const notificationPromises = admins.map(admin => {
        return this.createNotification(
          admin.userId,
          'USER_REVIEW_REQUIRED',
          {
            relatedEntityId: newUserId,
            metadata: {
              newUserId: newUser.userId,
              newUserUsername: newUser.username,
              newUserEmail: newUser.email,
              userRole,
              documentsCount,
              registrationDate: newUser.createdAt,
              reviewLink: `/admin/users/review/${newUserId}`
            }
          },
          transaction
        );
      });

      await Promise.all(notificationPromises);
      await transaction.commit();

      logger.info(`Notificações de revisão enviadas para ${admins.length} administradores`, {
        newUserId,
        userRole
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Falha ao notificar administradores:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

    /**
   * Notifica o usuário sobre a aprovação da conta
   */
  async notifyUserApproval(userId, reviewerId) {
    try {
      const [user, reviewer] = await Promise.all([
        User.findByPk(userId, { attributes: ['userId', 'username', 'email'] }),
        User.findByPk(reviewerId, { attributes: ['userId', 'username'] })
      ]);

      if (!user || !reviewer) {
        throw new Error('Usuário não encontrado');
      }

      await this.createNotification(
        user.userId,
        'USER_APPROVED',
        {
          metadata: {
            reviewerId: reviewer.userId,
            reviewerUsername: reviewer.username,
            reviewDate: new Date().toISOString()
          }
        }
      );

      // Envia email específico
      await emailService.sendAccountApprovedEmail(
        user.email,
        user.username,
        reviewer.username
      );

    } catch (error) {
      logger.error('Falha ao notificar usuário sobre aprovação:', error);
      throw error;
    }
  }

  /**
   * Notifica o usuário sobre a rejeição da conta
   */
  async notifyUserRejection(userId, reviewerId, reason) {
    try {
      const [user, reviewer] = await Promise.all([
        User.findByPk(userId, { attributes: ['userId', 'username', 'email'] }),
        User.findByPk(reviewerId, { attributes: ['userId', 'username'] })
      ]);

      if (!user || !reviewer) {
        throw new Error('Usuário não encontrado');
      }

      await this.createNotification(
        user.userId,
        'USER_REJECTED',
        {
          metadata: {
            reviewerId: reviewer.userId,
            reviewerUsername: reviewer.username,
            reviewDate: new Date().toISOString(),
            rejectionReason: reason
          }
        }
      );

      // Envia email específico
      await emailService.sendAccountRejectedEmail(
        user.email,
        user.username,
        reviewer.username,
        reason
      );

    } catch (error) {
      logger.error('Falha ao notificar usuário sobre rejeição:', error);
      throw error;
    }
  }

  /**
   * Notifica quando um usuário começa a seguir outro
   */
  async notifyNewFollower(followerId, followedUserId) {
    try {
      const [follower, followedUser] = await Promise.all([
        User.findByPk(followerId, { attributes: ['userId', 'username'] }),
        User.findByPk(followedUserId, { attributes: ['userId', 'username'] })
      ]);

      if (!follower || !followedUser) {
        throw new Error('Usuário não encontrado');
      }

      // Notifica o usuário que foi seguido
      await this.createNotification(
        followedUserId,
        'NEW_FOLLOWER',
        {
          relatedEntityId: followerId,
          metadata: {
            followerId: follower.userId,
            followerUsername: follower.username
          }
        }
      );

      // Notifica o usuário que está seguindo (opcional)
      await this.createNotification(
        followerId,
        'FOLLOWING_UPDATE',
        {
          relatedEntityId: followedUserId,
          metadata: {
            followedUserId: followedUser.userId,
            followedUsername: followedUser.username
          }
        }
      );

    } catch (error) {
      logger.error('Erro ao enviar notificações de novo seguidor:', error);
      throw error;
    }
  }

  /**
   * Notifica quando um usuário deixa de seguir outro
   */
  async notifyUnfollowed(followerId, unfollowedUserId) {
    try {
      const [follower, unfollowedUser] = await Promise.all([
        User.findByPk(followerId, { attributes: ['userId', 'username'] }),
        User.findByPk(unfollowedUserId, { attributes: ['userId', 'username'] })
      ]);

      if (!follower || !unfollowedUser) {
        throw new Error('Usuário não encontrado');
      }

      // Notifica o usuário que foi deixado de seguir
      await this.createNotification(
        unfollowedUserId,
        'UNFOLLOWED',
        {
          relatedEntityId: followerId,
          metadata: {
            unfollowerId: follower.userId,
            unfollowerUsername: follower.username
          }
        }
      );

    } catch (error) {
      logger.error('Erro ao enviar notificações de unfollow:', error);
      throw error;
    }
  }

  /**
   * Notifica sobre a criação de um novo curso
   */
  async notifyCourseCreated(course, creator) {
    return this.createNotification(
      creator.userId,
      'COURSE_CREATED',
      {
        courseTitle: course.title,
        courseId: course.courseId,
        courseSlug: course.slug,
        relatedEntityId: course.courseId
      }
    );
  }

  /**
   * Notifica sobre a publicação de um curso
   */
  async notifyCoursePublished(course) {
    return this.createNotification(
      course.organizerId,
      'COURSE_PUBLISHED',
      {
        courseTitle: course.title,
        courseId: course.courseId,
        courseSlug: course.slug,
        relatedEntityId: course.courseId
      }
    );
  }

  /**
   * Notifica sobre a eliminação de um curso
   * @param {Object} course - Curso eliminado
   * @param {Object} deleter - Usuário que eliminou o curso
   * @param {Array} affectedUsers - Lista de usuários afetados (estudantes, instrutores associados)
   */
  async notifyCourseDeleted(course, deleter, affectedUsers = []) {
    try {
      // Notifica o usuário que eliminou o curso
      await this.createNotification(
        deleter.userId,
        'COURSE_DELETED',
        {
          courseTitle: course.title,
          courseId: course.courseId,
          deletionDate: new Date().toISOString(),
          relatedEntityId: course.courseId,
          metadata: {
            actionBy: deleter.username
          }
        }
      );

      // Notifica todos os usuários afetados
      const notifications = affectedUsers.map(user => {
        return this.createNotification(
          user.userId,
          'COURSE_DELETED',
          {
            courseTitle: course.title,
            courseId: course.courseId,
            deletionDate: new Date().toISOString(),
            relatedEntityId: course.courseId,
            metadata: {
              actionBy: deleter.username,
              refundInfo: user.role === 'student' ? 'O reembolso será processado em 5-7 dias' : undefined
            }
          }
        );
      });

      await Promise.all(notifications);
      
    } catch (error) {
      logger.error('Erro ao enviar notificações de curso eliminado:', error);
      throw error;
    }
  }

  /**
   * Notifica sobre nova inscrição em curso
   */
  async notifyCourseEnrollment(course, student) {
    return this.createNotification(
      course.organizerId,
      'COURSE_ENROLLMENT',
      {
        courseTitle: course.title,
        courseId: course.courseId,
        studentId: student.userId,
        studentName: student.username,
        enrollmentDate: new Date().toISOString(),
        relatedEntityId: course.courseId
      }
    );
  }

  /**
   * Notifica sobre conclusão de curso
   */
  async notifyCourseCompletion(course, student) {
    return this.createNotification(
      student.userId,
      'COURSE_COMPLETION',
      {
        courseTitle: course.title,
        courseId: course.courseId,
        certificateUrl: `/certificates/${course.courseId}/${student.userId}`,
        relatedEntityId: course.courseId
      }
    );
  }

  /**
   * Notifica todos os estudantes sobre atualização no curso
   */
  async notifyAllStudentsAboutCourseUpdate(courseId, updateDetails) {
    const course = await Course.findByPk(courseId, {
      include: [{
        model: User,
        as: 'students',
        attributes: ['userId']
      }]
    });

    if (!course) return;

    const notifications = course.students.map(student => {
      return this.createNotification(
        student.userId,
        'COURSE_MATERIAL_UPDATE',
        {
          courseTitle: course.title,
          courseId: course.courseId,
          sectionName: updateDetails.sectionName,
          materialType: updateDetails.materialType,
          relatedEntityId: course.courseId
        }
      );
    });

    return Promise.all(notifications);
  }

  /**
   * Notifica sobre a criação de um novo evento
   */
  async notifyEventCreated(event, creator) {
    return this.createNotification(
      creator.userId,
      'EVENT_CREATED',
      {
        eventName: event.name,
        eventId: event.eventId,
        startDate: event.startDate,
        location: event.location,
        relatedEntityId: event.eventId
      }
    );
  }

  /**
   * Notifica sobre atualização de evento
   */
  async notifyEventUpdated(event, updater, participants) {
    // Notifica o organizador
    await this.createNotification(
      event.organizerId,
      'EVENT_UPDATED',
      {
        eventName: event.name,
        eventId: event.eventId,
        updatedBy: updater.username,
        changes: event.changes,
        relatedEntityId: event.eventId
      }
    );

    // Notifica os participantes
    const notifications = participants.map(participant => {
      return this.createNotification(
        participant.userId,
        'EVENT_UPDATED',
        {
          eventName: event.name,
          eventId: event.eventId,
          changes: event.changes,
          relatedEntityId: event.eventId
        }
      );
    });

    return Promise.all(notifications);
  }

  /**
   * Notifica sobre eliminação de evento
   */
  async notifyEventDeleted(event, deleter, participants) {
    // Notifica o organizador
    await this.createNotification(
      event.organizerId,
      'EVENT_DELETED',
      {
        eventName: event.name,
        eventId: event.eventId,
        deletedBy: deleter.username,
        relatedEntityId: event.eventId
      }
    );

    // Notifica os participantes
    const notifications = participants.map(participant => {
      return this.createNotification(
        participant.userId,
        'EVENT_DELETED',
        {
          eventName: event.name,
          eventId: event.eventId,
          deletedBy: deleter.username,
          relatedEntityId: event.eventId
        }
      );
    });

    return Promise.all(notifications);
  }

  /**
   * Notifica sobre nova inscrição em evento
   */
  async notifyEventRegistration(event, participant) {
    // Notifica o participante
    await this.createNotification(
      participant.userId,
      'EVENT_REGISTRATION',
      {
        eventName: event.name,
        eventId: event.eventId,
        startDate: event.startDate,
        location: event.location,
        relatedEntityId: event.eventId
      }
    );

    // Notifica o organizador
    return this.createNotification(
      event.organizerId,
      'EVENT_REGISTRATION',
      {
        eventName: event.name,
        eventId: event.eventId,
        participantName: participant.username,
        participantId: participant.userId,
        relatedEntityId: event.eventId
      }
    );
  }

  /**
   * Notifica sobre cancelamento de inscrição
   */
  async notifyEventRegistrationCancelled(event, participant) {
    // Notifica o participante
    await this.createNotification(
      participant.userId,
      'EVENT_REGISTRATION_CANCELLED',
      {
        eventName: event.name,
        eventId: event.eventId,
        cancellationDate: new Date().toISOString(),
        relatedEntityId: event.eventId
      }
    );

    // Notifica o organizador
    return this.createNotification(
      event.organizerId,
      'EVENT_REGISTRATION_CANCELLED',
      {
        eventName: event.name,
        eventId: event.eventId,
        participantName: participant.username,
        participantId: participant.userId,
        relatedEntityId: event.eventId
      }
    );
  }

  /**
   * Envia lembrete de evento
   */
  async sendEventReminder(event, participants) {
    const notifications = participants.map(participant => {
      return this.createNotification(
        participant.userId,
        'EVENT_REMINDER',
        {
          eventName: event.name,
          eventId: event.eventId,
          startDate: event.startDate,
          location: event.location,
          timeRemaining: this._getTimeRemaining(event.startDate),
          relatedEntityId: event.eventId
        }
      );
    });

    return Promise.all(notifications);
  }

  // ( LESSONS )

  async notifyLessonCreated(lessonId, creatorId) {
  try {
    // 1. Busca os dados básicos com todas as relações necessárias
    const lesson = await Lesson.findByPk(lessonId, {
      attributes: ['lessonId', 'title', 'lessonType', 'isFree', 'moduleId'],
      include: [{
        model: Module,
        as: 'module',
        attributes: ['moduleId', 'title'],
        include: [{
          model: Course,
          as: 'course',
          attributes: ['courseId', 'title', 'instructorId'],
          include: [{
            model: User,
            as: 'instructor',
            attributes: ['userId', 'username']
          }]
        }]
      }, {
        model: User,
        as: 'creator',
        attributes: ['userId', 'username']
      }]
    });

    if (!lesson) {
      throw new Error(`Lição ${lessonId} não encontrada`);
    }
    if (!lesson.module) {
      throw new Error(`Módulo da lição ${lessonId} não encontrado`);
    }
    if (!lesson.module.course) {
      throw new Error(`Curso do módulo não encontrado para lição ${lessonId}`);
    }

    // 2. Busca os alunos matriculados no curso
    const enrolledStudents = await Enrollment.findAll({
      attributes: ['userId'],
      where: { 
        courseId: lesson.module.course.courseId,
        status: 'active' // Considerando apenas matriculas ativas
      },
      raw: true // Otimização de performance
    });

    // 3. Envia notificações
    await Promise.all(enrolledStudents.map(student =>
      this.createNotification(
        student.userId,
        'LESSON_CREATED',
        {
          relatedEntityId: lessonId,
          metadata: {
            lessonId: lesson.lessonId,
            lessonTitle: lesson.title,
            lessonType: lesson.lessonType,
            moduleId: lesson.module.moduleId,
            moduleTitle: lesson.module.title,
            courseId: lesson.module.course.courseId,
            courseTitle: lesson.module.course.title,
            createdBy: lesson.creator?.username || 'Sistema'
          }
        }
      )
    ));

    return { success: true, notifiedStudents: enrolledStudents.length };

  } catch (error) {
    console.error('Erro em notifyLessonCreated:', error);
    throw error; // Propaga para o chamador tratar
  }
}

/**
 * Notifica atualização de lição
 */
async notifyLessonUpdated(lessonId, updaterId) {
  const [lesson, course, updater] = await Promise.all([
    Lesson.findByPk(lessonId, {
      include: [{
        model: Module,
        include: [Course]
      }]
    }),
    User.findByPk(updaterId, { attributes: ['userId', 'username'] })
  ]);

  // Notifica alunos que já acessaram a lição
  const accessedStudents = await LessonProgress.findAll({
    where: { lessonId },
    attributes: ['userId'],
    group: ['userId']
  });

  await Promise.all(accessedStudents.map(student =>
    this.createNotification(
      student.userId,
      'LESSON_UPDATED',
      {
        relatedEntityId: lessonId,
        metadata: {
          lessonId: lesson.lessonId,
          lessonTitle: lesson.title,
          courseId: lesson.Module.courseId,
          courseTitle: lesson.Module.Course.title,
          updatedBy: updater.username,
          updatedAt: new Date().toISOString()
        }
      }
    )
  ));
}

/**
 * Notifica conclusão de lição
 */
async notifyLessonCompletion(userId, lessonId) {
  const lesson = await Lesson.findByPk(lessonId, {
    attributes: ['lessonId', 'title', 'moduleId'],
    include: [{
      model: Module,
      as: 'module',
      attributes: ['moduleId', 'courseId'],
      include: [{
        model: Course,
        attributes: ['courseId', 'title']
      }]
    }]
  });

  await this.createNotification(
    userId,
    'LESSON_COMPLETED',
    {
      relatedEntityId: lessonId,
      metadata: {
        lessonId: lesson.lessonId,
        lessonTitle: lesson.title,
        courseId: lesson.module.courseId,
        courseTitle: lesson.module.Course.title,
        completedAt: new Date().toISOString()
      }
    }
  );
}

/**
 * Notifica exclusão de lição
 */
async notifyLessonDeletion(lessonId, deleterId) {
  const [lesson, course, deleter] = await Promise.all([
    Lesson.findByPk(lessonId, {
      include: [{
        model: Module,
        include: [Course]
      }]
    }),
    User.findByPk(deleterId, { attributes: ['userId', 'username'] })
  ]);

  // Notifica alunos que já acessaram
  const accessedStudents = await LessonProgress.findAll({
    where: { lessonId },
    attributes: ['userId'],
    group: ['userId']
  });

  await Promise.all(accessedStudents.map(student =>
    this.createNotification(
      student.userId,
      'LESSON_DELETED',
      {
        relatedEntityId: lesson.Module.courseId, // Usa courseId como relacionamento principal
        metadata: {
          lessonTitle: lesson.title,
          courseId: lesson.Module.courseId,
          courseTitle: lesson.Module.Course.title,
          deletedBy: deleter.username,
          deletedAt: new Date().toISOString()
        }
      }
    )
  ));
}

/**
 * Notifica publicação de lição
 */
async notifyLessonPublished(lessonId) {
  const lesson = await Lesson.findByPk(lessonId, {
    include: [{
      model: User,
      as: 'creator',
      attributes: ['userId']
    }, {
      model: Module,
      include: [Course]
    }]
  });

  await this.createNotification(
    lesson.creator.userId,
    'LESSON_PUBLISHED',
    {
      relatedEntityId: lessonId,
      metadata: {
        lessonId: lesson.lessonId,
        lessonTitle: lesson.title,
        courseId: lesson.Module.courseId,
        publishedAt: new Date().toISOString()
      }
    }
  );
}

/**
 * Notifica reorganização de lições
 */
async notifyLessonsReordered(courseId, updaterId) {
  const [course, updater] = await Promise.all([
    Course.findByPk(courseId, { attributes: ['courseId', 'title'] }),
    User.findByPk(updaterId, { attributes: ['userId', 'username'] })
  ]);

  // Notifica todos os alunos matriculados
  const enrolledStudents = await Enrollment.findAll({
    where: { courseId },
    attributes: ['userId']
  });

  await Promise.all(enrolledStudents.map(student =>
    this.createNotification(
      student.userId,
      'LESSON_REORDERED',
      {
        relatedEntityId: courseId,
        metadata: {
          courseId: course.courseId,
          courseTitle: course.title,
          updatedBy: updater.username,
          updatedAt: new Date().toISOString()
        }
      }
    )
  ));
}

// ( MODULES )

/**
 * Notifica criação de novo módulo
 */
async notifyModuleCreated(moduleId, creatorId) {
  const [module, creator] = await Promise.all([
    Module.findByPk(moduleId, {
      include: [{
        model: Course,
        as: 'course'
      }]
    }),
    User.findByPk(creatorId, { attributes: ['userId', 'username'] })
  ]);

  // Notifica alunos matriculados
  const enrolledStudents = await Enrollment.findAll({
    where: { courseId: module.courseId },
    attributes: ['userId']
  });

  await Promise.all(enrolledStudents.map(student =>
    this.createNotification(
      student.userId,
      'MODULE_CREATED',
      {
        relatedEntityId: moduleId,
        metadata: {
          moduleId: module.moduleId,
          moduleTitle: module.title,
          courseId: module.courseId,
          courseTitle: module.course.title,
          createdBy: creator.username
        }
      }
    )
  ));
}

async notifyModuleUpdated(moduleId, updaterId) {
  try {
    // 1. Busca os dados básicos necessários
    const [module, updater] = await Promise.all([
      Module.findByPk(moduleId, {
        include: [{
          model: Course,
          as: 'course',
          attributes: ['courseId', 'title'],
          required: false
        }]
      }),
      User.findByPk(updaterId, { 
        attributes: ['userId', 'username'],
        raw: true // Otimização para objeto simples
      })
    ]);

    if (!module) {
      throw new Error(`Módulo ${moduleId} não encontrado`);
    }
    if (!updater) {
      throw new Error(`Usuário ${updaterId} não encontrado`);
    }

    // Busca os alunos matriculados que acessaram o módulo
    const accessedStudents = await Enrollment.findAll({
      attributes: ['userId'],
      where: { 
        courseId: module.courseId,
        status: 'active'
      },
      group: ['userId'],
      raw: true
    });

    // Envia notificações
    await Promise.all(accessedStudents.map(student =>
      this.createNotification(
        student.userId,
        'MODULE_UPDATED',
        {
          relatedEntityId: moduleId,
          metadata: {
            moduleId: module.moduleId,
            moduleTitle: module.title,
            courseId: module.course?.courseId || null,
            courseTitle: module.course?.title || 'Curso não disponível',
            updatedBy: updater.username,
            updatedAt: new Date().toISOString()
          }
        }
      )
    ));

  } catch (error) {
    console.error('Erro em notifyModuleUpdated:', error);
    throw error;
  }
}

/**
 * Notifica exclusão de módulo
 */
async notifyModuleDeletion(moduleId, deleterId) {
  const [module, course, deleter] = await Promise.all([
    Module.findByPk(moduleId, {
      include: [Course]
    }),
    User.findByPk(deleterId, { attributes: ['userId', 'username'] })
  ]);

  // Notifica alunos que já acessaram
  const accessedStudents = await ModuleProgress.findAll({
    where: { moduleId },
    attributes: ['userId'],
    group: ['userId']
  });

  await Promise.all(accessedStudents.map(student =>
    this.createNotification(
      student.userId,
      'MODULE_DELETED',
      {
        relatedEntityId: module.courseId,
        metadata: {
          moduleTitle: module.title,
          courseId: module.courseId,
          courseTitle: module.Course.title,
          deletedBy: deleter.username,
          deletedAt: new Date().toISOString()
        }
      }
    )
  ));
}

// COURSE ASSIGNMENTS

/**
 * Notifica criação de novo assignment
 */
async notifyAssignmentCreated(assignmentId) {
  const [assignment, course] = await Promise.all([
    Assignment.findByPk(assignmentId, {
      attributes: ['assignmentId', 'title', 'courseId', 'dueDate']
    }),
    Course.findByPk(assignment.courseId, {
      attributes: ['courseId', 'title'],
      include: [{
        model: Enrollment,
        as: 'enrollments',
        attributes: ['userId']
      }]
    })
  ]);

  // Notifica todos os alunos matriculados
  await Promise.all(course.Enrollments.map(enrollment =>
    this.createNotification(
      enrollment.userId,
      'COURSE_ASSIGNMENT_CREATED',
      {
        relatedEntityId: assignmentId,
        metadata: {
          courseId: course.courseId,
          courseTitle: course.title,
          assignmentId: assignment.assignmentId,
          assignmentTitle: assignment.title,
          dueDate: assignment.dueDate,
          createdAt: new Date().toISOString()
        }
      }
    )
  ));
}

/**
 * Notifica submissão de assignment
 */
async notifyAssignmentSubmitted(submissionId) {
  const [submission, assignment, course, student] = await Promise.all([
    Submission.findByPk(submissionId, {
      attributes: ['submissionId', 'assignmentId', 'userId']
    }),
    Assignment.findByPk(submission.assignmentId, {
      attributes: ['assignmentId', 'title', 'courseId'],
      include: [{
        model: Course,
        attributes: ['courseId', 'instructorId']
      }]
    }),
    User.findByPk(submission.userId, {
      attributes: ['userId', 'username']
    })
  ]);

  // Notifica o instrutor do curso
  await this.createNotification(
    assignment.course.instructorId,
    'COURSE_ASSIGNMENT_SUBMITTED',
    {
      relatedEntityId: submissionId,
      metadata: {
        courseId: assignment.courseId,
        assignmentId: assignment.assignmentId,
        assignmentTitle: assignment.title,
        studentId: student.userId,
        studentUsername: student.username,
        submittedAt: new Date().toISOString()
      }
    }
  );
}

// ( MESSAGES )
/**
 * Notifica nova mensagem direta
 */
async notifyNewMessage(senderId, recipientId, messageId) {
  const [sender, message] = await Promise.all([
    User.findByPk(senderId, { attributes: ['userId', 'username'] }),
    Message.findByPk(messageId, { attributes: ['messageId', 'content'] })
  ]);

  await this.createNotification(
    recipientId,
    'NEW_DIRECT_MESSAGE',
    {
      relatedEntityId: messageId,
      metadata: {
        senderId: sender.userId,
        senderUsername: sender.username,
        messageId: message.messageId,
        preview: truncate(message.content, 50),
        sentAt: new Date().toISOString()
      }
    }
  );
}

/**
 * Notifica quando conversa é marcada como lida
 */
async notifyConversationRead(readerId, conversationId, lastMessageId) {
  const [reader, conversation] = await Promise.all([
    User.findByPk(readerId, { attributes: ['userId', 'username'] }),
    Conversation.findByPk(conversationId, {
      include: [{
        model: ConversationParticipant,
        where: { userId: { [Op.ne]: readerId } }
      }]
    })
  ]);

  await Promise.all(conversation.ConversationParticipants.map(participant =>
    this.createNotification(
      participant.userId,
      'CONVERSATION_READ',
      {
        relatedEntityId: lastMessageId,
        metadata: {
          readerId: reader.userId,
          readerUsername: reader.username,
          conversationId,
          readAt: new Date().toISOString()
        }
      }
    )
  ));
}

/**
 * Notifica nova conversa criada
 */
async notifyNewConversation(creatorId, participantIds) {
  const creator = await User.findByPk(creatorId, { 
    attributes: ['userId', 'username'] 
  });

  await Promise.all(participantIds.map(participantId =>
    this.createNotification(
      participantId,
      'NEW_CONVERSATION',
      {
        relatedEntityId: creatorId,
        metadata: {
          creatorId: creator.userId,
          creatorUsername: creator.username,
          startedAt: new Date().toISOString()
        }
      }
    )
  ));
}

// (GROUP CHAT)

/**
 * Notifica nova mensagem no grupo de estudo
 */
async notifyStudyGroupNewMessage(groupId, messageId) {
  const [message, group] = await Promise.all([
    ChatMessage.findByPk(messageId, {
      include: [{
        model: User,
        as: 'sender',
        attributes: ['userId', 'username']
      }]
    }),
    StudyGroup.findByPk(groupId, {
      attributes: ['groupId', 'name']
    })
  ]);

  // Busca membros ativos do grupo (exceto o remetente)
  const members = await StudyGroupMember.findAll({
    where: { 
      groupId,
      userId: { [Op.ne]: message.senderId },
      status: 'active'
    },
    attributes: ['userId']
  });

  await Promise.all(members.map(member =>
    this.createNotification(
      member.userId,
      'STUDY_GROUP_NEW_MESSAGE',
      {
        relatedEntityId: messageId,
        metadata: {
          groupId: group.groupId,
          groupName: group.name,
          senderId: message.sender.userId,
          senderUsername: message.sender.username,
          messagePreview: message.content.substring(0, 50),
          sentAt: message.createdAt
        }
      }
    )
  ));
}

/**
 * Notifica mudança de tópico
 */
async notifyStudyGroupTopicChanged(groupId, moderatorId, newTopic) {
  const [group, moderator] = await Promise.all([
    StudyGroup.findByPk(groupId, { attributes: ['groupId', 'name'] }),
    User.findByPk(moderatorId, { attributes: ['userId', 'username'] })
  ]);

  const members = await StudyGroupMember.findAll({
    where: { groupId, status: 'active' },
    attributes: ['userId']
  });

  await Promise.all(members.map(member =>
    this.createNotification(
      member.userId,
      'STUDY_GROUP_TOPIC_CHANGED',
      {
        relatedEntityId: groupId,
        metadata: {
          groupId: group.groupId,
          groupName: group.name,
          moderatorId: moderator.userId,
          moderatorUsername: moderator.username,
          newTopic,
          changedAt: new Date().toISOString()
        }
      }
    )
  ));
}

// ( GROUP CONTENT )
/**
 * Notifica upload de novo conteúdo
 */
async notifyContentUploaded(groupId, contentId, uploaderId) {
  const [content, group, uploader] = await Promise.all([
    SharedContent.findByPk(contentId, {
      attributes: ['contentId', 'title', 'type']
    }),
    StudyGroup.findByPk(groupId, {
      attributes: ['groupId', 'name']
    }),
    User.findByPk(uploaderId, {
      attributes: ['userId', 'username']
    })
  ]);

  const members = await StudyGroupMember.findAll({
    where: { 
      groupId,
      userId: { [Op.ne]: uploaderId }
    },
    attributes: ['userId']
  });

  await Promise.all(members.map(member =>
    this.createNotification(
      member.userId,
      'STUDY_GROUP_CONTENT_UPLOADED',
      {
        relatedEntityId: contentId,
        metadata: {
          groupId: group.groupId,
          groupName: group.name,
          contentId: content.contentId,
          contentTitle: content.title,
          contentType: content.type,
          uploaderId: uploader.userId,
          uploaderUsername: uploader.username,
          uploadedAt: new Date().toISOString()
        }
      }
    )
  ));
}

/**
 * Notifica adição de novo link
 */
async notifyLinkAdded(groupId, linkId, adderId) {
  const [link, group, adder] = await Promise.all([
    SharedLink.findByPk(linkId, {
      attributes: ['linkId', 'title', 'url']
    }),
    StudyGroup.findByPk(groupId, {
      attributes: ['groupId', 'name']
    }),
    User.findByPk(adderId, {
      attributes: ['userId', 'username']
    })
  ]);

  const members = await StudyGroupMember.findAll({
    where: { 
      groupId,
      userId: { [Op.ne]: adderId }
    },
    attributes: ['userId']
  });

  await Promise.all(members.map(member =>
    this.createNotification(
      member.userId,
      'STUDY_GROUP_LINK_ADDED',
      {
        relatedEntityId: linkId,
        metadata: {
          groupId: group.groupId,
          groupName: group.name,
          linkId: link.linkId,
          linkTitle: link.title,
          linkUrl: link.url,
          adderId: adder.userId,
          adderUsername: adder.username,
          addedAt: new Date().toISOString()
        }
      }
    )
  ));
}

// Discussion
/**
 * Notifica criação de novo tópico
 */
async notifyTopicCreated(topicId) {
  const [topic, author, group] = await Promise.all([
    DiscussionTopic.findByPk(topicId, {
      attributes: ['topicId', 'title', 'groupId']
    }),
    User.findByPk(topic.authorId, {
      attributes: ['userId', 'username']
    }),
    StudyGroup.findByPk(topic.groupId, {
      attributes: ['groupId', 'name']
    })
  ]);

  const members = await StudyGroupMember.findAll({
    where: { 
      groupId: topic.groupId,
      userId: { [Op.ne]: author.userId }
    },
    attributes: ['userId']
  });

  await Promise.all(members.map(member =>
    this.createNotification(
      member.userId,
      'DISCUSSION_TOPIC_CREATED',
      {
        relatedEntityId: topicId,
        metadata: {
          groupId: group.groupId,
          groupName: group.name,
          topicId: topic.topicId,
          topicTitle: topic.title,
          authorId: author.userId,
          authorUsername: author.username,
          createdAt: new Date().toISOString()
        }
      }
    )
  ));
}

/**
 * Notifica nova resposta em tópico
 */
async notifyReplyAdded(replyId) {
  const [reply, topic, author, group] = await Promise.all([
    DiscussionReply.findByPk(replyId, {
      attributes: ['replyId', 'content', 'topicId']
    }),
    DiscussionTopic.findByPk(reply.topicId, {
      attributes: ['topicId', 'title', 'groupId', 'authorId']
    }),
    User.findByPk(reply.authorId, {
      attributes: ['userId', 'username']
    }),
    StudyGroup.findByPk(topic.groupId, {
      attributes: ['groupId', 'name']
    })
  ]);

  // Notifica o autor do tópico
  if (topic.authorId !== author.userId) {
    await this.createNotification(
      topic.authorId,
      'DISCUSSION_REPLY_ADDED',
      {
        relatedEntityId: replyId,
        metadata: {
          groupId: group.groupId,
          groupName: group.name,
          topicId: topic.topicId,
          topicTitle: topic.title,
          replyId: reply.replyId,
          replyPreview: reply.content.substring(0, 50),
          authorId: author.userId,
          authorUsername: author.username,
          repliedAt: new Date().toISOString()
        }
      }
    );
  }
}

// ( Tasks )

/**
 * Notifica criação de nova tarefa
 */
async notifyTaskCreated(taskId) {
  const [task, group, creator] = await Promise.all([
    GroupTask.findByPk(taskId, {
      attributes: ['taskId', 'title', 'groupId']
    }),
    StudyGroup.findByPk(task.groupId, {
      attributes: ['groupId', 'name']
    }),
    User.findByPk(task.creatorId, {
      attributes: ['userId', 'username']
    })
  ]);

  const members = await StudyGroupMember.findAll({
    where: { 
      groupId: task.groupId,
      status: 'active'
    },
    attributes: ['userId']
  });

  await Promise.all(members.map(member =>
    this.createNotification(
      member.userId,
      'STUDY_GROUP_TASK_CREATED',
      {
        relatedEntityId: taskId,
        metadata: {
          groupId: group.groupId,
          groupName: group.name,
          taskId: task.taskId,
          taskTitle: task.title,
          creatorId: creator.userId,
          creatorUsername: creator.username,
          createdAt: new Date().toISOString()
        }
      }
    )
  ));
}

/**
 * Notifica atribuição de tarefa
 */
async notifyTaskAssigned(taskId, assigneeId, assignerId) {
  const [task, group, assigner] = await Promise.all([
    GroupTask.findByPk(taskId, {
      attributes: ['taskId', 'title', 'groupId']
    }),
    StudyGroup.findByPk(task.groupId, {
      attributes: ['groupId', 'name']
    }),
    User.findByPk(assignerId, {
      attributes: ['userId', 'username']
    })
  ]);

  await this.createNotification(
    assigneeId,
    'STUDY_GROUP_TASK_ASSIGNED',
    {
      relatedEntityId: taskId,
      metadata: {
        groupId: group.groupId,
        groupName: group.name,
        taskId: task.taskId,
        taskTitle: task.title,
        assignerId: assigner.userId,
        assignerUsername: assigner.username,
        assignedAt: new Date().toISOString()
      }
    }
  );
}

  /**
   * Notifica sobre a criação de uma nova comunidade
   */
  async notifyCommunityCreated(community, creator) {
    return this.createNotification(
      creator.userId,
      'COMMUNITY_CREATED',
      {
        communityId: community.communityId,
        communityName: community.name,
        communityDescription: community.shortDescription,
        relatedEntityId: community.communityId
      }
    );
  }

  /**
   * Notifica administradores sobre solicitação de entrada
   */
  async notifyCommunityAdmins(communityId, requesterId, transaction) {
    const admins = await CommunityMember.findAll({
      where: {
        communityId,
        role: 'admin',
        status: 'active'
      },
      transaction
    });

    const requester = await User.findByPk(requesterId, {
      attributes: ['userId', 'username'],
      transaction
    });

    const community = await Community.findByPk(communityId, {
      attributes: ['communityId', 'name'],
      transaction
    });

    const notifications = admins.map(admin => {
      return this.createNotification(
        admin.userId,
        'MEMBER_REQUEST',
        {
          communityId,
          communityName: community.name,
          requesterId: requester.userId,
          requesterName: requester.username,
          relatedEntityId: communityId
        },
        transaction
      );
    });

    return Promise.all(notifications);
  }

  /**
   * Notifica sobre novo membro na comunidade
   */
  async notifyNewCommunityMember(communityId, newMember) {
    // Notifica o novo membro
    await this.createNotification(
      newMember.userId,
      'NEW_COMMUNITY_MEMBER',
      {
        communityId,
        communityName: newMember.community.name,
        relatedEntityId: communityId
      }
    );

    // Notifica os administradores
    const admins = await CommunityMember.findAll({
      where: {
        communityId,
        role: 'admin',
        status: 'active'
      },
      include: [{
        model: Community,
        as: 'community',
        attributes: ['name']
      }]
    });

    const notifications = admins.map(admin => {
      return this.createNotification(
        admin.userId,
        'NEW_COMMUNITY_MEMBER',
        {
          communityId,
          communityName: admin.community.name,
          newMemberId: newMember.userId,
          newMemberName: newMember.username,
          relatedEntityId: communityId
        }
      );
    });

    return Promise.all(notifications);
  }

  /**
   * Notifica sobre novo post na comunidade
   */
  async notifyNewCommunityPost(post, community) {
    // Notifica o autor sobre a publicação
    await this.createNotification(
      post.authorId,
      'NEW_COMMUNITY_POST',
      {
        postId: post.postId,
        postTitle: post.title,
        communityId: community.communityId,
        communityName: community.name,
        relatedEntityId: post.postId
      }
    );

    // Notifica membros interessados
    if (post.tags && post.tags.length > 0) {
      const interestedMembers = await CommunityMember.findAll({
        where: {
          communityId: community.communityId,
          status: 'active',
          notificationPreferences: {
            newPosts: true
          }
        },
        include: [{
          model: User,
          as: 'user',
          where: {
            notificationPreferences: {
              communityUpdates: true
            }
          }
        }]
      });

      const notifications = interestedMembers.map(member => {
        return this.createNotification(
          member.userId,
          'NEW_COMMUNITY_POST',
          {
            postId: post.postId,
            postTitle: post.title,
            communityId: community.communityId,
            communityName: community.name,
            authorId: post.authorId,
            authorName: post.author.username,
            relatedEntityId: post.postId
          }
        );
      });

      await Promise.all(notifications);
    }
  }

  /**
   * Notifica sobre nova reação em post
   */
  async notifyPostReaction(post, reactor, reactionType) {
    // Não notificar se for o próprio autor
    if (post.authorId === reactor.userId) return;

    return this.createNotification(
      post.authorId,
      'POST_REACTION',
      {
        postId: post.postId,
        postTitle: post.title,
        reactorId: reactor.userId,
        reactorName: reactor.username,
        reactionType,
        relatedEntityId: post.postId
      }
    );
  }

  /**
   * Notifica sobre novo comentário
   */
  async notifyNewComment(post, comment, commenter) {
    // Notifica o autor do post
    if (post.authorId !== commenter.userId) {
      await this.createNotification(
        post.authorId,
        'NEW_COMMENT',
        {
          postId: post.postId,
          postTitle: post.title,
          commentId: comment.commentId,
          commentPreview: comment.content.substring(0, 50),
          commenterId: commenter.userId,
          commenterName: commenter.username,
          relatedEntityId: post.postId
        }
      );
    }

    // Se for resposta a outro comentário, notifica o autor do comentário original
    if (comment.parentCommentId) {
      const parentComment = await PostComment.findByPk(comment.parentCommentId, {
        include: [{
          model: User,
          as: 'author',
          attributes: ['userId']
        }]
      });

      if (parentComment && parentComment.author.userId !== commenter.userId) {
        await this.createNotification(
          parentComment.author.userId,
          'COMMENT_REPLY',
          {
            postId: post.postId,
            postTitle: post.title,
            commentId: comment.commentId,
            parentCommentId: parentComment.commentId,
            commentPreview: comment.content.substring(0, 50),
            commenterId: commenter.userId,
            commenterName: commenter.username,
            relatedEntityId: post.postId
          }
        );
      }
    }
  }

  /**
   * Notifica sobre post deletado
   */
  async notifyPostDeleted(post, deleter) {
    // Notifica o autor
    if (post.authorId !== deleter.userId) {
      await this.createNotification(
        post.authorId,
        'POST_DELETED',
        {
          postId: post.postId,
          postTitle: post.title,
          deleterId: deleter.userId,
          deleterName: deleter.username,
          deletionReason: deleter.role === 'admin' ? 'by_admin' : 'by_moderator',
          relatedEntityId: post.communityId
        }
      );
    }

    // Notifica quem comentou no post
    const commenters = await PostComment.findAll({
      where: { postId: post.postId },
      attributes: ['authorId'],
      group: ['authorId'],
      include: [{
        model: User,
        as: 'author',
        attributes: ['userId']
      }]
    });

    const notifications = commenters
      .filter(c => c.author.userId !== deleter.userId && c.author.userId !== post.authorId)
      .map(commenter => {
        return this.createNotification(
          commenter.author.userId,
          'POST_DELETED',
          {
            postId: post.postId,
            postTitle: post.title,
            deleterId: deleter.userId,
            deleterName: deleter.username,
            relatedEntityId: post.communityId
          }
        );
      });

    await Promise.all(notifications);
  }

  /**
   * Notifica sobre comentário deletado
   */
  async notifyCommentDeleted(comment, deleter) {
    // Notifica o autor
    if (comment.authorId !== deleter.userId) {
      await this.createNotification(
        comment.authorId,
        'COMMENT_DELETED',
        {
          commentId: comment.commentId,
          postId: comment.postId,
          deleterId: deleter.userId,
          deleterName: deleter.username,
          deletionReason: deleter.role === 'admin' ? 'by_admin' : 'by_moderator',
          relatedEntityId: comment.postId
        }
      );
    }

    // Se era uma resposta, notifica o autor do comentário pai
    if (comment.parentCommentId) {
      const parentComment = await PostComment.findByPk(comment.parentCommentId, {
        include: [{
          model: User,
          as: 'author',
          attributes: ['userId']
        }]
      });

      if (parentComment && parentComment.author.userId !== deleter.userId) {
        await this.createNotification(
          parentComment.author.userId,
          'COMMENT_DELETED',
          {
            commentId: comment.commentId,
            postId: comment.postId,
            parentCommentId: parentComment.commentId,
            deleterId: deleter.userId,
            deleterName: deleter.username,
            relatedEntityId: comment.postId
          }
        );
      }
    }
  }

  async notifyIfNewMember(member, communityId, user) {
    if (!member || !member._options?.isNewRecord) return;

  try {
    await this.notifyNewCommunityMember(communityId, user);
  } catch (err) {
    console.error('Erro ao notificar novo membro:', err);
  }
}

/**
 * Notifica convite para grupo de estudo
 */
async notifyStudyGroupInvite(inviterId, inviteeId, groupId) {
  const [inviter, group] = await Promise.all([
    User.findByPk(inviterId, { attributes: ['userId', 'username'] }),
    StudyGroup.findByPk(groupId, { attributes: ['groupId', 'name'] })
  ]);

  await this.createNotification(
    inviteeId,
    'STUDY_GROUP_INVITE',
    {
      relatedEntityId: groupId,
      metadata: {
        inviterId: inviter.userId,
        inviterUsername: inviter.username,
        groupId: group.groupId,
        groupName: group.name
      }
    }
  );
}

/**
 * Notifica solicitação de entrada no grupo
 */
async notifyJoinRequest(userId, groupId) {
  const [user, group] = await Promise.all([
    User.findByPk(userId, { attributes: ['userId', 'username'] }),
    StudyGroup.findByPk(groupId, { 
      attributes: ['groupId', 'name'],
      include: [{
        model: User,
        as: 'creator',
        attributes: ['userId']
      }]
    })
  ]);

  // Notifica o líder/criador do grupo
  await this.createNotification(
    group.creator.userId,
    'STUDY_GROUP_JOIN_REQUEST',
    {
      relatedEntityId: groupId,
      metadata: {
        requesterId: user.userId,
        requesterUsername: user.username,
        groupId: group.groupId,
        groupName: group.name
      }
    }
  );
}

/**
 * Notifica decisão sobre solicitação de entrada
 */
async notifyRequestDecision(userId, groupId, approved) {
  const group = await StudyGroup.findByPk(groupId, { 
    attributes: ['groupId', 'name'] 
  });

  await this.createNotification(
    userId,
    approved ? 'STUDY_GROUP_REQUEST_APPROVED' : 'STUDY_GROUP_REQUEST_REJECTED',
    {
      relatedEntityId: groupId,
      metadata: {
        groupId: group.groupId,
        groupName: group.name,
        decisionDate: new Date().toISOString()
      }
    }
  );
}

/**
 * Notifica mudança de função no grupo
 */
async notifyRoleChange(userId, groupId, newRole) {
  const group = await StudyGroup.findByPk(groupId, { 
    attributes: ['groupId', 'name'] 
  });

  await this.createNotification(
    userId,
    'STUDY_GROUP_ROLE_CHANGE',
    {
      relatedEntityId: groupId,
      metadata: {
        groupId: group.groupId,
        groupName: group.name,
        newRole,
        changedAt: new Date().toISOString()
      }
    }
  );
}

/**
 * Notifica atualização do grupo de estudo
 */
async notifyGroupUpdate(groupId, updaterId, changes) {
  const [group, updater] = await Promise.all([
    StudyGroup.findByPk(groupId, { attributes: ['groupId', 'name'] }),
    User.findByPk(updaterId, { attributes: ['userId', 'username'] })
  ]);

  // Busca todos os membros do grupo
  const members = await StudyGroupMember.findAll({
    where: { groupId },
    attributes: ['userId']
  });

  // Notifica cada membro
  await Promise.all(members.map(member => 
    this.createNotification(
      member.userId,
      'STUDY_GROUP_UPDATED',
      {
        relatedEntityId: groupId,
        metadata: {
          groupId: group.groupId,
          groupName: group.name,
          updatedBy: updater.username,
          changes: JSON.stringify(changes),
          updatedAt: new Date().toISOString()
        }
      }
    )
  ));
}

/**
 * Notifica exclusão do grupo de estudo
 */
async notifyGroupDeletion(groupId, deleterId) {
  const [group, deleter] = await Promise.all([
    StudyGroup.findByPk(groupId, { attributes: ['groupId', 'name'] }),
    User.findByPk(deleterId, { attributes: ['userId', 'username'] })
  ]);

  // Busca todos os membros do grupo
  const members = await StudyGroupMember.findAll({
    where: { groupId },
    attributes: ['userId']
  });

  // Notifica cada membro
  await Promise.all(members.map(member =>
    this.createNotification(
      member.userId,
      'STUDY_GROUP_DELETED',
      {
        relatedEntityId: groupId,
        metadata: {
          groupName: group.name,
          deletedBy: deleter.username,
          deletedAt: new Date().toISOString()
        }
      }
    )
  ));
}

/**
 * Notifica agendamento de nova reunião
 */
async notifyMeetingScheduled(meetingId) {
  const meeting = await GroupMeeting.findByPk(meetingId, {
    include: [{
      model: StudyGroup,
      attributes: ['groupId', 'name'],
      include: [{
        model: StudyGroupMember,
        attributes: ['userId']
      }]
    }]
  });

  // Notifica todos os membros do grupo
  await Promise.all(meeting.StudyGroup.StudyGroupMembers.map(member =>
    this.createNotification(
      member.userId,
      'STUDY_GROUP_MEETING_SCHEDULED',
      {
        relatedEntityId: meetingId,
        metadata: {
          meetingId: meeting.meetingId,
          title: meeting.title,
          startTime: meeting.startTime,
          groupId: meeting.StudyGroup.groupId,
          groupName: meeting.StudyGroup.name,
          scheduledBy: meeting.organizerId
        }
      }
    )
  ));
}

  /**
   * Notifica todos os membros de um grupo (exceto o remetente)
   */
  async notifyGroupMembers(groupId, type, message, metadata = {}, excludeUserId = null) {
    const members = await StudyGroupMember.findAll({
      where: { groupId },
      attributes: ['userId']
    });

    const notifications = members
      .filter(member => member.userId !== excludeUserId)
      .map(member => ({
        userId: member.userId,
        type,
        message,
        metadata
      }));

    return Notification.bulkCreate(notifications);
  }

  /**
   * Adiciona pontos a um membro do grupo
   */
  async addPoints(membershipId, actionType) {
    const pointsMap = {
      'CREATE_TOPIC': 10,
      'POST_REPLY': 5,
      'COMPLETE_TASK': 15,
      'SHARE_CONTENT': 20,
      'RECEIVE_UPVOTE': 3
    };

    const points = pointsMap[actionType] || 0;

    await StudyGroupMember.increment('contributionScore', {
      by: points,
      where: { membershipId }
    });

    // Verifica conquistas
    await this.checkAchievements(membershipId);
  }

  /**
   * Desbloqueia conquistas baseadas na pontuação
   */
  async checkAchievements(membershipId) {
    const member = await StudyGroupMember.findByPk(membershipId);
    const score = member.contributionScore;

    const achievementsToAdd = [];
    if (score >= 100) achievementsToAdd.push('TOP_CONTRIBUTOR');
    if (score >= 50) achievementsToAdd.push('RESOURCE_PROVIDER');

    for (const type of achievementsToAdd) {
      await Achievement.findOrCreate({
        where: { membershipId, type },
        defaults: { points: score }
      });
    }
  }

  /**
   * Cria notificações em lote para múltiplos usuários
   */
  async createBulkNotifications(userIds, type, payload) {
    if (!Array.isArray(userIds)) {
      throw new Error('userIds deve ser um array');
    }

    const successfulNotifications = [];
    const failedNotifications = [];

    // Processa em lotes para evitar sobrecarga
    const batchSize = 100;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async userId => {
        try {
          const notification = await this.createNotification(userId, type, payload);
          successfulNotifications.push(notification);
        } catch (error) {
          failedNotifications.push({
            userId,
            error: error.message
          });
        }
      }));
    }

    return {
      successCount: successfulNotifications.length,
      failCount: failedNotifications.length,
      failedNotifications
    };
  }

  /**
   * Busca notificações do usuário com paginação
   */
  async getUserNotifications(userId, options = {}) {
    const {
      limit = 20,
      offset = 0,
      includeRead = false,
      types = [],
      fromDate,
      toDate
    } = options;

    const where = {
      userId,
      ...(!includeRead && { isRead: false }),
      ...(types.length > 0 && { type: types }),
      ...(fromDate && { createdAt: { [Op.gte]: fromDate } }),
      ...(toDate && { createdAt: { [Op.lte]: toDate } })
    };

    const { count, rows } = await Notification.findAndCountAll({
      where,
      order: [
        ['isRead', 'ASC'],
        ['createdAt', 'DESC']
      ],
      limit,
      offset,
      include: [
        {
          model: Course,
          as: 'course',
          attributes: ['courseId', 'title', 'slug'],
          required: false
        },
        {
          model: Event,
          as: 'event',
          attributes: ['eventId', 'title', 'startDate'],
          required: false
        }
      ]
    });

    return {
      total: count,
      unread: includeRead ? null : await Notification.count({
        where: { userId, isRead: false }
      }),
      notifications: rows
    };
  }

  /**
   * Obtém uma notificação pelo ID com validações
   * @param {string} notificationId - UUID da notificação
   * @param {string} [userId] - ID do usuário para verificação de permissão (opcional)
   * @returns {Promise<Notification>}
   * @throws {Error} Se a notificação não for encontrada ou o usuário não tiver permissão
   */
  async getNotificationById(notificationId, userId = null) {
    if (!notificationId) {
      throw new Error('ID da notificação é obrigatório');
    }

    const transaction = await sequelize.transaction();
    
    try {
      const notification = await Notification.findOne({
        where: { notificationId },
        transaction
      });

      if (!notification) {
        await transaction.rollback();
        throw new Error('Notificação não encontrada');
      }

      // Verificação de permissão se userId for fornecido
      if (userId && notification.userId !== userId) {
        await transaction.rollback();
        throw new Error('Não autorizado - esta notificação pertence a outro usuário');
      }

      await transaction.commit();

      return notification;
    } catch (error) {
      await transaction.rollback();
      logger.error('Falha ao buscar notificação:', {
        notificationId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Marca notificação como lida
   */
  async markAsRead(notificationId, userId) {
    const [affectedCount] = await Notification.update(
      { isRead: true, readAt: new Date() },
      {
        where: {
          notificationId,
          userId,
          isRead: false
        }
      }
    );

    if (affectedCount === 0) {
      throw new Error('Notificação não encontrada ou já lida');
    }

    return { success: true };
  }

  /**
   * Marca todas as notificações como lidas
   */
  async markAllAsRead(userId) {
    const [affectedCount] = await Notification.update(
      { isRead: true, readAt: new Date() },
      {
        where: {
          userId,
          isRead: false
        }
      }
    );

    return { success: true, markedCount: affectedCount };
  }

  /**
 * Busca preferências de notificação do usuário
 */
async getUserPreferences(userId) {
  // Busca o usuário no banco de dados
  const user = await User.findByPk(userId, {
    attributes: ['userId', 'notificationPreferences'],
    raw: true
  });

  if (!user) {
    throw new Error('Usuário não encontrado');
  }

  // Retorna as preferências padrão se não existirem
  if (!user.notificationPreferences) {
    return this.getDefaultPreferences();
  }

  // Garante que todas as opções estão presentes mesclando com os padrões
  return {
    ...this.getDefaultPreferences(),
    ...user.notificationPreferences
  };
}

  /**
 * Atualiza preferências de notificação
 */
async updateUserPreferences(userId, preferences) {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new Error('Usuário não encontrado');
  }

  // Valida e mescla as preferências
  const newPrefs = this._validatePreferences(preferences);
  const currentPrefs = user.notificationPreferences || this.getDefaultPreferences();

  // Atualiza apenas os campos fornecidos
  const updatedPrefs = {
    ...currentPrefs,
    ...newPrefs,
    email: {
      ...currentPrefs.email,
      ...(newPrefs.email || {})
    },
    push: {
      ...(currentPrefs.push || this.getDefaultPreferences().push),
      ...(newPrefs.push || {})
    }
  };

  await user.update({
    notificationPreferences: updatedPrefs
  });

  return updatedPrefs;
}

  /**
   * Envia lembretes para eventos próximos
   */
  async sendEventReminders() {
    const now = new Date();
    const threshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const events = await Event.findAll({
      where: {
        startTime: {
          [Op.between]: [now, threshold]
        },
        status: 'scheduled',
        reminderSent: false
      },
      include: [{
        model: User,
        as: 'participants',
        attributes: ['userId'],
        through: {
          attributes: []
        }
      }]
    });

    let sentCount = 0;
    let errorCount = 0;

    await Promise.all(events.map(async event => {
      const timeRemaining = this._getTimeRemaining(event.startTime);
      
      await Promise.all(event.participants.map(async participant => {
        try {
          await this.createNotification(
            participant.userId,
            'EVENT_REMINDER',
            {
              eventId: event.eventId,
              eventName: event.title,
              timeRemaining,
              relatedEntityId: event.eventId
            }
          );
          sentCount++;
        } catch (error) {
          errorCount++;
          logger.error('Erro ao enviar lembrete de evento:', {
            eventId: event.eventId,
            userId: participant.userId,
            error: error.message
          });
        }
      }));

      // Marca o evento como lembrado
      await event.update({ reminderSent: true });
    }));

    return { sentCount, errorCount, totalEvents: events.length };
  }

  // Adicione este método ao seu serviço de notificações
  async notifyGroupMembers(groupId, title, message) {
    const members = await StudyGroupMember.findAll({
      where: { groupId },
      include: [{
        model: User,
        attributes: ['userId']
      }]
    });

    await Promise.all(members.map(member => {
      return this.createNotification(
        member.user.userId,
        'GROUP_MEETING',
        {
          title,
          message,
          groupId
        }
      );
    }));
  }

  // ==================== MÉTODOS PRIVADOS ====================

  /**
 * Prepara o conteúdo da notificação baseada no tipo
 */
_prepareNotificationContent(type, payload, user) {
  const templates = {
    USER_REVIEW_REQUIRED: () => ({
      title: `Novo ${payload.metadata.userRole} para revisão`,
      message: `Um novo ${payload.metadata.userRole} (${payload.metadata.newUserUsername}) se registrou com ${payload.metadata.documentsCount} documentos para revisão.`,
      metadata: payload.metadata
    }),
    USER_APPROVED: () => ({
      title: 'Sua conta foi aprovada!',
      message: `Sua conta foi aprovada por ${payload.metadata.reviewerUsername}. Agora você tem acesso completo à plataforma.`,
      metadata: payload.metadata
    }),
    USER_REJECTED: () => ({
      title: 'Sua conta não foi aprovada',
      message: `Sua conta foi rejeitada por ${payload.metadata.reviewerUsername}. Motivo: ${payload.metadata.rejectionReason}`,
      metadata: payload.metadata
    }),
    EVENT_CREATED: () => ({
      title: `Evento criado: ${payload.eventName}`,
      message: `Você criou o evento "${payload.eventName}" para ${payload.startDate}.`,
      metadata: {
        eventId: payload.eventId,
        startDate: payload.startDate,
        location: payload.location
      }
    }),
    EVENT_UPDATED: () => ({
      title: `Evento atualizado: ${payload.eventName}`,
      message: payload.updatedBy 
        ? `O evento "${payload.eventName}" foi atualizado por ${payload.updatedBy}.`
        : `O evento "${payload.eventName}" foi atualizado.`,
      metadata: {
        eventId: payload.eventId,
        changes: payload.changes,
        updatedAt: new Date().toISOString()
      }
    }),
    EVENT_DELETED: () => ({
      title: `Evento cancelado: ${payload.eventName}`,
      message: payload.deletedBy
        ? `O evento "${payload.eventName}" foi cancelado por ${payload.deletedBy}.`
        : `O evento "${payload.eventName}" foi cancelado.`,
      metadata: {
        eventId: payload.eventId,
        deletedAt: new Date().toISOString()
      }
    }),
    EVENT_REGISTRATION: () => ({
      title: payload.participantName
        ? `Nova inscrição: ${payload.participantName}`
        : `Inscrição confirmada: ${payload.eventName}`,
      message: payload.participantName
        ? `${payload.participantName} se inscreveu no evento "${payload.eventName}".`
        : `Sua inscrição no evento "${payload.eventName}" foi confirmada.`,
      metadata: {
        eventId: payload.eventId,
        participantId: payload.participantId,
        registrationDate: new Date().toISOString()
      }
    }),
    EVENT_REGISTRATION_CANCELLED: () => ({
      title: payload.participantName
        ? `Inscrição cancelada: ${payload.participantName}`
        : `Inscrição cancelada: ${payload.eventName}`,
      message: payload.participantName
        ? `${payload.participantName} cancelou a inscrição no evento "${payload.eventName}".`
        : `Você cancelou sua inscrição no evento "${payload.eventName}".`,
      metadata: {
        eventId: payload.eventId,
        participantId: payload.participantId,
        cancellationDate: payload.cancellationDate
      }
    }),
    EVENT_REMINDER: () => ({
      title: `Lembrete: Evento ${payload.eventName}`,
      message: `O evento "${payload.eventName}" começa ${payload.timeRemaining}.`,
      metadata: {
        eventId: payload.eventId,
        timeRemaining: payload.timeRemaining,
        startDate: payload.startDate,
        location: payload.location
      }
    }),
    TASK_DEADLINE: () => ({
      title: `Prazo próximo: ${payload.taskName}`,
      message: `A tarefa "${payload.taskName}" vence ${payload.timeRemaining}.`,
      metadata: {
        taskId: payload.taskId,
        dueDate: payload.dueDate
      }
    }),
    COURSE_UPDATE: () => ({
      title: `Atualização no curso: ${payload.courseName}`,
      message: payload.message || `O curso "${payload.courseName}" foi atualizado.`,
      metadata: {
        courseId: payload.courseId,
        updateType: payload.updateType
      }
    }),
    NEW_MESSAGE: () => ({
      title: `Nova mensagem de ${payload.senderName}`,
      message: payload.preview || `Você tem uma nova mensagem em ${payload.context}.`,
      metadata: {
        messageId: payload.messageId,
        senderId: payload.senderId
      }
    }),
    REVIEW_REPLY: () => ({
      title: `Resposta à sua avaliação`,
      message: `O instrutor respondeu à sua avaliação no curso "${payload.courseName}".`,
      metadata: {
        courseId: payload.courseId,
        reviewId: payload.reviewId
      }
    }),
    SYSTEM_ALERT: () => ({
      title: payload.title || 'Alerta do Sistema',
      message: payload.message,
      metadata: payload.metadata || {}
    }),
    NEW_FOLLOWER: () => ({
      title: 'Novo acompanhante',
      message: `${payload.metadata.followerUsername} está te acompanhando agora.`,
      metadata: {
        followerId: payload.metadata.followerId,
        followerUsername: payload.metadata.followerUsername,
        profileUrl: `/profile/${payload.metadata.followerUsername}`
      }
    }),
    FOLLOWING_UPDATE: () => ({
      title: 'Acompanhamento iniciado',
      message: `Você está acompanhando ${payload.metadata.followedUsername}`,
      metadata: {
        followedUserId: payload.metadata.followedUserId,
        followedUsername: payload.metadata.followedUsername,
        profileUrl: `/profile/${payload.metadata.followedUsername}`
      }
    }),
    UNFOLLOWED: () => ({
      title: 'Alguém deixou de te acompanhar',
      message: `${payload.metadata.unfollowerUsername} deixou de te acompanhar`,
      metadata: {
        unfollowerId: payload.metadata.unfollowerId,
        unfollowerUsername: payload.metadata.unfollowerUsername
      }
    }),
    // Novos templates para notificações de cursos
    COURSE_CREATED: () => ({
      title: `Novo curso criado: ${payload.courseTitle}`,
      message: `Você criou o curso "${payload.courseTitle}" com sucesso.`,
      metadata: {
        courseId: payload.courseId,
        courseSlug: payload.courseSlug,
        creatorId: user.id
      }
    }),
    COURSE_PUBLISHED: () => ({
      title: `Curso publicado: ${payload.courseTitle}`,
      message: `Seu curso "${payload.courseTitle}" está agora disponível publicamente.`,
      metadata: {
        courseId: payload.courseId,
        courseSlug: payload.courseSlug,
        publishDate: new Date().toISOString()
      }
    }),
    COURSE_DELETED: () => ({
      title: `Curso eliminado: ${payload.courseTitle}`,
      message: payload.metadata.isOwner 
        ? `Você eliminou o curso "${payload.courseTitle}"`
        : `O curso "${payload.courseTitle}" foi eliminado pelo administrador`,
      metadata: {
        courseId: payload.courseId,
        deletedBy: payload.metadata.actionBy,
        deletionDate: payload.deletionDate,
        ...(payload.metadata.refundInfo && { refundInfo: payload.metadata.refundInfo })
      }
    }),
    COURSE_ENROLLMENT: () => ({
      title: `Nova inscrição no curso`,
      message: `${payload.studentName} se inscreveu no seu curso "${payload.courseTitle}".`,
      metadata: {
        courseId: payload.courseId,
        studentId: payload.studentId,
        enrollmentDate: payload.enrollmentDate
      }
    }),
    COURSE_UNENROLLMENT: () => ({
      title: `Inscrição cancelada`,
      message: `${payload.studentName} cancelou a inscrição no curso "${payload.courseTitle}".`,
      metadata: {
        courseId: payload.courseId,
        studentId: payload.studentId,
        unenrollmentDate: new Date().toISOString()
      }
    }),
    COURSE_COMPLETION: () => ({
      title: `Curso concluído!`,
      message: `Parabéns! Você completou o curso "${payload.courseTitle}".`,
      metadata: {
        courseId: payload.courseId,
        completionDate: new Date().toISOString(),
        certificateUrl: payload.certificateUrl
      }
    }),
    COURSE_APPROVAL: () => ({
      title: `Curso aprovado`,
      message: `Seu curso "${payload.courseTitle}" foi aprovado e está pronto para publicação.`,
      metadata: {
        courseId: payload.courseId,
        approvalDate: new Date().toISOString(),
        approvedBy: payload.approvedBy
      }
    }),
    COURSE_REJECTION: () => ({
      title: `Curso precisa de ajustes`,
      message: `Seu curso "${payload.courseTitle}" foi revisado e precisa de ajustes: ${payload.rejectionReason}`,
      metadata: {
        courseId: payload.courseId,
        rejectionDate: new Date().toISOString(),
        rejectedBy: payload.rejectedBy,
        rejectionReason: payload.rejectionReason
      }
    }),
    COURSE_MATERIAL_UPDATE: () => ({
      title: `Novo material disponível`,
      message: `O curso "${payload.courseTitle}" tem novos materiais disponíveis na seção "${payload.sectionName}".`,
      metadata: {
        courseId: payload.courseId,
        sectionId: payload.sectionId,
        materialType: payload.materialType,
        updateDate: new Date().toISOString()
      }
    }),
    COURSE_DEADLINE_REMINDER: () => ({
      title: `Prazo do curso se aproxima`,
      message: `Você tem ${payload.daysLeft} dias restantes para completar o curso "${payload.courseTitle}".`,
      metadata: {
        courseId: payload.courseId,
        deadline: payload.deadline,
        daysLeft: payload.daysLeft
      }
    }),
    COURSE_NEW_ANNOUNCEMENT: () => ({
      title: `Novo anúncio: ${payload.courseTitle}`,
      message: `Novo anúncio publicado: "${payload.announcementTitle}"`,
      metadata: {
        courseId: payload.courseId,
        announcementId: payload.announcementId,
        announcementDate: new Date().toISOString()
      }
    }),
    COURSE_ASSIGNMENT_CREATED: () => ({
      title: `Nova tarefa em ${payload.courseTitle}`,
      message: this.notificationTypes.COURSE_ASSIGNMENT_CREATED.template(
        { title: payload.courseTitle },
        { title: payload.assignmentTitle }
      ),
      metadata: {
        courseId: payload.courseId,
        assignmentId: payload.assignmentId,
        dueDate: payload.dueDate
      }
    }),
    COURSE_ASSIGNMENT_SUBMITTED: () => ({
      title: `Submissão em ${payload.assignmentTitle}`,
      message: this.notificationTypes.COURSE_ASSIGNMENT_SUBMITTED.template(
        { username: payload.studentUsername },
        { title: payload.assignmentTitle }
      ),
      metadata: {
        courseId: payload.courseId,
        assignmentId: payload.assignmentId,
        studentId: payload.studentId
      }
    }),
    COURSE_ASSIGNMENT_GRADED: () => ({
      title: `Tarefa avaliada: ${payload.assignmentTitle}`,
      message: this.notificationTypes.COURSE_ASSIGNMENT_GRADED.template(
        { title: payload.assignmentTitle },
        { score: payload.score, maxScore: payload.maxScore }
      ),
      metadata: {
        assignmentId: payload.assignmentId,
        score: payload.score,
        feedback: payload.feedback
      }
    }),
    LESSON_CREATED: () => ({
      title: `Nova lição: ${payload.lessonTitle}`,
      message: this.notificationTypes.LESSON_CREATED.template(
        { title: payload.courseTitle },
        { title: payload.lessonTitle }
      ),
      metadata: {
        lessonId: payload.lessonId,
        courseId: payload.courseId,
        createdBy: payload.createdBy
      }
    }),
    LESSON_UPDATED: () => ({
      title: `Lição atualizada: ${payload.lessonTitle}`,
      message: this.notificationTypes.LESSON_UPDATED.template(
        { title: payload.courseTitle },
        { title: payload.lessonTitle }
      ),
      metadata: {
        lessonId: payload.lessonId,
        courseId: payload.courseId,
        updatedBy: payload.updatedBy
      }
    }),
    LESSON_COMPLETED: () => ({
      title: `Lição concluída!`,
      message: this.notificationTypes.LESSON_COMPLETED.template(
        { title: payload.lessonTitle }
      ),
      metadata: {
        lessonId: payload.lessonId,
        courseId: payload.courseId,
        completedAt: payload.completedAt
      }
    }),
    LESSON_DELETED: () => ({
      title: `Lição removida`,
      message: this.notificationTypes.LESSON_DELETED.template(
        { title: payload.courseTitle },
        payload.lessonTitle
      ),
      metadata: {
        courseId: payload.courseId,
        deletedBy: payload.deletedBy,
        deletedAt: payload.deletedAt
      }
    }),
    LESSON_PUBLISHED: () => ({
      title: `Lição publicada`,
      message: this.notificationTypes.LESSON_PUBLISHED.template(
        { title: payload.lessonTitle }
      ),
      metadata: {
        lessonId: payload.lessonId,
        courseId: payload.courseId,
        publishedAt: payload.publishedAt
      }
    }),
    LESSON_REORDERED: () => ({
      title: `Aulas reorganizadas`,
      message: this.notificationTypes.LESSON_REORDERED.template(
        { title: payload.courseTitle }
      ),
      metadata: {
        courseId: payload.courseId,
        updatedBy: payload.updatedBy
      }
    }),
    MODULE_CREATED: () => ({
      title: `Novo módulo: ${payload.moduleTitle}`,
      message: this.notificationTypes.MODULE_CREATED.template(
        { title: payload.courseTitle },
        { title: payload.moduleTitle }
      ),
      metadata: {
        moduleId: payload.moduleId,
        courseId: payload.courseId,
        createdBy: payload.createdBy
      }
    }),
    MODULE_UPDATED: () => ({
      title: `Módulo atualizado: ${payload.moduleTitle}`,
      message: this.notificationTypes.MODULE_UPDATED.template(
        { title: payload.courseTitle },
        { title: payload.moduleTitle }
      ),
      metadata: {
        moduleId: payload.moduleId,
        courseId: payload.courseId,
        updatedBy: payload.updatedBy
      }
    }),
    MODULE_DELETED: () => ({
      title: `Módulo removido`,
      message: this.notificationTypes.MODULE_DELETED.template(
        { title: payload.courseTitle },
        payload.moduleTitle
      ),
      metadata: {
        courseId: payload.courseId,
        deletedBy: payload.deletedBy,
        deletedAt: payload.deletedAt
      }
    }),
    NEW_DIRECT_MESSAGE: () => ({
      title: `Nova mensagem de ${payload.senderUsername}`,
      message: this.notificationTypes.NEW_DIRECT_MESSAGE.template(
        { username: payload.senderUsername },
        { content: payload.preview }
      ),
      metadata: {
        senderId: payload.senderId,
        messageId: payload.messageId,
        conversationId: payload.conversationId
      }
    }),
    CONVERSATION_READ: () => ({
      title: `Mensagem visualizada`,
      message: this.notificationTypes.CONVERSATION_READ.template(
        { username: payload.readerUsername }
      ),
      metadata: {
        readerId: payload.readerId,
        conversationId: payload.conversationId,
        lastMessageId: payload.relatedEntityId
      }
    }),
    NEW_CONVERSATION: () => ({
      title: `Nova conversa com ${payload.creatorUsername}`,
      message: this.notificationTypes.NEW_CONVERSATION.template(
        { username: payload.creatorUsername }
      ),
      metadata: {
        creatorId: payload.creatorId,
        conversationId: payload.conversationId
      }
    }),
    STUDY_GROUP_NEW_MESSAGE: () => ({
      title: `Nova mensagem no grupo ${payload.groupName}`,
      message: this.notificationTypes.STUDY_GROUP_NEW_MESSAGE.template(
        { username: payload.senderUsername },
        { name: payload.groupName },
        { content: payload.messagePreview }
      ),
      metadata: {
        groupId: payload.groupId,
        senderId: payload.senderId,
        messageId: payload.relatedEntityId
      }
    }),
    STUDY_GROUP_TOPIC_CHANGED: () => ({
      title: `Novo tópico no grupo ${payload.groupName}`,
      message: this.notificationTypes.STUDY_GROUP_TOPIC_CHANGED.template(
        { username: payload.moderatorUsername },
        { name: payload.groupName },
        payload.newTopic
      ),
      metadata: {
        groupId: payload.groupId,
        moderatorId: payload.moderatorId,
        changedAt: payload.changedAt
      }
    }),
    STUDY_GROUP_CONTENT_UPLOADED: () => ({
      title: `Novo conteúdo em ${payload.groupName}`,
      message: this.notificationTypes.STUDY_GROUP_CONTENT_UPLOADED.template(
        { username: payload.uploaderUsername },
        { name: payload.groupName },
        { title: payload.contentTitle }
      ),
      metadata: {
        groupId: payload.groupId,
        contentId: payload.contentId,
        uploaderId: payload.uploaderId
      }
    }),
    STUDY_GROUP_LINK_ADDED: () => ({
      title: `Novo link em ${payload.groupName}`,
      message: this.notificationTypes.STUDY_GROUP_LINK_ADDED.template(
        { username: payload.adderUsername },
        { name: payload.groupName },
        { title: payload.linkTitle }
      ),
      metadata: {
        groupId: payload.groupId,
        linkId: payload.linkId,
        adderId: payload.adderId
      }
    }),
    STUDY_GROUP_CONTENT_UPDATED: () => ({
      title: `Conteúdo atualizado`,
      message: this.notificationTypes.STUDY_GROUP_CONTENT_UPDATED.template(
        { username: payload.updaterUsername },
        { title: payload.contentTitle }
      ),
      metadata: {
        groupId: payload.groupId,
        contentId: payload.contentId,
        updatedAt: payload.updatedAt
      }
    }),
    STUDY_GROUP_CONTENT_DELETED: () => ({
      title: `Conteúdo removido`,
      message: this.notificationTypes.STUDY_GROUP_CONTENT_DELETED.template(
        { username: payload.deleterUsername },
        payload.contentTitle
      ),
      metadata: {
        groupId: payload.groupId,
        deletedAt: payload.deletedAt
      }
    }),
    DISCUSSION_TOPIC_CREATED: () => ({
      title: `Novo tópico em ${payload.groupName}`,
      message: this.notificationTypes.DISCUSSION_TOPIC_CREATED.template(
        { username: payload.authorUsername },
        { name: payload.groupName },
        { title: payload.topicTitle }
      ),
      metadata: {
        groupId: payload.groupId,
        topicId: payload.topicId,
        authorId: payload.authorId
      }
    }),
    DISCUSSION_REPLY_ADDED: () => ({
      title: `Nova resposta em "${payload.topicTitle}"`,
      message: this.notificationTypes.DISCUSSION_REPLY_ADDED.template(
        { username: payload.authorUsername },
        { title: payload.topicTitle },
        { content: payload.replyPreview }
      ),
      metadata: {
        topicId: payload.topicId,
        replyId: payload.replyId,
        groupId: payload.groupId
      }
    }),
    DISCUSSION_REPLY_VOTED: () => ({
      title: `Seu recebeu um voto`,
      message: this.notificationTypes.DISCUSSION_REPLY_VOTED.template(
        { username: payload.voterUsername },
        { username: payload.authorUsername },
        { title: payload.topicTitle }
      ),
      metadata: {
        topicId: payload.topicId,
        replyId: payload.replyId,
        voteType: payload.voteType
      }
    }),
    STUDY_GROUP_TASK_CREATED: () => ({
      title: `Nova tarefa em ${payload.groupName}`,
      message: this.notificationTypes.STUDY_GROUP_TASK_CREATED.template(
        { username: payload.creatorUsername },
        { name: payload.groupName },
        { title: payload.taskTitle }
      ),
      metadata: {
        groupId: payload.groupId,
        taskId: payload.taskId,
        creatorId: payload.creatorId
      }
    }),
    STUDY_GROUP_TASK_ASSIGNED: () => ({
      title: `Nova tarefa atribuída`,
      message: this.notificationTypes.STUDY_GROUP_TASK_ASSIGNED.template(
        { username: payload.assignerUsername },
        { title: payload.taskTitle }
      ),
      metadata: {
        groupId: payload.groupId,
        taskId: payload.taskId,
        assignerId: payload.assignerId,
        deadline: payload.deadline
      }
    }),
    STUDY_GROUP_TASK_STATUS_CHANGED: () => ({
      title: `Status da tarefa atualizado`,
      message: this.notificationTypes.STUDY_GROUP_TASK_STATUS_CHANGED.template(
        { username: payload.changedBy },
        { title: payload.taskTitle },
        payload.newStatus
      ),
      metadata: {
        groupId: payload.groupId,
        taskId: payload.taskId,
        newStatus: payload.newStatus
      }
    }),
    COMMUNITY_CREATED: () => ({
      title: `Comunidade criada: ${payload.communityName}`,
      message: `Você criou a comunidade "${payload.communityName}" com sucesso!`,
      metadata: {
        communityId: payload.communityId,
        createdAt: new Date().toISOString()
      }
    }),
    MEMBER_REQUEST: () => ({
      title: `Nova solicitação para ${payload.communityName}`,
      message: `${payload.requesterName} quer entrar na sua comunidade "${payload.communityName}"`,
      metadata: {
        communityId: payload.communityId,
        requesterId: payload.requesterId,
        requestDate: new Date().toISOString()
      }
    }),
    NEW_COMMUNITY_MEMBER: () => ({
      title: payload.newMemberName 
        ? `Novo membro em ${payload.communityName}`
        : `Bem-vindo à ${payload.communityName}`,
      message: payload.newMemberName
        ? `${payload.newMemberName} entrou na comunidade "${payload.communityName}"`
        : `Você agora é membro da comunidade "${payload.communityName}"`,
      metadata: {
        communityId: payload.communityId,
        memberId: payload.newMemberId || user.userId,
        joinedAt: new Date().toISOString()
      }
    }),
    NEW_COMMUNITY_POST: () => ({
      title: `Novo post em ${payload.communityName}`,
      message: payload.authorName
        ? `${payload.authorName} publicou "${payload.postTitle}"`
        : `Seu post "${payload.postTitle}" foi publicado`,
      metadata: {
        communityId: payload.communityId,
        postId: payload.postId,
        authorId: payload.authorId || user.userId,
        publishedAt: new Date().toISOString()
      }
    }),
    POST_REACTION: () => ({
      title: `Nova reação em "${payload.postTitle}"`,
      message: `${payload.reactorName} reagiu com ${payload.reactionType} ao seu post`,
      metadata: {
        postId: payload.postId,
        reactorId: payload.reactorId,
        reactionType: payload.reactionType,
        reactedAt: new Date().toISOString()
      }
    }),
    NEW_COMMENT: () => ({
      title: `Novo comentário em "${payload.postTitle}"`,
      message: `${payload.commenterName} comentou: "${payload.commentPreview}..."`,
      metadata: {
        postId: payload.postId,
        commentId: payload.commentId,
        commenterId: payload.commenterId,
        commentedAt: new Date().toISOString()
      }
    }),
    COMMENT_REPLY: () => ({
      title: `Resposta ao seu comentário em "${payload.postTitle}"`,
      message: `${payload.commenterName} respondeu: "${payload.commentPreview}..."`,
      metadata: {
        postId: payload.postId,
        commentId: payload.commentId,
        parentCommentId: payload.parentCommentId,
        commenterId: payload.commenterId,
        repliedAt: new Date().toISOString()
      }
    }),
    POST_DELETED: () => ({
      title: `Post removido: "${payload.postTitle}"`,
      message: payload.deleterName
        ? `Seu post foi removido por ${payload.deleterName}`
        : `Você removeu o post "${payload.postTitle}"`,
      metadata: {
        postId: payload.postId,
        deleterId: payload.deleterId,
        deletionReason: payload.deletionReason,
        deletedAt: new Date().toISOString()
      }
    }),
    COMMENT_DELETED: () => ({
      title: `Comentário removido`,
      message: payload.deleterName
        ? `Seu comentário foi removido por ${payload.deleterName}`
        : `Você removeu um comentário`,
      metadata: {
        commentId: payload.commentId,
        postId: payload.postId,
        deleterId: payload.deleterId,
        deletionReason: payload.deletionReason,
        deletedAt: new Date().toISOString()
      }
    }),
    STUDY_GROUP_INVITE: () => ({
      title: `Convite para grupo de estudo`,
      message: this.notificationTypes.STUDY_GROUP_INVITE.template(
        { name: payload.groupName },
        { username: payload.inviterUsername }
      ),
      metadata: {
        groupId: payload.groupId,
        inviterId: payload.inviterId
      }
    }),
    STUDY_GROUP_JOIN_REQUEST: () => ({
      title: `Solicitação de participação`,
      message: this.notificationTypes.STUDY_GROUP_JOIN_REQUEST.template(
        { username: payload.requesterUsername },
        { name: payload.groupName }
      ),
      metadata: {
        groupId: payload.groupId,
        requesterId: payload.requesterId
      }
    }),
    STUDY_GROUP_REQUEST_APPROVED: () => ({
      title: `Solicitação aprovada`,
      message: this.notificationTypes.STUDY_GROUP_REQUEST_APPROVED.template(
        { name: payload.groupName }
      ),
      metadata: {
        groupId: payload.groupId,
        approvedAt: payload.decisionDate
      }
    }),
    STUDY_GROUP_ROLE_CHANGE: () => ({
      title: `Função alterada`,
      message: this.notificationTypes.STUDY_GROUP_ROLE_CHANGE.template(
        { name: payload.groupName },
        payload.newRole
      ),
      metadata: {
        groupId: payload.groupId,
        newRole: payload.newRole
      }
    }),
    STUDY_GROUP_UPDATED: () => ({
      title: `Grupo atualizado: ${payload.groupName}`,
      message: this.notificationTypes.STUDY_GROUP_UPDATED.template(
        { name: payload.groupName }
      ),
      metadata: {
        groupId: payload.groupId,
        changes: payload.changes,
        updatedBy: payload.updatedBy
      }
    }),
    STUDY_GROUP_DELETED: () => ({
      title: `Grupo excluído: ${payload.groupName}`,
      message: this.notificationTypes.STUDY_GROUP_DELETED.template(
        payload.groupName
      ),
      metadata: {
        deletedBy: payload.deletedBy,
        deletedAt: payload.deletedAt
      }
    }),
    STUDY_GROUP_MEETING_SCHEDULED: () => ({
      title: `Nova reunião: ${payload.title}`,
      message: this.notificationTypes.STUDY_GROUP_MEETING_SCHEDULED.template({
        title: payload.title,
        startTime: payload.startTime
      }),
      metadata: {
        meetingId: payload.meetingId,
        groupId: payload.groupId,
        scheduledBy: payload.scheduledBy,
        startTime: payload.startTime
      }
    })
  };

  const defaultTemplate = {
    title: payload.title || this.notificationTypes[type]?.title || 'Nova notificação',
    message: payload.message || this.notificationTypes[type]?.message || 'Você tem uma nova notificação.',
    metadata: payload.metadata || {}
  };

  return templates[type] ? templates[type]() : defaultTemplate;
}

  /**
   * Verifica se o e-mail é permitido pelas preferências do usuário
   */
  _checkEmailPreference(user, type) {
    const typeConfig = this.notificationTypes[type];
    if (!typeConfig) return false;

    const userPrefs = user.notificationPreferences || {};
    const emailPrefs = userPrefs.email || {};

    if (emailPrefs[typeConfig.key] === undefined) {
      return typeConfig.defaultEmail;
    }

    return emailPrefs[typeConfig.key];
  }

  /**
   * Envia notificação por e-mail
   */
  async _sendEmailNotification(user, type, payload) {
    try {
      const typeConfig = this.notificationTypes[type];
      const templateName = `${type.toLowerCase().replace(/_/g, '-')}`;
      
      await emailService.sendNotificationEmail(user, {
        type,
        subject: payload.title,
        templateName,
        context: {
          ...payload,
          username: user.username,
          notificationType: type,
          actionUrl: this._getActionUrl(type, payload)
        },
        priority: typeConfig.priority
      });

      // Atualiza o status de envio
      await Notification.update(
        { emailSent: true, emailSentAt: new Date() },
        { where: { notificationId: payload.notificationId } }
      );

      return true;
    } catch (error) {
      logger.error('Falha ao enviar notificação por e-mail:', {
        userId: user.userId,
        type,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Gera URL de ação baseada no tipo
   */
  _getActionUrl(type, payload) {
    const baseUrl = process.env.FRONTEND_URL || 'https://seusite.com';
    
    const urls = {
      EVENT_REMINDER: `${baseUrl}/events/${payload.eventId}`,
      TASK_DEADLINE: `${baseUrl}/tasks/${payload.taskId}`,
      COURSE_UPDATE: `${baseUrl}/courses/${payload.courseId}`,
      NEW_MESSAGE: `${baseUrl}/messages/${payload.messageId}`,
      REVIEW_REPLY: `${baseUrl}/courses/${payload.courseId}#review-${payload.reviewId}`
    };

    return urls[type] || `${baseUrl}/notifications`;
  }

  /**
 * Retorna as preferências padrão de notificação
 */
getDefaultPreferences() {
  return {
    email: {
      eventReminders: true,
      taskDeadlines: true,
      newMessages: true,
      courseUpdates: true,
      reviewReplies: true,
      communityActivity: true,
      systemAnnouncements: true
    },
    push: {
      eventReminders: true,
      newMessages: true,
      courseUpdates: false
    },
    inApp: true,
    frequency: 'immediately',
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '07:00'
    }
  };
}

/**
 * Valida e formata as preferências antes de salvar
 */
_validatePreferences(preferences) {
  const defaultPrefs = this.getDefaultPreferences();
  const validPreferences = {};

  // Valida estrutura de email
  if (preferences.email) {
    validPreferences.email = {};
    for (const key in defaultPrefs.email) {
      validPreferences.email[key] = typeof preferences.email[key] === 'boolean' 
        ? preferences.email[key] 
        : defaultPrefs.email[key];
    }
  }

  // Valida estrutura de push
  if (preferences.push) {
    validPreferences.push = {};
    for (const key in defaultPrefs.push) {
      validPreferences.push[key] = typeof preferences.push[key] === 'boolean' 
        ? preferences.push[key] 
        : defaultPrefs.push[key];
    }
  }

  // Valida notificações inApp
  if (typeof preferences.inApp === 'boolean') {
    validPreferences.inApp = preferences.inApp;
  }

  // Valida frequência
  if (['immediately', 'daily', 'weekly'].includes(preferences.frequency)) {
    validPreferences.frequency = preferences.frequency;
  }

  // Valida quiet hours
  if (preferences.quietHours) {
    validPreferences.quietHours = {
      enabled: typeof preferences.quietHours.enabled === 'boolean' 
        ? preferences.quietHours.enabled 
        : defaultPrefs.quietHours.enabled,
      start: this._validateTime(preferences.quietHours.start) || defaultPrefs.quietHours.start,
      end: this._validateTime(preferences.quietHours.end) || defaultPrefs.quietHours.end
    };
  }

  return validPreferences;
}

/**
 * Valida formato de hora (HH:MM)
 */
_validateTime(timeString) {
  if (!timeString) return null;
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(timeString) ? timeString : null;
}

  /**
   * Calcula tempo restante de forma legível
   */
  _getTimeRemaining(targetDate) {
    const now = new Date();
    const diff = targetDate - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) {
      const minutes = Math.floor(diff / (1000 * 60));
      return `em ${minutes} minuto${minutes !== 1 ? 's' : ''}`;
    } else if (hours < 24) {
      return `em ${hours} hora${hours !== 1 ? 's' : ''}`;
    } else {
      const days = Math.floor(hours / 24);
      return `em ${days} dia${days !== 1 ? 's' : ''}`;
    }
  }

}

module.exports = new NotificationService();