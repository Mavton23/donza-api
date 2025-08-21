const { Community, CommunityMember, CommunityMemberRole, CommunityRole, User, CommunityPost, StudyGroup, CommunityInvite, PostReaction, PostAttachment, Tag, LearningObjective, PostComment, PostView } = require('../models');
const { updateReactionCounters } = require('../utils/reactionCounters');
const { BadRequestError, NotFoundError, ForbiddenError, ConflictError } = require('../utils/errors');
const { uploadToCloudinary } = require('../services/file-upload.service');
const { Op } = require('sequelize');
const { sequelize } = require('../configs/db')
const notificationService = require('../services/notification.service');


async function createDefaultCommunityRoles(communityId, transaction) {
  const defaultRoles = [
    {
      name: 'Admin',
      permissions: {
        manageCommunity: true,
        managePosts: true,
        manageMembers: true,
        manageEvents: true,
        manageRoles: true
      },
      isDefault: false
    },
    {
      name: 'Moderator',
      permissions: {
        managePosts: true,
        manageMembers: false,
        manageEvents: true
      },
      isDefault: false
    },
    {
      name: 'Member',
      permissions: {
        createPosts: true,
        joinEvents: true
      },
      isDefault: true
    }
  ];

  await Promise.all(
    defaultRoles.map(role => 
      CommunityRole.create({
        communityId,
        ...role
      }, { transaction })
    )
  );
}

module.exports = {
  /**
 * @typedef {Object} CommunityListResponse
 * @property {string} communityId - ID da comunidade
 * @property {string} name - Nome da comunidade
 * @property {string} description - Descrição da comunidade
 * @property {string} coverImage - URL da imagem de capa
 * @property {Date} createdAt - Data de criação
 * @property {Object} creator - Criador da comunidade
 * @property {string} creator.userId - ID do criador
 * @property {string} creator.username - Nome do criador
 * @property {string} creator.avatarUrl - Avatar do criador
 * @property {Object} stats - Estatísticas
 * @property {number} stats.members - Número de membros
 * @property {number} stats.posts - Número de posts
 * @property {boolean} isPublic - Se a comunidade é pública
 */

/**
 * Obtém comunidades com filtros por visibilidade e acesso
 * @param {Object} req - Requisição HTTP
 * @param {Object} req.query - Query parameters
 * @param {string} [req.query.search=''] - Termo de busca
 * @param {number} [req.query.page=1] - Página atual
 * @param {number} [req.query.limit=10] - Itens por página
 * @param {string} [req.query.visibility='public'] - 'public', 'private' ou 'all'
 * @param {Object} req.user - Usuário autenticado (opcional)
 * @param {string} req.user.userId - ID do usuário
 * @param {Object} res - Resposta HTTP
 * @param {Function} next - Próximo middleware
 * @returns {Promise<CommunityListResponse[]>}
 */
getCommunities: async (req, res, next) => {
  try {
    const { 
      search = '', 
      page = 1, 
      limit = 10,
      visibility = 'all'
    } = req.query;
    const offset = (page - 1) * limit;
    const userId = req.user?.userId;

    // Condição base de busca
    const whereCondition = {
      status: 'active',
      [Op.or]: [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
        { shortDescription: { [Op.iLike]: `%${search}%` } }
      ]
    };

    // Lógica de visibilidade
    if (visibility === 'public') {
      whereCondition.isPublic = true;
    } else if (visibility === 'private') {
      whereCondition.isPublic = false;
      
      if (userId) {
        whereCondition[Op.or] = [
          ...(whereCondition[Op.or] || []),
          { creatorId: userId },
          { 
            '$members.userId$': userId,
            '$members.CommunityMember.status$': 'active'
          }
        ];
      } else {
        return res.json({
          success: true,
          total: 0,
          page: parseInt(page),
          totalPages: 0,
          limit: parseInt(limit),
          data: []
        });
      }
    } else if (visibility === 'all' && userId) {
      whereCondition[Op.or] = [
        { isPublic: true },
        { 
          [Op.and]: [
            { isPublic: false },
            {
              [Op.or]: [
                { creatorId: userId },
                { 
                  '$members.userId$': userId,
                  '$members.CommunityMember.status$': 'active'
                }
              ]
            }
          ]
        }
      ];
    }

    const options = {
      where: whereCondition,
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['userId', 'username', 'avatarUrl', 'role']
        },
        {
          model: User,
          as: 'members',
          attributes: [],
          through: {
            attributes: [],
            where: { status: 'active' }
          },
          required: false
        },
        {
          model: StudyGroup,
          as: 'studyGroups',
          attributes: [],
          required: false
        },
        {
          model: CommunityPost,
          as: 'posts',
          attributes: [],
          required: false
        }
      ],
      attributes: {
        include: [
          [sequelize.fn('COUNT', sequelize.col('members.userId')), 'membersCount'],
          [sequelize.fn('COUNT', sequelize.col('studyGroups.groupId')), 'studyGroupsCount'],
          [sequelize.fn('COUNT', sequelize.col('posts.postId')), 'postsCount']
        ]
      },
      group: ['Community.communityId', 'creator.userId'],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      subQuery: false
    };

    const result = await Community.findAndCountAll(options);

    const response = {
      total: result.count.length,
      page: parseInt(page),
      totalPages: Math.ceil(result.count.length / limit),
      limit: parseInt(limit),
      data: result.rows.map(community => ({
        communityId: community.communityId,
        name: community.name,
        slug: community.slug,
        shortDescription: community.shortDescription,
        description: community.description,
        coverImage: community.coverImage,
        thumbnailImage: community.thumbnailImage,
        isPublic: community.isPublic,
        membershipType: community.membershipType,
        createdAt: community.createdAt,
        creator: community.creator,
        rules: community.rules,
        tags: community.tags,
        stats: {
          members: parseInt(community.getDataValue('membersCount')) || 0,
          posts: parseInt(community.getDataValue('postsCount')) || 0,
          studyGroups: parseInt(community.getDataValue('studyGroupsCount')) || 0
        }
      }))
    };

    res.json({
      success: true,
      ...response
    });
  } catch (error) {
    console.error('Error in getCommunities:', error instanceof Error ? error.message : error);
    next(error);
  }
},

  createCommunity: async (req, res, next) => {

    const transaction = await sequelize.transaction();

    try {
      const {
        name,
        slug,
        description,
        shortDescription,
        isPublic,
        membershipType,
        tags,
        socialLinks,
        rules
      } = req.body;

      const parsedSocialLinks = typeof socialLinks === 'string' ? JSON.parse(socialLinks) : socialLinks;
      const parsedRules = typeof rules === 'string' ? JSON.parse(rules) : rules;
      const parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;

      let coverImageUrl, thumbnailImageUrl;
      
      if (req.files?.coverImage) {
        const result = await uploadToCloudinary(
          req.files.coverImage[0],
          'communities/cover',
          ['jpg', 'jpeg', 'png', 'webp']
        );
        coverImageUrl = result.secure_url;
      }

      if (req.files?.thumbnailImage) {
        const result = await uploadToCloudinary(
          req.files.thumbnailImage[0],
          'communities/thumbnail', 
          ['jpg', 'jpeg', 'png', 'webp']
        );
        thumbnailImageUrl = result.secure_url;
      }

      // Verificando se já existe a comunidade
      const existingCommunity = await Community.findOne({
        where: { slug },
        transaction
      });

      if (existingCommunity) {
        throw new BadRequestError('This community URL is already taken');
      }

      // Criação da comunidade
      const community = await Community.create({
        name,
        slug,
        description,
        shortDescription,
        isPublic: isPublic !== 'false',
        membershipType: membershipType || 'open',
        coverImage: coverImageUrl,
        thumbnailImage: thumbnailImageUrl,
        tags: parsedTags || [],
        socialLinks: parsedSocialLinks || {},
        rules: parsedRules || {},
        creatorId: req.user.userId,
        status: 'active'
      }, { transaction });

      // Adicionando o criador como admin (líder)
      await CommunityMember.create({
        communityId: community.communityId,
        userId: req.user.userId,
        role: 'admin',
        status: 'active'
      }, { transaction });

      // Criando hierarquia padrão da comunidade
      await createDefaultCommunityRoles(community.communityId, transaction);

      // Notificar o criador
      await notificationService.notifyCommunityCreated(community, req.user);

      await transaction.commit();

      res.status(201).json({
        success: true,
        data: {
          communityId: community.communityId,
          name: community.name,
          slug: community.slug,
          coverImage: community.coverImage
        }
      });

    } catch (error) {
      await transaction.rollback();
      console.log("ERRO NA CRIACAO DE COMUNIDADE: ", error instanceof Error ? error.message : null);
      next(error);
    }
  },

