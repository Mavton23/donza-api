const { Testimonial } = require('../models');
const { Op } = require('sequelize');

// Helper para validação de entrada
const validateTestimonialInput = (data) => {
  const errors = {};
  let isValid = true;

  if (!data.content || data.content.length < 10) {
    errors.content = 'O depoimento deve ter pelo menos 10 caracteres';
    isValid = false;
  }

  if (!data.rating || data.rating < 1 || data.rating > 5) {
    errors.rating = 'Avaliação inválida (deve ser entre 1 e 5)';
    isValid = false;
  }

  if (data.source === 'external' && (!data.externalAuthor || !data.externalRole)) {
    errors.externalInfo = 'Para depoimentos externos, autor e função são obrigatórios';
    isValid = false;
  }

  return {
    isValid,
    errors,
  };
};

module.exports = {
  // Criar um novo depoimento
  async createTestimonial(req, res) {
    try {
      const { isValid, errors } = validateTestimonialInput(req.body);
      if (!isValid) {
        return res.status(400).json({ success: false, errors });
      }

      const testimonialData = {
        ...req.body,
        userId: req.user?.userId || null,
      };

      const testimonial = await Testimonial.create(testimonialData);

      res.status(201).json({
        success: true,
        data: testimonial,
        message: 'Depoimento criado com sucesso! Ele será revisado antes de ser publicado.',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erro ao criar depoimento',
        error: error.message,
      });
    }
  },

  // Listar depoimentos (com filtros)
  async listTestimonials(req, res) {
    try {
      const {
        status = 'approved',
        featured,
        courseId,
        userId,
        source,
        limit = 10,
        offset = 0,
      } = req.query;

      const where = { status };

      if (featured !== undefined) {
        where.featured = featured === 'true';
      }

      if (courseId) {
        where.courseId = courseId;
      }

      if (userId) {
        where.userId = userId;
      }

      if (source) {
        where.source = source;
      }

      const { count, rows } = await Testimonial.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']],
        include: [
          {
            association: 'author',
            attributes: ['userId', 'username', 'fullName', 'avatarUrl', 'role'],
          },
        ],
      });

      res.json({
        success: true,
        data: rows,
        meta: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erro ao listar depoimentos',
        error: error.message,
      });
    }
  },

  async listAdminTestimonials(req, res) {
    try {
      const {
        status,
        featured,
        courseId,
        userId,
        source,
        search,
        limit = 20,
        offset = 0,
        sortBy = 'createdAt',
        sortOrder = 'DESC'
      } = req.query;

      const where = {};
      
      // Filtros flexíveis para admin
      if (status) where.status = status;
      if (featured !== undefined) where.featured = featured === 'true';
      if (courseId) where.courseId = courseId;
      if (userId) where.userId = userId;
      if (source) where.source = source;

      // Busca textual
      if (search) {
        where[Op.or] = [
          { content: { [Op.iLike]: `%${search}%` } },
          { '$author.username$': { [Op.iLike]: `%${search}%` } },
          { '$author.fullName$': { [Op.iLike]: `%${search}%` } },
          { '$externalAuthor$': { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await Testimonial.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [[sortBy, sortOrder]],
        include: [
          {
            association: 'author',
            attributes: ['userId', 'username', 'email', 'fullName', 'avatarUrl', 'role', 'createdAt'],
          },
        ],
        paranoid: false
      });

      res.json({
        success: true,
        data: rows,
        meta: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      console.log("ERROR: ", error instanceof Error ? error.message : error);
      res.status(500).json({
        success: false,
        message: 'Erro ao listar depoimentos',
        error: error.message,
      });
    }
  },

  // Atualizar um depoimento (apenas admin/owner)
  async updateTestimonial(req, res) {
    try {
      const { testimonialId } = req.params;
      const testimonial = await Testimonial.findByPk(testimonialId);

      if (!testimonial) {
        return res.status(404).json({
          success: false,
          message: 'Depoimento não encontrado',
        });
      }

      // Verificar permissões (admin ou autor do depoimento)
      const isAdmin = req.user?.role === 'admin';
      const isOwner = testimonial.userId === req.user?.userId;

      if (!isAdmin && !isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Você não tem permissão para atualizar este depoimento',
        });
      }

      const { isValid, errors } = validateTestimonialInput(req.body);
      if (!isValid) {
        return res.status(400).json({ success: false, errors });
      }

      // Admin pode atualizar status/featured, usuário comum não
      const updateData = isAdmin
        ? req.body
        : {
            content: req.body.content,
            rating: req.body.rating,
          };

      await testimonial.update(updateData);

      res.json({
        success: true,
        data: testimonial,
        message: 'Depoimento atualizado com sucesso',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar depoimento',
        error: error.message,
      });
    }
  },

  // Deletar um depoimento (apenas admin/owner)
  async deleteTestimonial(req, res) {
    try {
      const { testimonialId } = req.params;
      const testimonial = await Testimonial.findByPk(testimonialId);

      if (!testimonial) {
        return res.status(404).json({
          success: false,
          message: 'Depoimento não encontrado',
        });
      }

      // Verificar permissões (admin ou autor do depoimento)
      const isAdmin = req.user?.role === 'admin';
      const isOwner = testimonial.userId === req.user?.userId;

      if (!isAdmin && !isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Você não tem permissão para deletar este depoimento',
        });
      }

      await testimonial.destroy();

      res.json({
        success: true,
        message: 'Depoimento deletado com sucesso',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erro ao deletar depoimento',
        error: error.message,
      });
    }
  },

  // Moderar depoimento (apenas admin)
  async moderateTestimonial(req, res) {
    try {
      const { testimonialId } = req.params;
      const { status, featured } = req.body;

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Status inválido (deve ser "approved" ou "rejected")',
        });
      }

      const testimonial = await Testimonial.findByPk(testimonialId);

      if (!testimonial) {
        return res.status(404).json({
          success: false,
          message: 'Depoimento não encontrado',
        });
      }

      // Verificar se é admin
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Apenas administradores podem moderar depoimentos',
        });
      }

      const updateData = { status };
      if (featured !== undefined) {
        updateData.featured = featured;
      }

      await testimonial.update(updateData);

      res.json({
        success: true,
        data: testimonial,
        message: 'Depoimento moderado com sucesso',
      });
    } catch (error) {
      console.log("ERROR: ", error instanceof Error ? error.message : error);
      res.status(500).json({
        success: false,
        message: 'Erro ao moderar depoimento',
        error: error.message,
      });
    }
  },

  // Obter depoimentos em destaque
  async getFeaturedTestimonials(req, res) {
    try {
      const testimonials = await Testimonial.findAll({
        where: {
          status: 'approved',
          featured: true,
        },
        limit: 5,
        order: [['createdAt', 'DESC']],
        include: [
          {
            association: 'author',
            attributes: ['userId', 'username', 'fullName', 'avatarUrl', 'role'],
          },
        ],
      });

      res.json({
        success: true,
        data: testimonials,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erro ao obter depoimentos em destaque',
        error: error.message,
      });
    }
  },
};