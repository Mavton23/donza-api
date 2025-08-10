const { DiscussionTopic, DiscussionReply, ReplyVote, StudyGroupMember } = require('../models');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const notificationService = require('../services/notification.service');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

module.exports = {
  createTopic: async (req, res, next) => {
    try {
      const { groupId } = req.params;
      const { title, content, tags } = req.body;

      const isMember = await StudyGroupMember.findOne({ 
        where: { groupId, userId: req.user.userId } 
      });
      if (!isMember) throw new ForbiddenError('Apenas membros podem criar tópicos');

      const topic = await DiscussionTopic.create({
        title,
        content,
        tags,
        groupId,
        authorId: req.user.userId
      });

      try {
        await notificationService.notifyTopicCreated(topic.topicId);
      } catch (error) {
        logger.error(
          'Erro ao notificar criação de tópico:',
          error instanceof Error ? error.message : error
        );
      }


      res.status(201).json({
        success: true,
        data: topic
      });
    } catch (error) {
      next(error);
    }
  },

  listTopics: async (req, res, next) => {
    try {
      const { groupId } = req.params;
      const { page = 1, limit = 20, sort = 'newest', search } = req.query;
      
      const offset = (page - 1) * limit;
      const order = sort === 'newest' 
        ? [['createdAt', 'DESC']] 
        : [['createdAt', 'ASC']];
      
      const where = { groupId };
      if (search) {
        where[Op.or] = [
          { title: { [Op.iLike]: `%${search}%` } },
          { content: { [Op.iLike]: `%${search}%` } },
          { tags: { [Op.contains]: [search] } }
        ];
      }

      const { count, rows } = await DiscussionTopic.findAndCountAll({
        where,
        order,
        limit: parseInt(limit),
        offset,
        include: [
          { 
            association: 'author',
            attributes: ['userId', 'username', 'avatar']
          },
          {
            association: 'replies',
            attributes: ['replyId'],
            required: false
          }
        ]
      });

      res.json({
        success: true,
        data: {
          topics: rows,
          pagination: {
            total: count,
            page: parseInt(page),
            totalPages: Math.ceil(count / limit)
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  updateTopic: async (req, res, next) => {
    try {
      const { topicId } = req.params;
      const updates = req.body;

      const topic = await DiscussionTopic.findByPk(topicId);
      if (!topic) throw new NotFoundError('Tópico não encontrado');

      // Verifica se é o autor ou tem permissão especial
      const isAuthor = topic.authorId === req.user.userId;
      const isLeader = await StudyGroupMember.findOne({
        where: { 
          groupId: topic.groupId, 
          userId: req.user.userId,
          role: { [Op.in]: ['leader', 'co-leader'] }
        }
      });

      if (!isAuthor && !isLeader) {
        throw new ForbiddenError('Sem permissão para editar este tópico');
      }

      // Filtra campos permitidos para atualização
      const allowedUpdates = ['title', 'content', 'tags'];
      if (isLeader) {
        allowedUpdates.push('isPinned', 'isClosed');
      }

      const filteredUpdates = Object.keys(updates)
        .filter(key => allowedUpdates.includes(key))
        .reduce((obj, key) => {
          obj[key] = updates[key];
          return obj;
        }, {});

      await topic.update(filteredUpdates);

      const members = await StudyGroupMember.findAll({
        where: { 
          groupId: topic.groupId,
          userId: { [Op.ne]: req.user.userId }
        },
        attributes: ['userId']
      });

      try {
        await Promise.all(members.map(member =>
          notificationService.createNotification(
            member.userId,
            'DISCUSSION_TOPIC_UPDATED',
            {
              relatedEntityId: topicId,
              metadata: {
                groupId: topic.groupId,
                topicId: topic.topicId,
                topicTitle: topic.title,
                updaterId: req.user.userId,
                updaterUsername: req.user.username,
                changes: Object.keys(filteredUpdates).join(', '),
                updatedAt: new Date().toISOString()
              }
            }
          )
        ));
      } catch (error) {
        console.error(
          'Erro ao notificar atualização de tópico:',
          error instanceof Error ? error.message : error
        );
      }


      res.json({
        success: true,
        data: topic
      });
    } catch (error) {
      next(error);
    }
  },

  createReply: async (req, res, next) => {
    try {
      const { topicId } = req.params;
      const { content } = req.body;

      const topic = await DiscussionTopic.findByPk(topicId);
      if (!topic) throw new NotFoundError('Tópico não encontrado');

      if (topic.isClosed) {
        throw new ForbiddenError('Tópico fechado para novas respostas');
      }

      // Verifica restrições para novos membros
      const membership = await StudyGroupMember.findOne({
        where: { 
          groupId: topic.groupId, 
          userId: req.user.userId 
        }
      });

      if (membership.preventiveModeration?.newMemberRestrictions?.contentCreation) {
        throw new ForbiddenError('Novos membros não podem postar respostas até completarem o período de avaliação');
      }

      const reply = await DiscussionReply.create({
        content,
        topicId,
        authorId: req.user.userId
      });

      try {
        await notificationService.notifyReplyAdded(reply.replyId);
      } catch (error) {
        console.error(
          'Erro ao notificar adição de resposta:',
          error instanceof Error ? error.message : error
        );
      }

      let participants = [];
      try {
        participants = await DiscussionReply.findAll({
          where: { 
            topicId,
            authorId: { 
              [Op.notIn]: [req.user.userId, topic.authorId]
            }
          },
          attributes: ['authorId'],
          group: ['authorId']
        });
      } catch (error) {
        logger.error(
          'Erro ao buscar participantes do tópico:',
          error instanceof Error ? error.message : error
        );
      }

      try {
        await Promise.all(participants.map(participant =>
          notificationService.createNotification(
            participant.authorId,
            'DISCUSSION_REPLY_ADDED',
            {
              relatedEntityId: reply.replyId,
              metadata: {
                groupId: topic.groupId,
                topicId: topic.topicId,
                topicTitle: topic.title,
                replyId: reply.replyId,
                replyPreview: reply.content.substring(0, 50),
                authorId: req.user.userId,
                authorUsername: req.user.username,
                repliedAt: new Date().toISOString()
              }
            }
          )
        ));
      } catch (error) {
        logger.error(
          'Erro ao notificar participantes sobre nova resposta:',
          error instanceof Error ? error.message : error
        );
      }

      res.status(201).json({
        success: true,
        data: reply
      });
    } catch (error) {
      next(error);
    }
  },

  updateReply: async (req, res, next) => {
    try {
      const { replyId } = req.params;
      const { content, isSolution } = req.body;

      const reply = await DiscussionReply.findByPk(replyId, {
        include: {
          association: 'topic',
          attributes: ['groupId']
        }
      });
      if (!reply) throw new NotFoundError('Resposta não encontrada');

      // Verifica permissões
      const isAuthor = reply.authorId === req.user.userId;
      const isLeader = await StudyGroupMember.findOne({
        where: { 
          groupId: reply.topic.groupId, 
          userId: req.user.userId,
          role: ['leader', 'co-leader', 'moderator']
        }
      });

      if (!isAuthor && !isLeader) {
        throw new ForbiddenError('Sem permissão para editar esta resposta');
      }

      // Atualizações permitidas
      const updates = {};
      if (content !== undefined && isAuthor) {
        updates.content = content;
      }
      
      // Marcar como solução (apens líderes ou moderadores)
      if (isSolution !== undefined && isLeader) {
        updates.isSolution = isSolution;
        
        // Se marcado como solução, remove marcação de outras respostas
        if (isSolution) {
          await DiscussionReply.update(
            { isSolution: false },
            { 
              where: { 
                topicId: reply.topicId,
                isSolution: true 
              } 
            }
          );
        }
      }

      await reply.update(updates);

      res.json({
        success: true,
        data: reply
      });
    } catch (error) {
      next(error);
    }
  },

  voteReply: async (req, res, next) => {
    try {
      const { replyId } = req.params;
      const { userId } = req.user;
      const { voteType } = req.body;

      if (!['up', 'down'].includes(voteType)) {
        return res.status(400).json({ success: false, message: 'Tipo de voto inválido' });
      }

      const reply = await DiscussionReply.findByPk(replyId);
      
      if (!reply) throw new NotFoundError('Resposta não encontrada');

      // Verifica se o usuário pode votar
      if (reply.authorId === req.user.userId) {
        throw new ForbiddenError('Você não pode votar na sua própria resposta');
      }

      const [vote, created] = await ReplyVote.findOrCreate({
        where: { replyId, userId: req.user.userId },
        defaults: { voteType }
      });

      if (!created) {
        // Se votar no mesmo tipo, remove o voto
        if (vote.voteType === voteType) {
          await vote.destroy();
        } else {
          // Caso contrário, atualiza o voto
          await vote.update({ voteType });
        }
      }

      // Recalcula votos
      const [upvotes, downvotes] = await Promise.all([
        ReplyVote.count({ where: { replyId, voteType: 'up' } }),
        ReplyVote.count({ where: { replyId, voteType: 'down' } })
      ]);

      await reply.update({ 
        upvotes,
        downvotes 
      });

      const topic = await DiscussionTopic.findByPk(reply.topicId, {
        attributes: ['title']
      });

      let replyAuthor;

      if (reply.authorId !== userId) {
        try {
          await notificationService.createNotification(
            replyAuthor.userId,
            'DISCUSSION_REPLY_VOTED',
            {
              relatedEntityId: replyId,
              metadata: {
                topicId: reply.topicId,
                topicTitle: topic.title,
                replyId: reply.replyId,
                voterId: userId,
                voterUsername: req.user.username,
                votedAt: new Date().toISOString(),
                voteType: voteType
              }
            }
          );
        } catch (error) {
          logger.error(
            'Erro ao notificar autor da resposta sobre voto:',
            error instanceof Error ? error.message : error
          );
        }
      }

      let userVote = null;
      if (created || (!created && vote.voteType === voteType)) {
        userVote = voteType;
      }


      res.json({
        success: true,
        data: { 
          upvotes,
          downvotes,
          userVote
        }
      });
    } catch (error) {
      logger.error("ERROR: ", error instanceof Error ? error.message : error);
      next(error);
    }
  }
};