/**
 * @route GET /communities/:communityId/membership
 * @description Get user's membership details for a community
 * @access Private
 */
getCommunityMembership: async (req, res, next) => {
  try {
    const { communityId } = req.params;
    const userId = req.user.userId;

    // Verifica se a comunidade existe
    const community = await Community.findByPk(communityId);
    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Busca o membership do usuário
    const membership = await CommunityMember.findOne({
      where: {
        communityId,
        userId
      },
      attributes: ['role', 'joinedAt', 'status'],
      include: [
        {
          model: CommunityRole,
          as: 'roles',
          attributes: ['roleId', 'name', 'permissions'],
          through: { attributes: [] }
        }
      ]
    });

    if (!membership) {
      return res.status(200).json({
        success: true,
        data: {
          isMember: false,
          role: null,
          joinedAt: null,
          status: null,
          roles: []
        }
      });
    }

    const response = {
      isMember: true,
      role: membership.role,
      joinedAt: membership.joinedAt,
      status: membership.status,
      roles: membership.roles || []
    };

    res.json(response);

  } catch (error) {
    console.error('Error fetching community membership:', error instanceof Error ? error.message : error);
    next(error);
  }
},

  /**
 * @typedef {Object} CommunityUpdates
 * @property {string} [name] - Nome da comunidade
 * @property {string} [description] - Descrição completa
 * @property {string} [shortDescription] - Descrição resumida
 * @property {boolean} [isPublic] - Se a comunidade é pública
 * @property {string} [membershipType] - Tipo de associação (open/approval/invite_only)
 * @property {string[]} [tags] - Tags da comunidade
 * @property {Object} [socialLinks] - Links para redes sociais
 * @property {Object} [rules] - Regras da comunidade
 */

/**
 * Atualiza uma comunidade existente
 * @param {Object} req - Requisição HTTP
 * @param {Object} req.params - Parâmetros da rota
 * @param {string} req.params.communityId - ID da comunidade
 * @param {CommunityUpdates} req.body - Dados de atualização
 * @param {Object} req.user - Usuário autenticado
 * @param {string} req.user.userId - ID do usuário
 * @param {Object} res - Resposta HTTP
 * @param {Function} next - Próximo middleware
 * @returns {Promise<void>}
 */
