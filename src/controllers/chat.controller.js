const { StudyGroupMember, GroupChat, ChatMessage, ChatMember, User } = require('../models');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const notificationService = require('../services/notification.service');
const { Op } = require('sequelize');
const { sequelize } = require('../configs/db');
const { v4: uuidv4 } = require('uuid');

module.exports = {
    getCurrentTopic: async (req, res, next) => {
        try {
            const { groupId } = req.params;
            
            const groupChat = await GroupChat.findOne({
                where: { groupId },
                include: [{
                    model: User,
                    as: 'topicSetter',
                    attributes: ['userId', 'username']
                }]
            });

            if (!groupChat) {
                return res.json({
                    success: true,
                    data: null
                });
            }

            res.json({
                success: true,
                data: {
                    topic: groupChat.currentTopic,
                    setAt: groupChat.topicSetAt,
                    setBy: groupChat.topicSetter
                }
            });
        } catch (error) {
            next(error);
        }
    },

    setTopic: async (req, res, next) => {
        const transaction = await sequelize.transaction();
        try {
            const { groupId } = req.params;
            const { topic } = req.body;
            const userId = req.user.userId;

            if (!topic || topic.trim().length < 5) {
                await transaction.rollback();
                throw new BadRequestError('O tópico deve ter pelo menos 5 caracteres');
            }

            // Buscar o chat do grupo
            const groupChat = await GroupChat.findOne({
                where: { groupId },
                transaction
            });

            if (!groupChat) {
                await transaction.rollback();
                throw new NotFoundError('Chat do grupo não encontrado');
            }

            // Verificar se apenas líderes podem definir tópicos
            if (groupChat.discussionSettings.onlyLeadersCanSetTopic) {
                const member = await StudyGroupMember.findOne({
                    where: {
                        groupId,
                        userId,
                        role: { [Op.in]: ['leader', 'co-leader'] }
                    },
                    transaction
                });

                if (!member) {
                    await transaction.rollback();
                    throw new ForbiddenError('Apenas líderes podem definir tópicos');
                }
            }

            // Verificar tempo mínimo entre mudanças de tópico
            if (groupChat.topicSetAt) {
                const minDuration = groupChat.discussionSettings.minTopicDuration || 15;
                const minTime = new Date(Date.now() - minDuration * 60 * 1000);
                
                if (groupChat.topicSetAt > minTime) {
                    await transaction.rollback();
                    throw new BadRequestError(`Aguarde ${minDuration} minutos antes de mudar o tópico novamente`);
                }
            }

            // Atualizar o tópico
            await groupChat.update({
                currentTopic: topic.trim(),
                topicSetAt: new Date(),
                topicSetBy: userId
            }, { transaction });

            // Notificar após definir o novo tópico
            try {
              await notificationService.notifyStudyGroupTopicChanged(
                groupId,
                userId,
                topic
              );
            } catch (error) {
              console.log(error instanceof Error ? error.message : error);
            }

            // Criar mensagem de sistema sobre a mudança de tópico
            await ChatMessage.create({
                chatId: groupChat.chatId,
                senderId: userId,
                content: `O tópico do debate foi alterado para: "${topic}"`,
                type: 'topic_change',
                metadata: {
                    previousTopic: groupChat.currentTopic,
                    newTopic: topic
                }
            }, { transaction });

            await transaction.commit();

            res.status(201).json({
                success: true,
                data: {
                    topic,
                    setAt: new Date(),
                    setBy: {
                        userId: req.user.userId,
                        username: req.user.username
                    }
                }
            });

        } catch (error) {
            await transaction.rollback();
            next(error);
        }
    },

    getTopicHistory: async (req, res, next) => {
        try {
            const { groupId } = req.params;
            const { limit = 10 } = req.query;

            const groupChat = await GroupChat.findOne({
                where: { groupId },
                attributes: ['chatId']
            });

            if (!groupChat) {
                return res.json({
                    success: true,
                    data: []
                });
            }

            const topicChanges = await ChatMessage.findAll({
                where: {
                    chatId: groupChat.chatId,
                    type: 'topic_change'
                },
                include: [{
                    model: User,
                    as: 'sender',
                    attributes: ['userId', 'username']
                }],
                order: [['createdAt', 'DESC']],
                limit: parseInt(limit)
            });

            const history = topicChanges.map(msg => ({
                topic: msg.metadata.newTopic,
                previousTopic: msg.metadata.previousTopic,
                changedAt: msg.createdAt,
                changedBy: msg.sender
            }));

            res.json({
                success: true,
                data: history
            });
        } catch (error) {
            next(error);
        }
    },

    getMessages: async (req, res, next) => {
        try {
            const { groupId } = req.params;
            const { limit = 50, before = null, onlyOnTopic = false } = req.query;

            const groupChat = await GroupChat.findOne({
                where: { groupId },
                attributes: ['chatId']
            });

            if (!groupChat) {
                return res.json({
                    success: true,
                    data: [],
                    hasMore: false
                });
            }

            const queryOptions = {
                where: { 
                    chatId: groupChat.chatId,
                    ...(before && { createdAt: { [Op.lt]: new Date(before) } }),
                    ...(onlyOnTopic === 'true' && { isOnTopic: true })
                },
                include: [{
                    model: User,
                    as: 'sender',
                    attributes: ['userId', 'username', 'avatarUrl']
                }],
                order: [['createdAt', 'DESC']],
                limit: parseInt(limit)
            };

            const messages = await ChatMessage.findAll(queryOptions);
            const hasMore = messages.length === parseInt(limit);

            res.json({
                success: true,
                data: messages,
                hasMore,
                nextCursor: hasMore ? messages[messages.length - 1].createdAt.toISOString() : null
            });
        } catch (error) {
            next(error);
        }
    },

    sendMessage: async (req, res, next) => {
        const transaction = await sequelize.transaction();
        try {
            const { groupId } = req.params;
            const { content, replyToId } = req.body;
            const userId = req.user.userId;

            // Verificar se o usuário é membro do grupo
            const isGroupMember = await StudyGroupMember.findOne({
                where: { 
                    groupId,
                    userId,
                    status: 'active'
                },
                transaction
            });

            if (!isGroupMember) {
                await transaction.rollback();
                throw new ForbiddenError('Acesso restrito a membros ativos do grupo');
            }

            // Verificar/Criar o GroupChat
            const [groupChat] = await GroupChat.findOrCreate({
                where: { groupId },
                defaults: {
                    chatId: uuidv4(),
                    createdAt: new Date()
                },
                transaction
            });

            // Verificar se há um tópico ativo
            if (!groupChat.currentTopic) {
                await transaction.rollback();
                throw new BadRequestError('Defina um tópico antes de enviar mensagens');
            }

            // Verificar/Criar o ChatMember
            const [chatMember] = await ChatMember.findOrCreate({
                where: { 
                    chatId: groupChat.chatId,
                    userId 
                },
                defaults: {
                    lastSeen: new Date()
                },
                transaction
            });

            // Criar a mensagem
            const message = await ChatMessage.create({
                chatId: groupChat.chatId,
                senderId: userId,
                content,
                type: 'text',
                ...(replyToId && { replyToId })
            }, { transaction });

            // Atualizar último acesso
            await chatMember.update({ lastSeen: new Date() }, { transaction });

            // Atualizar última atividade do chat
            await groupChat.update({ lastActivity: new Date() }, { transaction });

            await notificationService.notifyStudyGroupNewMessage(
              groupId,
              message.messageId
            );

            await transaction.commit();

            res.status(201).json({
                success: true,
                data: {
                    ...message.toJSON(),
                    sender: {
                        userId: req.user.userId,
                        username: req.user.username,
                        avatarUrl: req.user.avatarUrl
                    }
                }
            });

        } catch (error) {
            await transaction.rollback();
            next(error);
        }
    },

    markAsOffTopic: async (req, res, next) => {
        const transaction = await sequelize.transaction();
        try {
            const { messageId } = req.params;
            const userId = req.user.userId;

            // Verificar se o usuário tem permissão (líder/co-líder)
            const message = await ChatMessage.findByPk(messageId, {
                include: [{
                    model: GroupChat,
                    include: [{
                        model: StudyGroupMember,
                        where: {
                            userId,
                            role: { [Op.in]: ['leader', 'co-leader'] }
                        }
                    }]
                }],
                transaction
            });

            if (!message) {
                await transaction.rollback();
                throw new NotFoundError('Mensagem não encontrada ou sem permissão');
            }

            await message.update({
                isOnTopic: false
            }, { transaction });

            const members = await StudyGroupMember.findAll({
              where: { 
                groupId: message.GroupChat.groupId,
                userId: { [Op.ne]: userId } // Não notificar quem marcou
              },
              attributes: ['userId']
            }, { transaction });

            await Promise.all(members.map(member =>
              notificationService.createNotification(
                member.userId,
                'STUDY_GROUP_MESSAGE_OFF_TOPIC',
                {
                  relatedEntityId: messageId,
                  metadata: {
                    groupId: message.GroupChat.groupId,
                    moderatorId: userId,
                    moderatorUsername: req.user.username,
                    markedAt: new Date().toISOString()
                  }
                }
              )
            ));

            await transaction.commit();

            res.json({
                success: true,
                message: 'Mensagem marcada como fora do tópico'
            });

        } catch (error) {
            await transaction.rollback();
            next(error);
        }
    },

  editMessage: async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
      const { messageId } = req.params;
      const { content } = req.body;
      const userId = req.user.userId;

      // Busca a mensagem
      const message = await ChatMessage.findByPk(messageId, { transaction });
      
      if (!message) {
        await transaction.rollback();
        throw new NotFoundError('Mensagem não encontrada');
      }

      // Verifica se é o autor
      if (message.senderId !== userId) {
        await transaction.rollback();
        throw new ForbiddenError('Somente o autor pode editar a mensagem');
      }

      // Atualiza a mensagem
      await message.update({
        content,
        edited: true
      }, { transaction });

      const members = await StudyGroupMember.findAll({
        where: { 
          groupId: message.GroupChat.groupId,
          userId: { [Op.ne]: userId } // Não notificar o autor
        },
        attributes: ['userId']
      }, { transaction });

      await Promise.all(members.map(member =>
        notificationService.createNotification(
          member.userId,
          'STUDY_GROUP_MESSAGE_EDITED',
          {
            relatedEntityId: messageId,
            metadata: {
              groupId: message.GroupChat.groupId,
              editorId: userId,
              editorUsername: req.user.username,
              editedAt: new Date().toISOString()
            }
          }
        )
      ));

      await transaction.commit();

      res.json({
        success: true,
        data: {
          ...message.toJSON(),
          sender: {
            userId: req.user.userId,
            username: req.user.username,
            avatarUrl: req.user.avatarUrl
          }
        }
      });

    } catch (error) {
      await transaction.rollback();
      next(error);
    }
  },

  markAsRead: async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
      const { messageId } = req.params;
      const userId = req.user.userId;

      // Busca a mensagem
      const message = await ChatMessage.findByPk(messageId, { transaction });
      
      if (!message) {
        await transaction.rollback();
        throw new NotFoundError('Mensagem não encontrada');
      }

      // Verifica se o usuário já marcou como lida
      const readBy = message.readBy || [];
      if (!readBy.includes(userId)) {
        readBy.push(userId);
        
        // Atualiza a mensagem
        await message.update({
          readBy
        }, { transaction });
      }

      // Atualiza lastSeen do membro no chat
      const groupChat = await GroupChat.findOne({
        where: { chatId: message.chatId },
        transaction
      });

      if (groupChat) {
        await ChatMember.update({
          lastSeen: new Date()
        }, {
          where: {
            chatId: groupChat.chatId,
            userId
          },
          transaction
        });
      }

      await transaction.commit();

      res.json({
        success: true,
        message: 'Mensagem marcada como lida'
      });

    } catch (error) {
      await transaction.rollback();
      next(error);
    }
  },

    deleteMessage: async (req, res, next) => {
        try {
            const { messageId } = req.params;
            const { userId } = req.user;
            const { role } = req.role;
            const message = await ChatMessage.findByPk(messageId);

            if (!message) throw new NotFoundError('Mensagem não encontrada');

            // Verifica se é o autor ou líder
            if (message.senderId !== userId && role !== 'leader') {
              throw new ForbiddenError('Sem permissão para excluir esta mensagem');
            }

            await message.destroy();

            const members = await StudyGroupMember.findAll({
              where: { 
                groupId: message.GroupChat.groupId,
                userId: { [Op.ne]: userId } // Não notificar quem deletou
              },
              attributes: ['userId']
            });

            await Promise.all(members.map(member =>
              notificationService.createNotification(
                member.userId,
                'STUDY_GROUP_MESSAGE_DELETED',
                {
                  relatedEntityId: message.GroupChat.groupId,
                  metadata: {
                    groupId: message.GroupChat.groupId,
                    moderatorId: userId,
                    moderatorUsername: req.user.username,
                    deletedAt: new Date().toISOString()
                  }
                }
              )
            ));
            res.json({ success: true, message: 'Mensagem removida' });
        } catch (error) {
            next(error);
        }
    },

    getActiveMembers: async (req, res, next) => {
      try {
        const { groupId } = req.params;
        const { lastMinutes = 5 } = req.query;

        const activeThreshold = new Date(Date.now() - lastMinutes * 60 * 1000);

        // Membros ativos do grupo
        const activeMembers = await StudyGroupMember.findAll({
          where: { 
            groupId,
            status: 'active',
            [Op.or]: [
              { lastActiveAt: { [Op.gte]: activeThreshold } },
              { 
                lastActiveAt: null,
                joinedAt: { [Op.gte]: activeThreshold }
              }
            ]
          },
          include: [{
            model: User,
            as: 'user',
            attributes: ['userId', 'username', 'avatarUrl']
          }]
        });

        // Buscar os dados específicos do chat
        const chatMembers = await ChatMember.findAll({
          where: { chatId: groupId },
          include: [{
            model: User,
            attributes: ['userId']
          }]
        });

        // Combinando os dados
        const formattedMembers = activeMembers.map(member => {
          const chatData = chatMembers.find(cm => cm.userId === member.userId);
          
          return {
            userId: member.user.userId,
            username: member.user.username,
            avatarUrl: member.user.avatarUrl,
            role: member.role,
            lastActiveAt: member.lastActiveAt,
            lastSeen: chatData?.lastSeen || null,
            muteUntil: chatData?.muteUntil || null,
            isOnline: member.lastActiveAt >= activeThreshold
          };
        });

        res.json({
          success: true,
          data: formattedMembers
        });
      } catch (error) {
        next(error);
      }
    },
      
      updateMemberStatus: async (req, res, next) => {
        try {
          const { groupId } = req.params;
          const { isActive } = req.body;
      
          await ChatMember.update(
            { 
              lastSeen: new Date(),
              ...(isActive !== undefined && { isActive })
            },
            { where: { chatId: groupId, userId: req.user.userId } }
          );
      
          res.json({ success: true });
        } catch (error) {
          next(error);
        }
    },
}