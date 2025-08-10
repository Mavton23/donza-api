require('dotenv').config();

const { UserDocument, Activity, User, Course, Lesson, Resource, Event, Message } = require('../models');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { sequelize } = require('../configs/db');
const { BadRequestError } = require('../utils/errors');
const { createToken, createRefreshToken } = require('../services/auth.service');
const notificationService = require('../services/notification.service');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

module.exports = {
    /**
   * Registra um novo administrador diretamente
   */
  registerAdmin: async (req, res, next) => {
      const transaction = await sequelize.transaction();

      try {
          const errors = validationResult(req);

          if (!errors.isEmpty()) {
              return res.status(400).json({
                  success: false,
                  errors: errors.array().map(err => ({
                      field: err.path,
                      message: err.msg
                  }))
              });
          }

          const { username, email, password, secretKey, fullName } = req.body;

          // Verificar chave secreta
          if (secretKey !== process.env.ADMIN_REGISTRATION_KEY) {
              throw new BadRequestError('Chave de administração inválida');
          }

          // Verificar se o email já existe
          const existingEmail = await User.findOne({ 
              where: { email },
              transaction
          });
          
          if (existingEmail) {
              throw new BadRequestError('Este e-mail já está em uso');
          }

          // Verificar se o username já existe
          const existingUsername = await User.findOne({ 
              where: { username },
              transaction
          });
          
          if (existingUsername) {
              throw new BadRequestError('Nome de usuário já está em uso');
          }

          // Criar usuário admin
          const user = await User.create({
              username,
              fullName,
              email,
              password: await bcrypt.hash(password, 12),
              role: 'admin',
              isVerified: true,
              profileCompleted: true,
              verifiedAt: new Date()
          }, { transaction });

          // Verificar se os secrets estão configurados
          if (!process.env.REFRESH_TOKEN_SECRET || !process.env.ACCESS_TOKEN_SECRET) {
              throw new Error('Configuração de segurança incompleta');
          }

          // Gerar tokens
          const accessToken = createToken(user);
          const refreshToken = await createRefreshToken(user);

          await transaction.commit();

          res.status(201).json({
            success: true,
            data: {
                userId: user.userId,
                username: user.username,
                email: user.email,
                role: user.role,
                accessToken,
                refreshToken,
                profileCompleted: true,
                isVerified: true
            }
        });
      } catch (error) {
          await transaction.rollback();
          console.log("ERRO NA CRIACAO DO ADMIN: ", error instanceof Error ? error.message : error);
          next(error);
      }
  },
  getStats: async (req, res) => {
      try {
        const stats = await Promise.all([
          User.count(),
          Course.count({ where: { status: 'published' } }),
          Event.count({ where: { startDate: { [Op.gt]: new Date() } }}),
          Message.count()
        ]);
      
        res.json({
          totalUsers: stats[0],
          activeCourses: stats[1],
          upcomingEvents: stats[2],
          totalMessages: stats[3],
        });
      } catch (error) {
        console.log("ERROR getAdminStats: ", error instanceof Error ? error.message : error);
        next(error);
      }
  },

  /**
 * Obtém a contagem de verificações pendentes
 */
async getPendingVerificationsCount(req, res, next) {
  try {
    const count = await User.count({
      where: {
        status: 'pending',
        role: {
          [Op.or]: ['instructor', 'institution']
        }
      }
    });

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    logger.error('Failed to get pending verifications count', error);
    next(error);
  }
},

/**
 * Lista todas as verificações com filtros
 */
async listVerifications(req, res, next) {
  try {
    const { status, role } = req.query;
    const where = {};
    
    if (status) where.status = status;
    if (role) where.role = role;
    
    // Filtra apenas instrutores e instituições
    where.role = {
      [Op.or]: ['instructor', 'institution']
    };

    const verifications = await User.findAll({
      where,
      include: [
        {
          model: User,
          as: 'reviewedBy',
          attributes: ['userId', 'username', 'email']
        },
        {
          model: UserDocument,
          as: 'documents',
          attributes: ['docId', 'documentType', 'status', 'originalName']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: verifications.map(v => ({
        id: v.userId,
        role: v.role,
        name: v.role === 'institution' ? v.institutionName : v.fullName,
        email: v.email,
        status: v.status,
        createdAt: v.createdAt,
        reviewDate: v.reviewDate,
        reviewedBy: v.reviewedBy,
        documents: v.documents,
        rejectionReason: v.rejectionReason
      }))
    });
  } catch (error) {
    logger.error('Failed to list verifications', error);
    next(error);
  }
},

/**
 * Obtém detalhes de uma verificação específica
 */
async getVerificationDetails(req, res, next) {
  try {
    const { id } = req.params;
    
    const verification = await User.findByPk(id, {
      include: [
        {
          model: User,
          as: 'reviewedBy',
          attributes: ['userId', 'username', 'email']
        },
        {
          model: UserDocument,
          as: 'documents',
          attributes: ['docId', 'documentType', 'status', 'originalName', 'storageKey', 'reviewDate', 'rejectionReason']
        }
      ]
    });

    if (!verification || !['instructor', 'institution'].includes(verification.role)) {
      throw new NotFoundError('Verificação não encontrada');
    }

    res.json({
      success: true,
      data: {
        id: verification.userId,
        role: verification.role,
        name: verification.role === 'institution' ? verification.institutionName : verification.fullName,
        email: verification.email,
        status: verification.status,
        createdAt: verification.createdAt,
        reviewDate: verification.reviewDate,
        reviewedBy: verification.reviewedBy,
        documents: verification.documents,
        rejectionReason: verification.rejectionReason,
        // Campos específicos de instituição
        ...(verification.role === 'institution' && {
          institutionType: verification.institutionType,
          website: verification.website,
          contactPhone: verification.contactPhone,
          yearFounded: verification.yearFounded,
          accreditation: verification.accreditation
        }),
        // Campos específicos de instrutor
        ...(verification.role === 'instructor' && {
          educationLevel: verification.educationLevel,
          educationField: verification.educationField,
          teachingExperience: verification.teachingExperience,
          expertise: verification.expertise
        })
      }
    });
  } catch (error) {
    logger.error('Failed to get verification details', error);
    next(error);
  }
},

/**
 * Processa uma verificação (aprova ou rejeita)
 */
async processVerification(req, res, next) {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { action, rejectionReason } = req.body;
    const adminId = req.user.userId;

    if (!['approve', 'reject'].includes(action)) {
      throw new BadRequestError('Ação inválida');
    }

    const verification = await User.findOne({
      where: {
        userId: id,
        role: {
          [Op.or]: ['instructor', 'institution']
        }
      },
      include: [{
        model: UserDocument,
        as: 'documents'
      }],
      transaction
    });

    if (!verification) {
      throw new NotFoundError('Verificação não encontrada');
    }

    if (verification.status !== 'pending') {
      throw new BadRequestError('Esta verificação já foi processada');
    }

    // Verifica se todos os documentos necessários foram aprovados
    if (action === 'approve') {
      const requiredDocs = verification.role === 'instructor' 
        ? ['diplomas', 'experiencia', 'certificacoes', 'registroProfissional']
        : ['alvara', 'credenciamento', 'estatutos', 'endereco'];

      const hasRejectedDocs = verification.documents.some(doc => 
        requiredDocs.includes(doc.documentType) && doc.status === 'rejected'
      );

      if (hasRejectedDocs) {
        throw new BadRequestError('Não é possível aprovar - existem documentos rejeitados');
      }

      const allRequiredApproved = requiredDocs.every(docType => 
        verification.documents.some(doc => 
          doc.documentType === docType && doc.status === 'approved'
        )
      );

      if (!allRequiredApproved) {
        throw new BadRequestError('Todos os documentos necessários devem ser aprovados');
      }
    }

    // Atualiza o status do usuário
    verification.status = action === 'approve' ? 'approved' : 'rejected';
    verification.adminReviewer = adminId;
    verification.reviewDate = new Date();
    
    if (action === 'reject') {
      verification.rejectionReason = rejectionReason || 'Documentação insuficiente ou inválida';
    }

    await verification.save({ transaction });

    // Se aprovado, marca como verificado
    if (action === 'approve') {
      verification.isVerified = true;
      verification.verifiedAt = new Date();
      await verification.save({ transaction });

      // Enviar email de aprovação
      try {
        await notificationService.notifyUserApproval(id, adminId);
      } catch (notifyError) {
        console.log("notifyError: ", notifyError instanceof Error ? notifyError.message : notifyError)
      }
    } else {
      // Enviar email de rejeição
      try {
        await notificationService.notifyUserRejection(id, adminId, rejectionReason);
      } catch (notifyError) {
        console.log("notifyError: ", notifyError instanceof Error ? notifyError.message : notifyError)
      }
    }

    await transaction.commit();

    res.json({
      success: true,
      data: {
        id: verification.userId,
        status: verification.status,
        reviewDate: verification.reviewDate
      }
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to process verification', error);
    next(error);
  }
},

/**
 * Aprova/rejeita um documento específico
 */
async reviewDocument(req, res, next) {
  const transaction = await sequelize.transaction();
  try {
    const { docId } = req.params;
    const { action, rejectionReason } = req.body;
    const adminId = req.user.userId;

    if (!['approve', 'reject'].includes(action)) {
      throw new BadRequestError('Ação inválida');
    }

    const document = await UserDocument.findByPk(docId, {
      include: [{
        model: User,
        as: 'user'
      }],
      transaction
    });

    if (!document) {
      throw new NotFoundError('Documento não encontrado');
    }

    document.status = action === 'approve' ? 'approved' : 'rejected';
    document.reviewedBy = adminId;
    document.reviewDate = new Date();
    
    if (action === 'reject') {
      document.rejectionReason = rejectionReason || 'Documento não atende aos requisitos';
    }

    await document.save({ transaction });
    await transaction.commit();

    res.json({
      success: true,
      data: {
        docId: document.docId,
        status: document.status,
        reviewDate: document.reviewDate
      }
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to review document', error);
    next(error);
  }
},

  /**
   * Baixar um documento específico
   */
  async downloadDocument(req ,res, next) {
    try {
      const { docId } = req.params;

      const document = await UserDocument.findByPk(docId);
      if (!document) {
        return res.status(404).json({ error: 'Documento não encontrado' });
      }

      if (!document.storageProvider) {
        return res.status(500).json({ error: 'Origem do documento não definida' });
      }

      if (document.storageProvider === 'cloudinary') {
        const downloadUrl = cloudinary.url(document.storageKey, {
          flags: 'attachment',
          resource_type: 'auto'
        });
        console.log("downloadUrl: ", downloadUrl);
        return res.redirect(downloadUrl);
      }

      if (document.storageProvider === 'local') {
        const filePath = path.join(__dirname, '..', 'uploads', document.storageKey);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Arquivo não encontrado' });
      }

      return res.download(filePath, document.originalName);
    }
    } catch (error) {
      console.log("Error downloading a document: ", error instanceof Error ? error.message : error);
      next(error);
    }
  },

  /**
   * Verifica a saúde dos serviços do sistema
   */
  async getSystemStatus(req, res, next) {
    try {
      const healthCheck = {
        uptime: process.uptime(),
        timestamp: Date.now(),
        checks: {
          database: await checkDatabaseHealth(),
          cache: await checkCacheHealth(),
          storage: await checkStorageHealth(),
          email: await checkEmailHealth(),
          api: {
            status: 'healthy',
            version: process.env.npm_package_version
          }
        }
      };

      // Determina status geral
      healthCheck.status = Object.values(healthCheck.checks)
        .every(check => check.status === 'healthy') ? 'healthy' : 'degraded';

      res.json({
        success: true,
        data: healthCheck
      });
    } catch (error) {
      logger.error('System health check failed', error);
      next(error);
    }
  },

  /**
   * Obtém métricas do sistema
   */
  async getSystemMetrics(req, res, next) {
    try {
      const metrics = {
        users: {
          total: await User.count(),
          active: await User.count({
            where: {
              lastLogin: {
                [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 dias
              }
            }
          }),
          byRole: await getUsersByRole()
        },
        resources: await getResourceMetrics(),
        performance: {
          responseTime: await getAverageResponseTime(),
          uptime: process.uptime()
        }
      };

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      logger.error('Failed to get system metrics', error);
      next(error);
    }
  },

    /**
   * Obtém estatísticas para gráficos
   */
  async getChartStats(req, res, next) {
    try {
      const { range = 'week' } = req.query;
      const now = new Date();
      let startDate, groupBy;
      
      // Define o período e agrupamento
      switch(range) {
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          groupBy = 'day';
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          groupBy = 'day';
          break;
        case 'semester':
          startDate = new Date(now.setMonth(now.getMonth() - 6));
          groupBy = 'month';
          break;
        default:
          startDate = new Date(now.setDate(now.getDate() - 7));
          groupBy = 'day';
      }

      // Consultas paralelas para cada métrica
      const [usersData, coursesData, eventsData] = await Promise.all([
        getUserStats(startDate, groupBy),
        getCourseStats(startDate, groupBy),
        getEventStats(startDate, groupBy)
      ]);

      res.json({
        success: true,
        data: {
          labels: usersData.labels,
          datasets: [
            {
              label: 'Novos Usuários',
              data: usersData.data
            },
            {
              label: 'Novos Cursos',
              data: coursesData.data
            },
            {
              label: 'Novos Eventos',
              data: eventsData.data
            }
          ]
        }
      });
    } catch (error) {
      logger.error('Failed to fetch chart stats', error);
      next(error);
    }
  },

  /**
   * Lista atividades do sistema
   */
  async getActivities(req, res, next) {
    try {
      const { type, userId, entityType, startDate, endDate, page = 1, limit = 20 } = req.query;
      
      const where = {};
      if (type) where.type = type;
      if (userId) where.userId = userId;
      if (entityType) where.entityType = entityType;
      
      // Filtro por data
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt[Op.gte] = new Date(startDate);
        if (endDate) where.createdAt[Op.lte] = new Date(endDate);
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await Activity.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']],
        include: [
          {
            model: User,
            attributes: ['userId', 'username', 'email', 'avatarUrl'],
            as: 'user'
          }
        ]
      });

      res.json({
        success: true,
        data: rows,
        meta: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to fetch activities', error);
      next(error);
    }
  },

  /**
   * Obtém detalhes de uma atividade específica
   */
  async getActivityDetails(req, res, next) {
    try {
      const activity = await Activity.findByPk(req.params.activityId, {
        include: [
          {
            model: User,
            attributes: ['userId', 'username', 'email', 'avatarUrl'],
            as: 'user'
          }
        ]
      });

      if (!activity) {
        throw new BadRequestError('Atividade não encontrada');
      }

      res.json({
        success: true,
        data: activity
      });
    } catch (error) {
      logger.error(`Failed to fetch activity ${req.params.activityId}`, error);
      next(error);
    }
  }
};

// ==============================================
// Serviços Auxiliares
// ==============================================

// Métodos auxiliares

async function getUserStats(startDate, groupBy) {
  const query = `
    SELECT 
      ${groupBy === 'day' ? `to_char("createdAt", 'DD/MM') as label` : `to_char("createdAt", 'MM/YYYY') as label`},
      COUNT(*) as count
    FROM users
    WHERE "createdAt" >= $1
    GROUP BY label
    ORDER BY label
  `;

  const result = await sequelize.query(query, {
    bind: [startDate],
    type: sequelize.QueryTypes.SELECT
  });

  return {
    labels: result.map(r => r.label),
    data: result.map(r => parseInt(r.count))
  };
}

async function getCourseStats(startDate, groupBy) {
  const query = `
    SELECT 
      ${groupBy === 'day' ? `to_char("createdAt", 'DD/MM') as label` : `to_char("createdAt", 'MM/YYYY') as label`},
      COUNT(*) as count
    FROM courses
    WHERE "createdAt" >= $1 AND status = 'published'
    GROUP BY label
    ORDER BY label
  `;

  const result = await sequelize.query(query, {
    bind: [startDate],
    type: sequelize.QueryTypes.SELECT
  });

  return {
    labels: result.map(r => r.label),
    data: result.map(r => parseInt(r.count))
  };
}

async function getEventStats(startDate, groupBy) {
  const query = `
    SELECT 
      ${groupBy === 'day' ? `to_char("createdAt", 'DD/MM') as label` : `to_char("createdAt", 'MM/YYYY') as label`},
      COUNT(*) as count
    FROM events
    WHERE "createdAt" >= $1 AND status = 'scheduled'
    GROUP BY label
    ORDER BY label
  `;

  const result = await sequelize.query(query, {
    bind: [startDate],
    type: sequelize.QueryTypes.SELECT
  });

  return {
    labels: result.map(r => r.label),
    data: result.map(r => parseInt(r.count))
  };
}

async function getUsersByRole() {
  const roles = await User.findAll({
    attributes: [
      'role',
      [sequelize.fn('COUNT', sequelize.col('userId')), 'count']
    ],
    group: ['role']
  });
  
  return roles.reduce((acc, role) => {
    acc[role.role] = role.count;
    return acc;
  }, {});
}


/**
 * Verifica saúde do banco de dados
 */
async function checkDatabaseHealth() {
  try {
    const start = Date.now();
    await sequelize.authenticate();
    const [result] = await sequelize.query('SELECT version()');
    return {
      status: 'healthy',
      responseTime: Date.now() - start,
      version: result[0].version.split(' ')[1]
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

/**
 * Verifica saúde do cache (Redis)
 */
async function checkCacheHealth() {
  try {
    const start = Date.now();
    const redis = require('../config/redis');
    await redis.ping();
    return {
      status: 'healthy',
      responseTime: Date.now() - start,
      version: await redis.info('server').then(info => info.split('\r\n')[1].split(':')[1])
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

/**
 * Verifica saúde do armazenamento
 */
async function checkStorageHealth() {
  try {
    const start = Date.now();
    const { checkStorage } = require('../services/storageService');
    await checkStorage();
    return {
      status: 'healthy',
      responseTime: Date.now() - start
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

/**
 * Verifica saúde do serviço de email
 */
async function checkEmailHealth() {
  try {
    const start = Date.now();
    const { testConnection } = require('../services/emailService');
    await testConnection();
    return {
      status: 'healthy',
      responseTime: Date.now() - start
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

/**
 * Obtém contagem de usuários por role
 */
async function getUsersByRole() {
  const result = await User.findAll({
    attributes: [
      'role',
      [sequelize.fn('COUNT', sequelize.col('userId')), 'count']
    ],
    group: ['role']
  });

  return result.reduce((acc, { role, count }) => {
    acc[role] = count;
    return acc;
  }, {});
}

/**
 * Obtém métricas de recursos
 */
async function getResourceMetrics() {
  const counts = {};

  counts.course = await Course.count();
  counts.lesson = await Lesson.count();
  counts.resource = await Resource.count();
  counts.event = await Event.count();

  return counts;
}

/**
 * Calcula tempo médio de resposta
 */
async function getAverageResponseTime() {
  return {
    lastHour: 125,
    last24h: 142,
    last7d: 156
  };
}