updateCommunity: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { communityId } = req.params;
    const updates = req.body;
    const files = req.files;

    // Verifica se a comunidade existe e se o usuário é o criador
    const community = await Community.findOne({
      where: { communityId },
      transaction
    });

    if (!community) {
      throw new NotFoundError('Comunidade não encontrada');
    }

    if (community.creatorId !== req.user.userId) {
      throw new ForbiddenError('Apenas o criador pode editar esta comunidade');
    }

    if (updates.socialLinks && typeof updates.socialLinks === 'string') {
      updates.socialLinks = JSON.parse(updates.socialLinks);
    }

    if (updates.rules && typeof updates.rules === 'string') {
      updates.rules = JSON.parse(updates.rules);
    }

    if (updates.tags && typeof updates.tags === 'string') {
      updates.tags = JSON.parse(updates.tags);
    }

    // Upload de imagens
    if (files?.coverImage) {
      if (community.coverImage) {
        await deleteFromCloudinary(community.coverImage);
      }
      const result = await uploadToCloudinary(files.coverImage[0].path);
      updates.coverImage = result.secure_url;
    }

    if (files?.thumbnailImage) {
      if (community.thumbnailImage) {
        await deleteFromCloudinary(community.thumbnailImage);
      }
      const result = await uploadToCloudinary(files.thumbnailImage[0].path);
      updates.thumbnailImage = result.secure_url;
    }

    // Atualiza a comunidade
    const [affectedCount] = await Community.update(updates, {
      where: { communityId },
      transaction
    });

    if (affectedCount === 0) {
      throw new NotFoundError('Nenhuma alteração realizada na comunidade');
    }

    await transaction.commit();

    res.json({
      success: true,
      message: 'Comunidade atualizada com sucesso',
      data: {
        communityId,
        updatedFields: Object.keys(updates)
      }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

/**
 * @typedef {Object} CommunityMemberPreview
 * @property {string} userId - ID do usuário
 * @property {string} username - Nome do usuário
 * @property {string} avatarUrl - URL do avatar
 */

/**
 * @typedef {Object} StudyGroupPreview
 * @property {string} groupId - ID do grupo
 * @property {string} name - Nome do grupo
 * @property {string} description - Descrição do grupo
 * @property {number} membersCount - Número de membros
 */

/**
 * @typedef {Object} CommunityPostPreview
 * @property {string} postId - ID do post
 * @property {string} title - Título do post
 * @property {Date} createdAt - Data de criação
 * @property {Object} author - Autor do post
 * @property {string} author.username - Nome do autor
 * @property {string} author.avatarUrl - Avatar do autor
 */

/**
 * @typedef {Object} CommunityStats
 * @property {number} totalMembers - Total de membros
 * @property {number} totalGroups - Total de grupos de estudo
 * @property {number} totalPosts - Total de posts
 */

/**
 * @typedef {Object} CommunityDetailsResponse
 * @property {string} communityId - ID da comunidade
 * @property {string} name - Nome da comunidade
 * @property {string} description - Descrição completa
 * @property {string} shortDescription - Descrição resumida
 * @property {boolean} isPublic - Se é pública
 * @property {string} coverImage - URL da imagem de capa
 * @property {string} thumbnailImage - URL da miniatura
 * @property {Object} rules - Regras da comunidade
 * @property {Date} createdAt - Data de criação
 * @property {Object} creator - Criador da comunidade
 * @property {string} creator.userId - ID do criador
 * @property {string} creator.username - Nome do criador
 * @property {string} creator.avatarUrl - Avatar do criador
 * @property {CommunityStats} stats - Estatísticas
 * @property {Object} recentActivity - Atividade recente
 * @property {CommunityMemberPreview[]} recentActivity.members - Últimos membros
 * @property {StudyGroupPreview[]} recentActivity.studyGroups - Grupos recentes
 * @property {CommunityPostPreview[]} recentActivity.posts - Posts recentes
 * @property {string} [userRole] - Função do usuário (se membro)
 * @property {Date} [joinedAt] - Data de entrada (se membro)
 */

  /**
   * Obtém detalhes completos de uma comunidade
   * @param {Object} req - Requisição HTTP
   * @param {Object} req.params - Parâmetros da rota
   * @param {string} req.params.communityId - ID da comunidade
   * @param {Object} [req.user] - Usuário autenticado
   * @param {string} [req.user.userId] - ID do usuário
   * @param {Object} res - Resposta HTTP
   * @param {Function} next - Próximo middleware
   * @returns {Promise<void>}
   */
  getCommunityDetails: async (req, res, next) => {
    try {
      const { communityId } = req.params;
      const userId = req.user?.userId;

      // Verifica se a comunidade existe e é pública ou se o usuário é membro
      const whereCondition = {
        communityId,
        [Op.or]: [
          { isPublic: true },
          userId ? {
            [Op.and]: [
              { communityId },
              sequelize.literal(`EXISTS (
                SELECT 1 FROM community_members 
                WHERE "communityId" = "Community"."communityId" 
                AND "userId" = '${userId}'
                AND status = 'active'
              )`)
            ]
          } : { isPublic: true }
        ]
      };

      const community = await Community.findOne({
        where: whereCondition,
        include: [
          {
            model: User,
            as: 'creator',
            attributes: ['userId', 'username', 'avatarUrl']
          },
          {
            model: User,
            as: 'members',
            attributes: ['userId', 'username', 'avatarUrl'],
            through: {
              attributes: ['role', 'joinedAt'],
              where: { status: 'active' }
            },
            order: [['username', 'ASC']]
          },
          {
            model: StudyGroup,
            as: 'studyGroups',
            attributes: ['groupId', 'name', 'description'],
            order: [['createdAt', 'DESC']]
          },
          {
            model: CommunityPost,
            as: 'posts',
            attributes: ['postId', 'title', 'createdAt'],
            order: [['createdAt', 'DESC']],
            include: [{
              model: User,
              as: 'author',
              attributes: ['username', 'avatarUrl']
            }]
          }
        ],
        attributes: {
          include: [
            [sequelize.literal(`(
              SELECT COUNT(*)
              FROM community_members
              WHERE "communityId" = "Community"."communityId"
              AND status = 'active'
            )`), 'totalMembers'],
            [sequelize.literal(`(
              SELECT COUNT(*)
              FROM study_groups
              WHERE "communityId" = "Community"."communityId"
            )`), 'totalGroups'],
            [sequelize.literal(`(
              SELECT COUNT(*)
              FROM community_posts
              WHERE "communityId" = "Community"."communityId"
            )`), 'totalPosts']
          ]
        }
      });

      if (!community) {
        throw new NotFoundError('Comunidade não encontrada ou acesso não autorizado');
      }

      // Verifica membership de forma mais robusta
      let isMember = false;
      let userRole = null;
      let joinedAt = null;

      if (userId) {
        // Verifica se o usuário está na lista de membros incluídos
        const memberRecord = community.members?.find(m => m.userId === userId);
        
        if (memberRecord) {
          isMember = true;
          userRole = memberRecord.CommunityMember?.role;
          joinedAt = memberRecord.CommunityMember?.joinedAt;
        } else {
          const membership = await CommunityMember.findOne({
            where: {
              communityId,
              userId,
              status: 'active'
            },
            attributes: ['role', 'joinedAt']
          });

          if (membership) {
            isMember = true;
            userRole = membership.role;
            joinedAt = membership.joinedAt;
          }
        }
      }

      /** @type {CommunityDetailsResponse} */
      const response = {
        communityId: community.communityId,
        name: community.name,
        description: community.description,
        shortDescription: community.shortDescription,
        isPublic: community.isPublic,
        coverImage: community.coverImage,
        thumbnailImage: community.thumbnailImage,
        rules: community.rules,
        createdAt: community.createdAt,
        creator: community.creator,
        isMember,
        stats: {
          totalMembers: community.get('totalMembers'),
          totalGroups: community.get('totalGroups'),
          totalPosts: community.get('totalPosts')
        },
        recentActivity: {
          members: community.members,
          studyGroups: community.studyGroups.map(group => ({
            groupId: group.groupId,
            name: group.name,
            description: group.description,
            membersCount: group.members?.length || 0
          })),
          posts: community.posts
        }
      };

      // Adiciona informações adicionais se for membro
      if (isMember) {
        response.userRole = userRole;
        response.joinedAt = joinedAt;
      }

      res.json({
        success: true,
        data: response
      });
    } catch (error) {
      console.log("COMMUNITY DETAIL: ", error instanceof Error ? error.message : error);
      next(error);
    }
  },

  // ========== PARTICIPAÇÃO ==========
  /**
 * @typedef {Object} JoinCommunityResponse
 * @property {string} communityId - ID da comunidade
 * @property {string} userId - ID do usuário
 * @property {string} role - Função do membro
 * @property {string} status - Status da associação
 * @property {Date} joinedAt - Data de entrada
 */

/**
 * Permite que um usuário entre em uma comunidade
 * @param {Object} req - Requisição HTTP
 * @param {Object} req.params - Parâmetros da rota
 * @param {string} req.params.communityId - ID da comunidade
 * @param {Object} req.user - Usuário autenticado
 * @param {string} req.user.userId - ID do usuário
 * @param {Object} res - Resposta HTTP
 * @param {Function} next - Próximo middleware
 * @returns {Promise<void>}
 */
joinCommunity: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { communityId } = req.params;
    const { userId } = req.user;

    // Verifica se a comunidade existe
    const community = await Community.findOne({
      where: { communityId },
      transaction
    });

    if (!community) {
      throw new NotFoundError('Comunidade não encontrada');
    }

    // Verifica se o usuário já é membro
    const existingMember = await CommunityMember.findOne({
      where: { communityId, userId },
      transaction
    });

    if (existingMember) {
      if (existingMember.status === 'pending') {
        throw new ConflictError('Solicitação de entrada já está pendente');
      }
      if (existingMember.status === 'active') {
        throw new ConflictError('Você já é membro desta comunidade');
      }
    }

    // Lógica diferente para cada tipo de comunidade
    let member;
    switch (community.membershipType) {
      case 'open':
        // Entrada direta
        [member] = await CommunityMember.findOrCreate({
          where: { communityId, userId },
          defaults: {
            role: 'member',
            status: 'active'
          },
          transaction
        });

        await notificationService.notifyIfNewMember(member, communityId, req.user);
        
        break;

      case 'approval':
        // Cria solicitação pendente
        [member] = await CommunityMember.findOrCreate({
          where: { communityId, userId },
          defaults: {
            role: 'member',
            status: 'pending'
          },
          transaction
        });

        // Notifica os administradores
        await notificationService.notifyCommunityAdmins(
          communityId,
          req.user.userId,
          transaction
        );
        break;

      case 'invite_only':
        // Verifica se há convite pendente
        const hasInvite = await CommunityInvite.findOne({
          where: {
            communityId,
            userId,
            status: 'pending'
          },
          transaction
        });

        if (!hasInvite) {
          throw new ForbiddenError('Esta comunidade requer convite para entrada');
        }

        // Aceita o convite
        [member] = await CommunityMember.findOrCreate({
          where: { communityId, userId },
          defaults: {
            role: 'member',
            status: 'active'
          },
          transaction
        });

        // Atualiza o convite
        await CommunityInvite.update(
          { status: 'accepted' },
          { where: { communityId, userId }, transaction }
        );
        break;

      default:
        throw new Error('Tipo de associação desconhecido');
    }

    await transaction.commit();

    /** @type {JoinCommunityResponse} */
    const response = {
      communityId: member.communityId,
      userId: member.userId,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt
    };

    res.status(200).json({
      success: true,
      message: member.status === 'pending' 
        ? 'Solicitação de entrada enviada' 
        : 'Você entrou na comunidade',
      data: response
    });

  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

/**
 * @typedef {Object} LeaveCommunityResponse
 * @property {string} communityId - ID da comunidade
 * @property {string} userId - ID do usuário
 * @property {Date} leftAt - Data de saída
 */

/**
 * Permite que um usuário saia de uma comunidade
 * @param {Object} req - Requisição HTTP
 * @param {Object} req.params - Parâmetros da rota
 * @param {string} req.params.communityId - ID da comunidade
 * @param {Object} req.user - Usuário autenticado
 * @param {string} req.user.userId - ID do usuário
 * @param {Object} res - Resposta HTTP
 * @param {Function} next - Próximo middleware
 * @returns {Promise<void>}
 */
leaveCommunity: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { communityId } = req.params;
    const { userId } = req.user;

    // Verifica se o usuário é administrador
    const isAdmin = await CommunityMember.findOne({
      where: {
        communityId,
        userId,
        role: 'admin'
      },
      transaction
    });

    if (isAdmin) {
      // Verifica se há outros administradores
      const otherAdmins = await CommunityMember.count({
        where: {
          communityId,
          userId: { [Op.not]: userId },
          role: 'admin',
          status: 'active'
        },
        transaction
      });

      if (otherAdmins === 0) {
        throw new ForbiddenError(
          'Você é o único administrador. Transfira a administração antes de sair.'
        );
      }
    }

    // Remove o membro ou atualiza o status para inativo
    const [deletedCount] = await CommunityMember.update(
      { status: 'inactive', leftAt: new Date() },
      {
        where: {
          communityId,
          userId,
          status: 'active'
        },
        transaction
      }
    );

    if (deletedCount === 0) {
      throw new NotFoundError('Você não é membro ativo desta comunidade');
    }

    // Remove roles específicas do usuário na comunidade
    await CommunityMemberRole.destroy({
      where: { userId, communityId },
      transaction
    });

    await transaction.commit();

    /** @type {LeaveCommunityResponse} */
    const response = {
      communityId,
      userId,
      leftAt: new Date()
    };

    res.json({
      success: true,
      message: 'Você saiu da comunidade',
      data: response
    });

  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

// =========== MEMBERS ============
getCommunityMembers: async (req, res, next) => {
  try {
    const { communityId } = req.params;
    const { page = 1, limit = 12, search = '' } = req.query;
    const offset = (page - 1) * limit;

    // Verifica se a comunidade existe
    const community = await Community.findByPk(communityId);
    if (!community) {
      return res.status(404).json({
        success: false,
        message: 'Community not found'
      });
    }

    // Condições de busca
    const whereConditions = {
      communityId,
      status: 'active'
    };

    const includeUser = {
      model: User,
      as: 'User',
      attributes: ['userId', 'username', 'avatarUrl', 'role'],
    };

    if (search) {
      includeUser.where = {
        username: {
          [Op.iLike]: `%${search}%`
        }
      };
    }

    const { count, rows } = await CommunityMember.findAndCountAll({
      where: whereConditions,
      include: [includeUser],
      attributes: ['role', 'joinedAt'],
      order: [
        ['role', 'DESC'],
        ['joinedAt', 'ASC']
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true 
    });

    const response = {
      success: true,
        items: rows.map(member => ({
          userId: member.User.userId,
          username: member.User.username,
          avatarUrl: member.User.avatarUrl,
          role: member.role,
          joinedAt: member.joinedAt,
          userRole: member.User.role
        })),
        meta: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(count / limit),
          totalItems: count,
          limit: parseInt(limit)
        }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching community members:', error);
    next(error);
  }
},

  // ========== POSTS ==========
  /**
 * @typedef {Object} CommunityPostResponse
 * @property {string} postId - ID do post
 * @property {string} title - Título do post
 * @property {string} content - Conteúdo do post
 * @property {string} communityId - ID da comunidade
 * @property {Object} author - Autor do post
 * @property {string} author.userId - ID do autor
 * @property {string} author.username - Nome do autor
 * @property {string} author.avatarUrl - Avatar do autor
 * @property {Date} createdAt - Data de criação
 * @property {Date} updatedAt - Data de atualização
 */

/**
 * Obtém posts de uma comunidade com paginação
 * @param {Object} req - Requisição HTTP
 * @param {Object} req.params - Parâmetros da rota
 * @param {string} req.params.communityId - ID da comunidade
 * @param {Object} req.query - Query parameters
 * @param {number} [req.query.limit=20] - Limite de resultados
 * @param {number} [req.query.offset=0] - Offset para paginação
 * @param {Object} res - Resposta HTTP
 * @param {Function} next - Próximo middleware
 * @returns {Promise<CommunityPostResponse[]>}
 */
getCommunityPosts: async (req, res, next) => {
  try {
    const { communityId } = req.params;
    const { 
      limit = 20, 
      offset = 0,
      search = '',
      postType,
      difficultyLevel,
      sortBy = 'newest',
      tags = []
    } = req.query;

    // Verifica se a comunidade existe e é acessível
    const community = await Community.findOne({
      where: { communityId }
    });

    if (!community) {
      throw new NotFoundError('Comunidade não encontrada');
    }

    // Se comunidade privada, verifica se é membro
    if (!community.isPublic) {
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

    // Configuração da query base
    const where = { 
      communityId,
      status: 'published'
    };

    // Filtros adicionais
    if (postType) where.postType = postType;
    if (difficultyLevel) where.difficultyLevel = difficultyLevel;
    
    // Busca por texto
    if (search) {
      where[Op.or] = [
        sequelize.where(sequelize.fn('lower', sequelize.col('title')), 'LIKE', `%${search.toLowerCase()}%`),
        sequelize.where(sequelize.fn('lower', sequelize.col('excerpt')), 'LIKE', `%${search.toLowerCase()}%`)
      ];
    }

    // Ordenação
    const order = [];
    switch(sortBy) {
      case 'newest':
        order.push(['createdAt', 'DESC']);
        break;
      case 'oldest':
        order.push(['createdAt', 'ASC']);
        break;
      case 'mostViewed':
        order.push(['viewCount', 'DESC']);
        break;
      case 'mostCommented':
        order.push(['commentCount', 'DESC']);
        break;
      case 'topRated':
        order.push(['likeCount', 'DESC']);
        break;
      default:
        order.push(['isPinned', 'DESC'], ['createdAt', 'DESC']);
    }

    // Inclui filtro por tags se fornecido
    const include = [{
      model: User,
      as: 'author',
      attributes: ['userId', 'username', 'avatarUrl']
    }];

    if (tags && tags.length > 0) {
      include.push({
        model: Tag,
        as: 'tags',
        where: { name: tags },
        through: { attributes: [] },
        required: true
      });
    }

    const posts = await CommunityPost.findAndCountAll({
      where,
      include,
      order,
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    res.json({
      success: true,
      data: {
        posts: posts.rows,
        total: posts.count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        filters: {
          search,
          postType,
          difficultyLevel,
          sortBy,
          tags
        }
      }
    });
  } catch (error) {
    console.error("ERROR FETCHING COMMUNITY POSTS: ", error instanceof Error ? error.message : error);
    next(error);
  }
},

getPostById: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { communityId, postId } = req.params;

    // Verifica se a comunidade existe e é acessível
    const community = await Community.findOne({
      where: { communityId },
      transaction
    });

    if (!community) {
      throw new NotFoundError('Comunidade não encontrada');
    }

    // Se comunidade privada, verifica se é membro
    if (!community.isPublic) {
      const isMember = await CommunityMember.findOne({
        where: {
          communityId,
          userId: req.user?.userId,
          status: 'active'
        },
        transaction
      });

      if (!isMember) {
        throw new ForbiddenError('Acesso restrito a membros da comunidade');
      }
    }

    // Busca o post com todos os relacionamentos
    const post = await CommunityPost.findOne({
      where: { 
        postId,
        communityId,
        status: 'published'
      },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['userId', 'username', 'avatarUrl']
        },
        {
          model: Tag,
          as: 'tags',
          through: { attributes: [] }
        },
        {
          model: LearningObjective,
          as: 'objectives',
          through: { attributes: ['relevance'] }
        },
        {
          model: PostAttachment,
          as: 'attachments'
        },
        {
          model: PostComment,
          as: 'comments',
          separate: true,
          limit: 10,
          order: [['createdAt', 'DESC']],
          include: [{
            model: User,
            as: 'author',
            attributes: ['userId', 'username', 'avatarUrl']
          }]
        }
      ],
      transaction
    });

    if (!post) {
      throw new NotFoundError('Post não encontrado ou não disponível');
    }

    // Registra a visualização
    if (req.user?.userId) {
      await PostView.findOrCreate({
        where: {
          postId,
          userId: req.user.userId
        },
        defaults: {
          postId,
          userId: req.user.userId,
          deviceType: req.deviceType
        },
        transaction
      });

      // Atualiza contador de visualizações
      await sequelize.query(
        `
        UPDATE community_posts 
        SET stats = jsonb_set(
          stats,
          '{viewCount}',
          to_jsonb((COALESCE((stats->>'viewCount')::int, 0) + 1)),
          true
        )
        WHERE "postId" = :postId
        `,
        {
          replacements: { postId: post.postId },
          transaction
        }
      );
    }

    await transaction.commit();

    res.json({
      success: true,
      data: post
    });
  } catch (error) {
    await transaction.rollback();
    console.error("ERROR FETCHING POST: ", error instanceof Error ? error.message : error);
    next(error);
  }
},

/**
 * Cria um novo post na comunidade
 * @param {Object} req - Requisição HTTP
 * @param {Object} req.params - Parâmetros da rota
 * @param {string} req.params.communityId - ID da comunidade
 * @param {Object} req.body - Dados do post
 * @param {string} req.body.title - Título do post
 * @param {string} req.body.content - Conteúdo do post
 * @param {Object} req.user - Usuário autenticado
 * @param {string} req.user.userId - ID do usuário
 * @param {Object} res - Resposta HTTP
 * @param {Function} next - Próximo middleware
 * @returns {Promise<CommunityPostResponse>}
 */
createPost: async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { communityId } = req.params;
    const {
      title,
      content,
      excerpt,
      tags = [],
      objectives = [],
      attachments = [],
      postType = 'discussion',
      difficultyLevel,
      sourceUrl,
      isOriginalContent = true,
      visibility = 'public',
      isPinned = false
    } = req.body;

    // Verifica se é membro ativo da comunidade
    const [community, membership] = await Promise.all([
      Community.findByPk(communityId, { transaction }),
      CommunityMember.findOne({
        where: {
          communityId,
          userId: req.user.userId,
          status: 'active'
        },
        transaction
      })
    ]);

    if (!membership) {
      throw new ForbiddenError('Você precisa ser membro ativo para postar');
    }

    // Verifica permissão para postar conteúdo restrito
    if (visibility === 'restricted' && membership.role !== 'admin' && membership.role !== 'moderator') {
      throw new ForbiddenError('Apenas moderadores podem criar posts restritos');
    }

    // Verifica permissão para fixar posts
    if (isPinned && membership.role !== 'admin' && membership.role !== 'moderator') {
      throw new ForbiddenError('Apenas moderadores podem fixar posts');
    }

    // Cria o post principal
    const post = await CommunityPost.create({
      title,
      content,
      excerpt: excerpt || content.replace(/<[^>]*>/g, '').substring(0, 200) + '...',
      communityId,
      authorId: req.user.userId,
      postType,
      difficultyLevel: ['resource', 'assignment'].includes(postType) ? difficultyLevel : null,
      isOriginalContent,
      sourceUrl,
      visibility,
      isPinned,
      status: 'published',
      metadata: {
        createdAt: new Date().toISOString(),
        author: {
          userId: req.user.userId,
          username: req.user.username,
          avatarUrl: req.user.avatarUrl
        },
        communityId
      }
    }, { transaction });

    // Processa tags
    if (tags && tags.length > 0) {
      const tagInstances = await Promise.all(
        tags.map(tagName =>
          Tag.findOrCreate({
            where: { name: tagName.toLowerCase() },
            defaults: { name: tagName.toLowerCase() },
            transaction
          })
        )
      );
      
      await post.setTags(tagInstances.map(([tag]) => tag), { transaction });
    }

    // Associa objetivos de aprendizagem
    if (objectives && objectives.length > 0) {
      const validObjectives = await LearningObjective.findAll({
        where: { objectiveId: objectives },
        transaction
      });
      
      await post.setObjectives(validObjectives, { 
        through: { relevance: 1 },
        transaction 
      });
    }

    // Processa anexos
    if (attachments && attachments.length > 0) {
      const attachmentInstances = await Promise.all(
        attachments.map(attachment =>
          PostAttachment.create({
            url: attachment.url,
            type: attachment.type,
            title: attachment.title || `Anexo ${attachment.type}`,
            description: attachment.description,
            metadata: attachment.metadata,
            postId: post.postId,
            uploadedById: req.user.userId
          }, { transaction })
        )
      );
      
      post.attachments = attachmentInstances;
    }

    // Notifica membros sobre novo post
    if (post.visibility === 'public' || post.visibility === 'members') {
      await notificationService.notifyNewCommunityPost(
        post,
        community
      );
    }

    await transaction.commit();

    // Carrega relações para retornar o post completo
    const fullPost = await CommunityPost.findByPk(post.postId, {
      include: [
        { model: User, as: 'author', attributes: ['userId', 'username', 'avatarUrl'] },
        { model: Tag, as: 'tags', through: { attributes: [] } },
        { model: LearningObjective, as: 'objectives', through: { attributes: ['relevance'] } },
        { model: PostAttachment, as: 'attachments' }
      ],
      transaction: null
    });

    res.status(201).json({
      success: true,
      data: fullPost
    });
  } catch (error) {
    console.error("ERROR CREATING POST: ", error instanceof Error ? error.message : error);
    await transaction.rollback();
    next(error);
  }
},

