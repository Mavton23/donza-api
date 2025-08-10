const { Review, Course, User, Enrollment } = require('../models');
const { 
    NotFoundError, 
    ForbiddenError, 
    BadRequestError 
} = require('../utils/errors');
const ReviewService = require('../services/review.service');
const { sequelize } = require('../configs/db');
const { ROLES } = require('../constants/constants');

// Função auxiliar para calcular a média
async function getAverageRating(courseId) {
    const result = await Review.findOne({
        where: { 
            courseId,
            isApproved: true 
        },
        attributes: [
            [sequelize.fn('AVG', sequelize.col('rating')), 'avg'],
            [sequelize.fn('COUNT', sequelize.col('reviewId')), 'count']
        ],
        raw: true
    });
    
    return {
        rating: parseFloat(result.avg) || 0,
        count: result.count || 0
    };
}

module.exports = {
    /**
     * 
     */
    getEntityReviews: async (req, res, next) => {
        try {
          const { entityType, entityId } = req.params;
          const { page = 1, limit = 10, sort = 'recent', rating, hasComment } = req.query;
          const normalizedEntityType = entityType === 'courses' ? 'course' : entityType;

          const reviews = await ReviewService.getEntityReviews({
            entityType: normalizedEntityType,
            entityId,
            page: parseInt(page),
            limit: parseInt(limit),
            sort,
            rating: rating !== 'all' ? parseInt(rating) : null,
            hasComment: hasComment === 'true'
          });
          
          res.json(reviews);
        } catch (error) {
            console.log("Motivo: ", error instanceof Error ? error.message : error)
          next(error);
        }
      },

      getReviewSummary: async (req, res, next) => {
        try {
          const { entityType, entityId } = req.params;
          const summary = await ReviewService.getReviewSummary(entityType, entityId);
          res.json(summary);
        } catch (error) {
          next(error);
        }
      },

      canUserReview: async (req, res, next) => {
        try {
          const { entityType, entityId } = req.params;
          const userId = req.user.userId;
          
          const canReview = await ReviewService.canUserReview({
            userId,
            entityType,
            entityId
          });
          
          res.json({ canReview });
        } catch (error) {
          next(error);
        }
      },

      submitReview: async (req, res, next) => {
        try {
          const { entityType, entityId } = req.params;
          const userId = req.user.id;
          const { rating, comment } = req.body;
          
          const review = await ReviewService.submitReview({
            userId,
            entityType,
            entityId,
            rating,
            comment
          });
          
          res.status(201).json(review);
        } catch (error) {
          next(error);
        }
      },

      submitReply: async (req, res, next) => {
        try {
          const { reviewId } = req.params;
          const { reply } = req.body;
          const userId = req.user.userId;
          
          const updatedReview = await ReviewService.submitReply({
            reviewId,
            userId,
            reply
          });
          
          res.json(updatedReview);
        } catch (error) {
          next(error);
        }
      },
      
      getAnalytics: async (req, res, next) => {
        try {
          const { institutionId } = req.user;
          const { dateRange, instructorId, minRating } = req.query;
          
          const analytics = await ReviewService.getAnalytics({
            institutionId,
            dateRange,
            instructorId,
            minRating
          });
          
          res.json(analytics);
        } catch (error) {
          next(error);
        }
      },

    /**
     * Obtém todas as avaliações de um curso (público)
     */
    getCourseReviews: async (req, res, next) => {
        try {
            const { courseId } = req.params;
            const { page = 1, limit = 10, rating } = req.query;
            const offset = (page - 1) * limit;
            
            console.log("COMMING COURSEID: ", courseId)
            // Verifica se o curso existe
            const courseExists = await Course.findByPk(courseId, {
                attributes: ['courseId']
            });
            if (!courseExists) {
                throw new NotFoundError('Curso não encontrado');
            }
    
            const where = { 
                courseId,
                isApproved: true 
            };
    
            if (rating) where.rating = parseInt(rating);
    
            const { count, rows: reviews } = await Review.findAndCountAll({
                where,
                limit: parseInt(limit),
                offset: parseInt(offset),
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['userId', 'username', 'avatarUrl']
                    },
                    {
                        model: Course,
                        as: 'course',
                        attributes: [],
                        include: [{
                            model: User,
                            as: 'instructor',
                            attributes: ['userId', 'username', 'avatarUrl']
                        }]
                    }
                ],
                // Ordena por respostas primeiro
                order: [
                    [sequelize.literal('"instructorReply" IS NULL'), 'ASC'],
                    ['createdAt', 'DESC']
                ],
                subQuery: false
            });
    
            res.json({
                success: true,
                data: reviews.map(review => ({
                    ...review.get({ plain: true }),
                    course: {
                        instructor: review.course?.instructor || null
                    }
                })),
                meta: {
                    total: count,
                    page: parseInt(page),
                    totalPages: Math.ceil(count / limit),
                    averageRating: await getAverageRating(courseId)
                }
            });
        } catch (error) {
            console.log("MOTIVO: ", error instanceof Error ? error.message : error)
            next(error);
        }
    },

    /**
     * Obtém avaliações por slug do curso
     */
    getCourseReviewsBySlug: async (req, res, next) => {
        try {
            const { slug } = req.params;
            
            const course = await Course.findOne({ where: { slug } });
            if (!course) {
                throw new NotFoundError('Curso não encontrado');
            }

            req.params.courseId = course.courseId;
            return module.exports.getCourseReviews(req, res, next);
        } catch (error) {
            next(error);
        }
    },

    /**
     * Cria uma nova avaliação
     */
    createReview: async (req, res, next) => {
        const transaction = await sequelize.transaction();

        try {
            const { courseId } = req.params;
            const { rating, comment, anonymous } = req.body;
            const userId = req.user.userId;
    
            // Verifica se o curso existe e está publicado
            const course = await Course.findOne({
                where: { 
                    courseId,
                    status: 'published' 
                },
                transaction
            });
            if (!course) {
                throw new NotFoundError('Curso não encontrado ou não publicado');
            }
    
            // Verifica matrícula
            const enrollment = await Enrollment.findOne({
                where: { 
                    userId,
                    courseId,
                    status: 'completed'
                },
                transaction
            });
            if (!enrollment) {
                throw new ForbiddenError('Você precisa completar o curso para avaliá-lo');
            }
    
            // Verifica review existente
            const existingReview = await Review.findOne({
                where: { 
                    userId,
                    entityId: courseId,
                    entityType: 'course'
                },
                transaction
            });
            if (existingReview) {
                throw new BadRequestError('Você já avaliou este curso');
            }
    
            // Cria a review com a estrutura do modelo
            const review = await Review.create({
                userId,
                entityType: 'course',
                entityId: courseId,
                rating,
                comment,
                isPublic: !anonymous,
                courseId
            }, transaction);
    
            // Atualiza métricas
            await updateCourseRating(courseId);
    
            res.status(201).json({
                success: true,
                data: review
            });
        } catch (error) {
            transaction.rollback();
            console.log("Motivo: ", error instanceof Error ?  error.message : null);
            next(error);
        }
    },

    /**
     * Atualiza o status de uma avaliação (moderação)
     */
    updateReviewStatus: async (req, res, next) => {
        try {
            const { reviewId } = req.params;
            const { isApproved } = req.body;

            const review = await Review.findByPk(reviewId, {
                include: {
                    model: Course,
                    as: 'course',
                    attributes: ['courseId']
                }
            });
            if (!review) {
                throw new NotFoundError('Avaliação não encontrada');
            }

            // Verifica se o moderador é o instrutor do curso ou admin
            if (req.user.role === ROLES.INSTRUCTOR) {
                const isCourseInstructor = review.course.instructorId === req.user.userId;
                if (!isCourseInstructor) {
                    throw new ForbiddenError('Apenas o instrutor deste curso pode moderar avaliações');
                }
            }

            await review.update({ isApproved });
            
            // Atualiza as métricas do curso
            await updateCourseRating(review.course.courseId);

            res.json({
                success: true,
                data: review
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * Adicionar uma resposta para uma avaliação (moderação)
     */
    addReply: async (req, res, next) => {
        try {
          const { reviewId } = req.params;
          const { reply } = req.body;
          const userId = req.user.userId;
      
          const review = await Review.findByPk(reviewId, {
            include: {
              model: Course,
              as: 'course',
              attributes: ['instructorId']
            }
          });
      
          // Verifica se a review existe
          if (!review) {
            throw new NotFoundError('Avaliação não encontrada');
          }
      
          // Verifica se o usuário é o instrutor do curso ou admin
          const isInstructor = review.course.instructorId === userId;
          const isAdmin = req.user.role === ROLES.ADMIN;
          
          if (!isInstructor && !isAdmin) {
            throw new ForbiddenError('Apenas o instrutor deste curso pode responder');
          }
      
          // Atualiza a review
          const updatedReview = await review.update({
            instructorReply: reply,
            repliedAt: new Date()
          });
      
          res.json({
            success: true,
            data: {
              reply: updatedReview.instructorReply,
              repliedAt: updatedReview.repliedAt
            }
          });
        } catch (error) {
          next(error);
        }
    },

    /**
     * Atualiza uma avaliação (apenas autor ou admin)
     */
    updateReview: async (req, res, next) => {
        try {
            const { reviewId } = req.params;
            const { rating, comment } = req.body;
            const userId = req.user.userId;

            const review = await Review.findByPk(reviewId);
            if (!review) {
                throw new NotFoundError('Avaliação não encontrada');
            }

            // Verifica se o usuário é o autor ou admin
            const isAuthor = review.userId === userId;
            const isAdmin = req.user.role === ROLES.ADMIN;
            if (!isAuthor && !isAdmin) {
                throw new ForbiddenError('Você não tem permissão para editar esta avaliação');
            }

            const updatedReview = await review.update({
                rating: rating || review.rating,
                comment: comment !== undefined ? comment : review.comment,
                isApproved: isAdmin ? true : false
            });

            // Atualiza as métricas do curso
            await updateCourseRating(review.courseId);

            res.json({
                success: true,
                data: updatedReview
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * Remove uma avaliação
     */
    deleteReview: async (req, res, next) => {
        try {
            const { reviewId } = req.params;
            const userId = req.user.userId;

            const review = await Review.findByPk(reviewId);
            if (!review) {
                throw new NotFoundError('Avaliação não encontrada');
            }

            // Verifica se o usuário é o autor, instrutor do curso ou admin
            const isAuthor = review.userId === userId;
            const isAdmin = req.user.role === ROLES.ADMIN;
            
            let isInstructor = false;
            if (req.user.role === ROLES.INSTRUCTOR) {
                const course = await Course.findByPk(review.courseId);
                isInstructor = course.instructorId === userId;
            }

            if (!isAuthor && !isAdmin && !isInstructor) {
                throw new ForbiddenError('Você não tem permissão para excluir esta avaliação');
            }

            const courseId = review.courseId;
            await review.destroy();

            // Atualiza as métricas do curso
            await updateCourseRating(courseId);

            res.json({
                success: true,
                message: 'Avaliação removida com sucesso'
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * Obtém avaliações pendentes de moderação (apenas admin/instrutores)
     */
    getPendingReviews: async (req, res, next) => {
        try {
            const { page = 1, limit = 10 } = req.query;
            const offset = (page - 1) * limit;

            let where = { isApproved: false };

            // Instrutores só veem reviews de seus próprios cursos
            if (req.user.role === ROLES.INSTRUCTOR) {
                const instructorCourses = await Course.findAll({
                    where: { instructorId: req.user.userId },
                    attributes: ['courseId']
                });
                where.courseId = instructorCourses.map(c => c.courseId);
            }

            const { count, rows: reviews } = await Review.findAndCountAll({
                where,
                limit: parseInt(limit),
                offset: parseInt(offset),
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['userId', 'username', 'avatarUrl']
                    },
                    {
                        model: Course,
                        as: 'course',
                        attributes: ['courseId', 'title']
                    }
                ],
                order: [['createdAt', 'ASC']]
            });

            res.json({
                success: true,
                data: reviews,
                meta: {
                    total: count,
                    page: parseInt(page),
                    totalPages: Math.ceil(count / limit)
                }
            });
        } catch (error) {
            next(error);
        }
    }
};

/**
 * Helper: Atualiza a média de avaliações de um curso
 */
async function updateCourseRating(courseId) {
    const result = await Review.findAll({
        where: { 
            courseId
        },
        attributes: [
            [sequelize.fn('AVG', sequelize.col('rating')), 'avgRating'],
            [sequelize.fn('COUNT', sequelize.col('reviewId')), 'count']
        ],
        raw: true
    });

    await Course.update({
        ratingAverage: parseFloat(result[0].avgRating) || 0,
        ratingCount: result[0].count || 0
    }, {
        where: { courseId }
    });
}