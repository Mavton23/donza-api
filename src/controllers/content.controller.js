const { SharedContent, StudyGroupMember } = require('../models');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/file-upload.service');
const { 
  logContentUpload, 
  logLinkShared, 
  logContentUpdate, 
  logContentDelete, 
  logContentDownload 
} = require('../services/activity-log.service');
const notificationService = require('../services/notification.service');
const { sequelize } = require('../configs/db');
const logger = require('../utils/logger');

module.exports = {
  uploadContent: async (req, res, next) => {
    try {
      const { groupId } = req.params;
      const { title, description } = req.body;
      const userId = req.user.userId;

      // Verificar se o grupo existe e o usuário tem permissão
      const membership = await StudyGroupMember.findOne({
        where: { groupId, userId },
        attributes: ['role', 'status']
      });

      if (!membership || membership.status !== 'active') {
        throw new ForbiddenError('Acesso restrito a membros ativos do grupo');
      }

      // Processar upload
      let fileUrl, fileType;
      if (req.file) {
        const result = await uploadToCloudinary(req.file, {
          folder: `groups/${groupId}/contents`,
          resource_type: 'auto'
        });
        fileUrl = result.secure_url;
        fileType = result.resource_type;
      }

      // Criar o conteúdo
      const content = await SharedContent.create({
        title,
        description,
        fileUrl,
        fileType: fileType || 'link',
        externalUrl: req.body.externalUrl,
        groupId,
        uploaderId: userId
      });

      // Log da atividade
      await logContentUpload({
        userId,
        groupId,
        contentId: content.contentId
      });

      try {
        await notificationService.notifyContentUploaded(
          groupId,
          content.contentId,
          userId
        );
      } catch (error) {
        logger.error(
          'Erro ao notificar upload de conteúdo:',
          error instanceof Error ? error.message : error
        );
      }

      res.status(201).json({
        success: true,
        data: await content.reload({ include: ['uploader'] })
      });
    } catch (error) {
      next(error);
    }
  },

  addLink: async (req, res, next) => {
    const transaction = await sequelize.transaction();

    try {
      const { groupId } = req.params;
      const { title, description, url } = req.body;
      const { userId } = req.user;

      const membership = await StudyGroupMember.findOne({
        where: { groupId, userId },
        attributes: ['role', 'status']
      }, { transaction });

      if (!membership || membership.status !== 'active') {
        throw new ForbiddenError('Acesso restrito a membros ativos do grupo');
      }

      const content = await SharedContent.create({
        title,
        description,
        fileType: 'link',
        externalUrl: url,
        groupId,
        uploaderId: userId
      }, { transaction });

      await logLinkShared({
        userId,
        groupId,
        contentId: content.contentId
      });

      try {
        await notificationService.notifyLinkAdded(
          groupId,
          content.contentId,
          userId
        );
      } catch (error) {
        logger.error(
          'Erro ao notificar adição de link:',
          error instanceof Error ? error.message : error
        );
      }

      await transaction.commit();

      res.status(201).json({
        success: true,
        data: await content.reload({ include: ['uploader'] })
      });
    } catch (error) {
      console.log("ERROR: ", error instanceof Error ? error.message : error);
      await transaction.rollback();
      next(error);
    }
  },

  listContents: async (req, res, next) => {
    try {
      const { groupId } = req.params;
      const userId = req.user.userId;

      // Verificar se o usuário é membro do grupo
      const isMember = await StudyGroupMember.findOne({
        where: { groupId, userId, status: 'active' }
      });

      if (!isMember) {
        throw new ForbiddenError('Acesso restrito a membros do grupo');
      }

      const contents = await SharedContent.findAll({
        where: { groupId },
        order: [['createdAt', 'DESC']],
        include: [{
          association: 'uploader',
          attributes: ['userId', 'username', 'avatarUrl']
        }]
      });

      res.json({
        success: true,
        data: contents
      });
    } catch (error) {
      next(error);
    }
  },

  getContent: async (req, res, next) => {
    try {
      const { contentId } = req.params;
      const userId = req.user.userId;

      const content = await SharedContent.findByPk(contentId, {
        include: [{
          association: 'uploader',
          attributes: ['userId', 'username', 'avatarUrl']
        }, {
          association: 'group',
          attributes: ['groupId'],
          include: [{
            association: 'members',
            where: { userId },
            required: true,
            attributes: []
          }]
        }]
      });

      if (!content) {
        throw new NotFoundError('Conteúdo não encontrado');
      }

      res.json({
        success: true,
        data: content
      });
    } catch (error) {
      next(error);
    }
  },

  updateContent: async (req, res, next) => {
    try {
      const { contentId } = req.params;
      const { title, description } = req.body;
      const userId = req.user.userId;

      const content = await SharedContent.findByPk(contentId, {
        include: [{
          association: 'group',
          include: [{
            association: 'members',
            where: { userId },
            required: true
          }]
        }]
      });

      if (!content) {
        throw new NotFoundError('Conteúdo não encontrado');
      }

      // Verificar se é o uploader ou líder/co-líder
      const isUploader = content.uploaderId === userId;
      const isLeaderOrCoLeader = content.group.members.some(
        m => m.userId === userId && ['leader', 'co-leader'].includes(m.role)
      );

      if (!isUploader && !isLeaderOrCoLeader) {
        throw new ForbiddenError('Sem permissão para editar este conteúdo');
      }

      // Atualizar
      await content.update({
        title: title || content.title,
        description: description || content.description
      });

      await logContentUpdate({
        userId,
        groupId: content.groupId,
        contentId 
      });

      // Notificar membros
      const members = await StudyGroupMember.findAll({
        where: { 
          groupId: content.groupId,
          userId: { [Op.ne]: userId }
        },
        attributes: ['userId']
      });

      try {
        await Promise.all(members.map(member =>
          notificationService.createNotification(
            member.userId,
            'STUDY_GROUP_CONTENT_UPDATED',
            {
              relatedEntityId: contentId,
              metadata: {
                groupId: content.groupId,
                contentId: content.contentId,
                contentTitle: content.title,
                contentType: content.fileType,
                updaterId: userId,
                updaterUsername: req.user.username,
                updatedAt: new Date().toISOString()
              }
            }
          )
        ));
      } catch (error) {
        logger.error(
          'Erro ao notificar atualização de conteúdo:',
          error instanceof Error ? error.message : error
        );
      }

      res.json({
        success: true,
        data: await content.reload({ include: ['uploader'] })
      });
    } catch (error) {
      next(error);
    }
  },

  deleteContent: async (req, res, next) => {
    const transaction = await sequelize.transaction();

    try {
      const { contentId } = req.params;
      const userId = req.user.userId;

      const content = await SharedContent.findByPk(contentId, {
        include: [{
          association: 'group',
          include: [{
            association: 'members',
            where: { userId },
            required: true
          }]
        }],
        transaction
      });

      if (!content) {
        throw new NotFoundError('Conteúdo não encontrado');
      }

      // Verificar se é líder/co-líder
      const isLeaderOrCoLeader = content.group.members.some(
        m => m.userId === userId && ['leader', 'co-leader'].includes(m.role)
      );

      if (!isLeaderOrCoLeader) {
        throw new ForbiddenError('Apenas líderes podem deletar conteúdos');
      }

      await deleteFromCloudinary(contentId);

      const members = await StudyGroupMember.findAll({
        where: { 
          groupId: content.groupId
        },
        attributes: ['userId'],
        transaction
      });

      try {
        await Promise.all(members.map(member =>
          notificationService.createNotification(
            member.userId,
            'STUDY_GROUP_CONTENT_DELETED',
            {
              relatedEntityId: content.groupId,
              metadata: {
                groupId: content.groupId,
                contentTitle: content.title,
                deleterId: userId,
                deleterUsername: req.user.username,
                deletedAt: new Date().toISOString()
              }
            }
          )
        ));
      } catch (error) {
        logger.error('Erro ao criar notificações para membros:', error instanceof Error ? error.message : error);
      }

      await content.destroy({ transaction });

      await logContentDelete({
        userId,
        groupId: content.groupId,
        contentId 
      });

      await transaction.commit();

      res.json({
        success: true,
        message: 'Conteúdo deletado com sucesso'
      });
    } catch (error) {
      await transaction.rollback();
      console.log("ERROR: ", error instanceof Error ? error.message : error);
      next(error);
    }
  },

  registerDownload: async (req, res, next) => {
    try {
      const { contentId } = req.params;
      const userId = req.user.userId;

      const content = await SharedContent.findByPk(contentId, {
        include: [{
          association: 'group',
          include: [{
            association: 'members',
            where: { userId },
            required: true
          }]
        }]
      });

      if (!content) {
        throw new NotFoundError('Conteúdo não encontrado');
      }

      // Incrementar contador de downloads
      await content.increment('downloadCount');

      await logContentDownload({
        userId,
        groupId: content.groupId,
        contentId
      });

      res.json({
        success: true,
        data: { downloadCount: content.downloadCount + 1 }
      });
    } catch (error) {
      next(error);
    }
  }
};