/**
 * Obtém a reação do usuário atual em um post
 * @param {string} req.params.postId - ID do post
 * @returns {Object} reactionType - Tipo da reação ou null
 */
getUserReaction: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { postId } = req.params;
    const userId = req.user?.userId;

    // Verifica se o usuário está autenticado
    if (!userId) {
      await transaction.commit();
      return res.json({
        success: true,
        data: { reactionType: null }
      });
    }

    // Verifica se o post existe e está publicado
    const post = await CommunityPost.findOne({
      where: { 
        postId,
        status: 'published'
      },
      transaction
    });

    if (!post) {
      throw new NotFoundError('Post não encontrado ou não disponível');
    }

    // Busca a reação do usuário
    const reaction = await PostReaction.findOne({
      where: {
        postId,
        userId
      },
      transaction
    });

    await transaction.commit();

    res.json({
      success: true,
      data: {
        reactionType: reaction?.type || null
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error("ERROR FETCHING USER REACTION: ", error.message);
    next(error);
  }
},

/**
 * @route GET /community/posts/:postId/like-status
 * @description Check if user liked a post
 * @access Private
 */
getLikeStatus: async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { userId } = req.user;

    const like = await PostReaction.findOne({
      where: { 
        postId, 
        userId
      }
    });

    res.json({
      success: true,
      data: {
        isLiked: !!like
      }
    });
  } catch (error) {
    next(error);
  }
},

/**
 * Adiciona/atualiza uma reação
 */
addReaction: async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { postId } = req.params;
    const { reactionType } = req.body;
    const userId = req.user.userId;

    // Validação
    const validReactions = ['like', 'helpful', 'creative', 'confused', 'celebrate', 'insightful'];
    if (!validReactions.includes(reactionType)) {
      throw new BadRequestError('Tipo de reação inválido');
    }

    // Busca post com lock
    const post = await CommunityPost.findByPk(postId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!post || post.status !== 'published') {
      throw new NotFoundError('Post não encontrado');
    }

    // Verifica membresia
    const isMember = await CommunityMember.findOne({
      where: { communityId: post.communityId, userId, status: 'active' },
      transaction
    });

    if (!isMember) {
      throw new ForbiddenError('Acesso restrito a membros');
    }

    const [reaction, created] = await PostReaction.findOrCreate({
      where: { postId, userId },
      defaults: { type: reactionType },
      transaction
    });

    let action = 'added';
    
    if (!created) {
      if (reaction.type === reactionType) {
        throw new BadRequestError('Reação já existe');
      }
      await updateReactionCounters(sequelize, postId, reactionType, 'decrement', transaction);
      reaction.type = reactionType;
      await reaction.save({ transaction });
      action = 'updated';
    }

    await updateReactionCounters(sequelize, postId, reactionType, 'increment', transaction);

    // Busca dados atualizados para retorno
    const updatedPost = await CommunityPost.findByPk(postId, {
      attributes: ['postId', 'title', 'stats'],
      include: [{
        model: PostReaction,
        as: 'reactions',
        attributes: ['reactionId', 'type', 'createdAt'],
        include: [{
          model: User,
          as: 'user',
          attributes: ['userId', 'username', 'avatarUrl']
        }]
      }],
      transaction
    });

    // Notifica o autor do post sobre a reação
    await notificationService.notifyPostReaction(
      post,
      req.user,
      reactionType
    );

    await transaction.commit();

    res.json({
      success: true,
      data: {
        reaction: {
          reactionId: reaction.reactionId,
          type: reaction.type,
          createdAt: reaction.createdAt,
          user: req.user
        },
        action,
        post: updatedPost
      }
    });

  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

/**
 * Remove uma reação
 */
removeReaction: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { postId } = req.params;
    const userId = req.user.userId;

    const post = await CommunityPost.findByPk(postId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!post) {
      throw new NotFoundError('Post não encontrado');
    }

    const reaction = await PostReaction.findOne({
      where: { postId, userId },
      transaction
    });

    if (!reaction) {
      throw new NotFoundError('Reação não encontrada');
    }

    await updateReactionCounters(sequelize, postId, reaction.type, 'decrement', transaction);
    await reaction.destroy({ transaction });

    const updatedPost = await CommunityPost.findByPk(postId, {
      attributes: ['postId', 'stats'],
      transaction
    });

    await transaction.commit();

    res.json({
      success: true,
      data: {
        post: updatedPost,
        action: 'removed'
      }
    });

  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

/**
 * Lista reações de um post
 * @param {string} req.params.postId
 */
getPostReactions: async (req, res, next) => {
  try {
    const { postId } = req.params;

    // Verifica se o post existe e está publicado
    const post = await CommunityPost.findOne({
      where: { 
        postId,
        status: 'published'
      },
      attributes: ['postId', 'communityId']
    });

    if (!post) {
      throw new NotFoundError('Post não encontrado ou não disponível');
    }

    // Busca reações agrupadas por tipo
    const reactions = await PostReaction.findAll({
      where: { postId },
      include: [{
        model: User,
        as: 'user',
        attributes: ['userId', 'username', 'avatarUrl']
      }],
      order: [['createdAt', 'DESC']]
    });

    // Agrupa por tipo para resposta otimizada
    const groupedReactions = reactions.reduce((acc, reaction) => {
      if (!acc[reaction.type]) {
        acc[reaction.type] = [];
      }
      acc[reaction.type].push(reaction.user);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        reactions: groupedReactions,
        counts: {
          like: await PostReaction.count({ where: { postId, type: 'like' } }),
          helpful: await PostReaction.count({ where: { postId, type: 'helpful' } }),
          creative: await PostReaction.count({ where: { postId, type: 'creative' } }),
          confused: await PostReaction.count({ where: { postId, type: 'confused' } }),
          celebrate: await PostReaction.count({ where: { postId, type: 'celebrate' } }),
          insightful: await PostReaction.count({ where: { postId, type: 'insightful' } }),
        }
      }
    });

  } catch (error) {
    console.error("ERROR FETCHING POST REACTIONS: ", error.message);
    next(error);
  }
},

/**
 * Exclui um post da comunidade (soft delete)
 * @param {string} req.params.postId - ID do post
 */
deletePost: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { postId } = req.params;
    const userId = req.user.userId;

    // Busca o post com informações da comunidade
    const post = await CommunityPost.findOne({
      where: { postId },
      include: [{
        model: Community,
        as: 'community',
        attributes: ['communityId', 'isPublic']
      }],
      transaction
    });

    if (!post) {
      throw new NotFoundError('Post não encontrado');
    }

    // Verifica permissões
    const isAuthor = post.authorId === userId;
    const isCommunityAdmin = await CommunityMember.findOne({
      where: {
        communityId: post.community.communityId,
        userId,
        role: ['admin', 'moderator'],
        status: 'active'
      },
      transaction
    });

    // Apenas autor, admins ou moderadores podem excluir
    if (!isAuthor && !isCommunityAdmin) {
      throw new ForbiddenError('Você não tem permissão para excluir este post');
    }

    // Soft delete do post
    await post.update({
      status: 'deleted',
      deletedAt: new Date(),
      metadata: {
        ...post.metadata,
        deletedBy: userId,
        deletionReason: isAuthor ? 'author' : 'moderation'
      }
    }, { transaction });

    // Atualiza estatísticas da comunidade
    await Community.decrement('postCount', {
      where: { communityId: post.communityId },
      transaction
    });

    // Notifica sobre post deletado
    await notificationService.notifyPostDeleted(
      post,
      req.user
    );

    await transaction.commit();

    res.json({
      success: true,
      data: { message: 'Post excluído com sucesso' }
    });

  } catch (error) {
    await transaction.rollback();
    console.error("ERROR DELETING POST: ", error.message);
    next(error);
  }
},

/**
 * @route GET /communities/posts/:postId/comments
 * @description Get comments for a post
 * @access Private (Community Members)
 */
getPostComments: async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { userId } = req.user;
    const { limit = 20, offset = 0 } = req.query;

    // Verifica se o post existe e se o usuário tem acesso
    const post = await CommunityPost.findByPk(postId, {
      include: [{
        model: Community,
        as: 'community',
        attributes: ['communityId', 'isPublic']
      }]
    });

    if (!post) {
      throw new NotFoundError('Post not found');
    }

    // Se comunidade privada, verifica se é membro
    if (!post.community.isPublic) {
      const isMember = await CommunityMember.findOne({
        where: {
          communityId: post.community.communityId,
          userId,
          status: 'active'
        }
      });

      if (!isMember) {
        throw new ForbiddenError('You must be a community member to view comments');
      }
    }

    // Obtém os comentários principais
    const { count, rows } = await PostComment.findAndCountAll({
      where: { 
        postId,
        parentCommentId: null,
        status: 'active'
      },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['userId', 'username', 'avatarUrl']
        },
        {
          model: PostComment,
          as: 'replies',
          include: [{
            model: User,
            as: 'author',
            attributes: ['userId', 'username', 'avatarUrl']
          }],
          where: { status: 'active' },
          required: false,
          limit: 5
        }
      ],
      order: [
        ['isAnswer', 'DESC'], 
        ['createdAt', 'DESC']
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      distinct: true
    });

    res.json({
      success: true,
      data: {
        comments: rows,
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    next(error);
  }
},

/**
 * @route POST /communities/posts/:postId/comments
 * @description Create a new comment
 * @access Private (Community Members)
 */
createPostComment: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { postId } = req.params;
    const { userId } = req.user;
    const { content, parentCommentId } = req.body;

    // Validação básica
    if (!content || content.length < 1) {
      throw new BadRequestError('Comment content cannot be empty');
    }

    // Verifica se o post existe e se o usuário tem acesso
    const post = await CommunityPost.findByPk(postId, {
      include: [{
        model: Community,
        as: 'community',
        attributes: ['communityId']
      }],
      transaction
    });

    if (!post) {
      throw new NotFoundError('Post not found');
    }

    // Verifica se é membro da comunidade
    const isMember = await CommunityMember.findOne({
      where: {
        communityId: post.community.communityId,
        userId,
        status: 'active'
      },
      transaction
    });

    if (!isMember) {
      throw new ForbiddenError('You must be a community member to comment');
    }

    // Verifica se o comentário pai existe (se for uma resposta)
    if (parentCommentId) {
      const parentComment = await PostComment.findOne({
        where: { commentId: parentCommentId, postId },
        transaction
      });

      if (!parentComment) {
        throw new NotFoundError('Parent comment not found');
      }
    }

    // Cria o comentário
    const comment = await PostComment.create({
      content,
      postId,
      authorId: userId,
      parentCommentId: parentCommentId || null,
      metadata: {
        createdAt: new Date().toISOString(),
        author: {
          userId,
          username: req.user.username,
          avatarUrl: req.user.avatarUrl
        }
      }
    }, { transaction });

    // Atualiza contagem de comentários no post
    await sequelize.query(
      `
      UPDATE community_posts 
      SET stats = jsonb_set(
        stats,
        '{commentCount}',
        to_jsonb((COALESCE((stats->>'commentCount')::int, 0) + 1)),
        true
      )
      WHERE "postId" = :postId
      `,
      {
        replacements: { postId },
        transaction
      }
    );

    // Notifica sobre novo comentário
    await notificationService.notifyNewComment(
      post,
      comment,
      req.user
    );

    await transaction.commit();

    // Carrega relações para retornar o comentário completo
    const fullComment = await PostComment.findByPk(comment.commentId, {
      include: [{
        model: User,
        as: 'author',
        attributes: ['userId', 'username', 'avatarUrl']
      }],
      transaction: null
    });

    res.status(201).json({
      success: true,
      message: 'Comment created successfully',
      data: fullComment
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

/**
 * @route PUT /communities/posts/:postId/comments/:commentId
 * @description Edit a comment
 * @access Private (Author, Admin or Moderator)
 */
editPostComment: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { postId, commentId } = req.params;
    const { userId, role } = req.user;
    const { content, isAnswer } = req.body;

    // Validação básica
    if (content && content.length < 1) {
      throw new BadRequestError('Comment content cannot be empty');
    }

    // Busca o comentário
    const comment = await PostComment.findOne({
      where: { commentId, postId },
      transaction
    });

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    // Verifica permissões
    const isAuthor = comment.authorId === userId;
    const isAdminOrModerator = role === 'admin' || role === 'moderator';

    if (!isAuthor && !isAdminOrModerator) {
      throw new ForbiddenError('You are not authorized to edit this comment');
    }

    // Verifica se é resposta aceita (apenas autor do post pode marcar)
    if (typeof isAnswer !== 'undefined') {
      const post = await CommunityPost.findByPk(postId, { transaction });
      if (post.authorId !== userId) {
        throw new ForbiddenError('Only post author can mark comments as answers');
      }
    }

    // Prepara atualização
    const updateData = {};
    if (content) updateData.content = content;
    if (typeof isAnswer !== 'undefined') updateData.isAnswer = isAnswer;

    // Registra a edição no histórico
    const editHistory = comment.editHistory || [];
    editHistory.push({
      editedAt: new Date().toISOString(),
      editedBy: userId,
      previousContent: comment.content,
      changes: Object.keys(updateData)
    });

    updateData.editHistory = editHistory;
    updateData.updatedAt = new Date();

    // Atualiza o comentário
    await PostComment.update(updateData, {
      where: { commentId },
      transaction
    });

    await transaction.commit();

    // Retorna o comentário atualizado
    const updatedComment = await PostComment.findByPk(commentId, {
      include: [{
        model: User,
        as: 'author',
        attributes: ['userId', 'username', 'avatarUrl']
      }]
    });

    res.json({
      success: true,
      message: 'Comment updated successfully',
      data: updatedComment
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

/**
 * @route DELETE /communities/posts/:postId/comments/:commentId
 * @description Delete a comment (soft delete)
 * @access Private (Author, Admin or Moderator)
 */
postDeleteComment: async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { postId, commentId } = req.params;
    const { userId, role } = req.user;

    // Busca o comentário
    const comment = await PostComment.findOne({
      where: { commentId, postId },
      transaction
    });

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    // Verifica permissões
    const isAuthor = comment.authorId === userId;
    const isAdminOrModerator = role === 'admin' || role === 'moderator';

    if (!isAuthor && !isAdminOrModerator) {
      throw new ForbiddenError('You are not authorized to delete this comment');
    }

    // Soft delete do comentário
    await PostComment.update(
      { status: 'deleted' },
      { where: { commentId }, transaction }
    );

    // Atualiza contagem de comentários no post
    await CommunityPost.decrement('commentCount', {
      where: { postId },
      transaction
    });

    // Se era uma resposta aceita, remove o status
    if (comment.isAnswer) {
      await PostComment.update(
        { isAnswer: false },
        { where: { commentId }, transaction }
      );
    }

    // Notifica sobre comentário deletado
    await notificationService.notifyCommentDeleted(
      comment,
      req.user
    );

    await transaction.commit();

    res.json({
      success: true,
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
},

/**
 * Middleware para verificar se usuário é membro ativo da comunidade
 * @param {Object} req - Requisição HTTP
 * @param {Object} req.params - Parâmetros da rota
 * @param {string} req.params.communityId - ID da comunidade
 * @param {Object} req.user - Usuário autenticado
 * @param {string} req.user.userId - ID do usuário
 * @param {Object} res - Resposta HTTP
 * @param {Function} next - Próximo middleware
 * @returns {Promise<void>}
 */
verifyCommunityMember: async (req, res, next) => {
  try {
    const { communityId } = req.params;

    const isMember = await CommunityMember.findOne({
      where: {
        communityId,
        userId: req.user.userId,
        status: 'active'
      }
    });

    if (!isMember) {
      throw new ForbiddenError('Acesso restrito a membros ativos da comunidade');
    }

    next();
  } catch (error) {
    next(error);
  }
},
};