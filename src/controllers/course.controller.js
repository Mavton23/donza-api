const { Course, User, Enrollment, Module, Lesson, UserLesson } = require('../models');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/file-upload.service');
const { 
    NotFoundError, 
    ForbiddenError, 
    BadRequestError 
} = require('../utils/errors');
const notificationService = require('../services/notification.service');
const { sequelize } = require('../configs/db');
const { Op } = require('sequelize')
const { COURSE_STATUS, ROLES } = require('../constants/constants');

module.exports = {
    /**
     * Obtém todos os cursos públicos
     */
    getAllPublicCourses: async (req, res, next) => {
        try {
            const { page = 1, limit = 10, level, language } = req.query;
            const offset = (page - 1) * limit;
            
            const where = { 
                isPublic: true, 
                status: COURSE_STATUS.PUBLISHED 
            };
            
            if (level) where.level = level;
            if (language) where.language = language;
            
            const { count, rows: courses } = await Course.findAndCountAll({
                where,
                limit: parseInt(limit),
                offset: parseInt(offset),
                include: [
                    {
                        model: User,
                        as: 'instructor',
                        attributes: ['userId', 'username', 'avatarUrl']
                    }
                ],
                order: [['createdAt', 'DESC']]
            });
            
            res.json({
                success: true,
                data: courses,
                meta: {
                    total: count,
                    page: parseInt(page),
                    totalPages: Math.ceil(count / limit)
                }
            });
        } catch (error) {
            next(error);
        }
    },

    /**
   * Obtém todos os cursos para o painel administrativo
   */
  getAllAdminCourses: async (req, res, next) => {
      try {
          const { 
              page = 1, 
              limit = 10, 
              status, 
              level, 
              sort = 'newest',
              search
          } = req.query;

          const offset = (page - 1) * limit;
          
          const where = {};
          
          // Filtros
          if (status) where.status = status;
          if (level) where.level = level;
          
          // Busca textual
          if (search) {
              where[Op.or] = [
                  { title: { [Op.iLike]: `%${search}%` } },
                  { description: { [Op.iLike]: `%${search}%` } },
                  { '$instructor.username$': { [Op.iLike]: `%${search}%` } },
                  { '$instructor.fullName$': { [Op.iLike]: `%${search}%` } }
              ];
          }

          // Ordenação
          let order;
          switch (sort) {
              case 'newest':
                  order = [['createdAt', 'DESC']];
                  break;
              case 'oldest':
                  order = [['createdAt', 'ASC']];
                  break;
              case 'popular':
                  order = [['enrolledCount', 'DESC']];
                  break;
              default:
                  order = [['createdAt', 'DESC']];
          }

          const { count, rows: courses } = await Course.findAndCountAll({
              where,
              limit: parseInt(limit),
              offset: parseInt(offset),
              include: [
                  {
                      model: User,
                      as: 'instructor',
                      attributes: ['userId', 'username', 'fullName', 'avatarUrl', 'email']
                  }
              ],
              order,
              paranoid: false
          });
          
          res.json({
              success: true,
              data: courses,
              meta: {
                  total: count,
                  page: parseInt(page),
                  totalPages: Math.ceil(count / limit),
                  limit: parseInt(limit)
              }
          });
      } catch (error) {
          console.log("ERROR: ", error instanceof Error ? error.message : error);
          next(error);
      }
  },

    /**
    * Obtém cursos em destaque (melhores avaliados)
   */
  getFeaturedCourses: async (req, res, next) => {
    try {
      const { limit = 5, minRating = 4.5 } = req.query;

      const courses = await Course.findAll({
        where: {
          status: 'published',
          ratingAverage: {
            [Op.gte]: parseFloat(minRating)
          }
        },
        order: [
          ['ratingAverage', 'DESC'],
          ['ratingCount', 'DESC'] 
        ],
        limit: parseInt(limit),
        include: [
          {
            model: User,
            as: 'instructor',
            attributes: ['userId', 'username', 'avatarUrl']
          }
        ]
      });

      res.json({
        success: true,
        data: courses,
        meta: {
          minRating: parseFloat(minRating),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      next(error);
    }
  },

    /**
     * Obtém cursos matriculados por usuário com filtros compatíveis com o frontend
     */
    getCourseEnrolled: async (req, res, next) => {
        try {
            const { userId } = req.params;
            const { 
                page = 1, 
                search,
                category,
                level,
                sort = 'recent',
                includeProgress = true
            } = req.query;

            const limit = 10;
            const offset = (page - 1) * limit;

            // Construção dos filtros
            const where = {};
            const enrollmentWhere = { userId };

            // Filtro de busca
            if (search) {
                where[Op.or] = [
                    { title: { [Op.iLike]: `%${search}%` } },
                    { shortDescription: { [Op.iLike]: `%${search}%` } }
                ];
            }

            // Filtro de categoria
            if (category) {
                where.category = category;
            }

            // Filtro de nível
            if (level) {
                where.level = level;
            }

            // Ordenação
            let order;
            switch (sort) {
                case 'progress':
                    order = [[{ model: User, as: 'students' }, 'progress', 'DESC']];
                    break;
                case 'rating':
                    order = [['ratingAverage', 'DESC']];
                    break;
                case 'title':
                    order = [['title', 'ASC']];
                    break;
                default:
                    order = [['createdAt', 'DESC']];
            }

            // Configuração do include
            const include = [
                {
                    model: User,
                    as: 'students',
                    where: enrollmentWhere,
                    through: {
                        attributes: includeProgress ? ['progress', 'status', 'completedAt'] : []
                    },
                    required: true,
                    attributes: []
                },
                {
                    model: User,
                    as: 'instructor',
                    attributes: ['userId', 'fullName', 'avatarUrl']
                }
            ];

            const { count, rows: courses } = await Course.findAndCountAll({
                where,
                limit,
                offset,
                include,
                order,
                distinct: true
            });

            // Formatação da resposta para compatibilidade com o frontend
            const responseData = {
                success: true,
                data: courses.map(course => {
                    const courseData = course.get({ plain: true });
                    
                    if (includeProgress && courseData.students && courseData.students.length > 0) {
                        courseData.progress = courseData.students[0].progress;
                        courseData.enrollmentStatus = courseData.students[0].status;
                    }
                    
                    delete courseData.students;
                    
                    return courseData;
                }),
                meta: {
                  page: parseInt(page),
                  totalPages: Math.ceil(count / limit),
                  totalItems: count
                }
            };

            res.json(responseData);
        } catch (error) {
            next(error);
            console.error("Erro em getCourseEnrolled:", error);
        }
    },

    /**
     * Obtém um curso pelo slug (público)
    */
  getCourseBySlug: async (req, res, next) => {
    try {
      const course = await Course.findOne({
        where: { 
          slug: req.params.slug,
          isPublic: true,
        },
        include: [
          {
            model: User,
            as: 'instructor',
            attributes: ['userId', 'username', 'avatarUrl', 'bio']
          },
          {
            model: Module,
            as: 'modules',
            where: { isPublished: true },
            required: false,
            order: [['order', 'ASC']],
            include: [{
              model: Lesson,
              as: 'lessons',
              where: { isPublished: true },
              required: false,
              order: [['order', 'ASC']]
            }]
          },
          {
            model: Enrollment,
            as: 'enrollments',
            attributes: ['enrollmentId', 'userId', 'status'],
            required: false
          }
        ]
      });

      if (!course) {
        throw new NotFoundError('Curso não encontrado');
      }

      const courseData = course.toJSON();
      
      // Calcula métricas
      const totalLessons = courseData.modules?.reduce(
        (sum, module) => sum + (module.lessons?.length || 0), 0
      ) || 0;

      res.json({
        success: true,
        data: {
          ...courseData,
          metrics: {
            ...courseData.metrics,
            lessonsCount: totalLessons,
            modulesCount: courseData.modules?.length || 0
          },
          enrollmentIds: courseData.enrollments?.map(e => e.userId) || []
        }
      });
    } catch (error) {
      next(error);
    }
  },

    /**
    * Obtém um curso específico com dados completos do criador
    */
    getCourseById: async (req, res, next) => {
    try {
      const { courseId } = req.params;
  
      const course = await Course.findByPk(courseId, {
        include: [
          {
            model: User,
            as: 'organizer',
            attributes: ['userId', 'username', 'institutionName', 'avatarUrl', 'role', 'institutionType', 'website']
          },
          {
            model: Module,
            as: 'modules',
            attributes: ['moduleId', 'title', 'order', 'isPublished'],
            include: [{
              model: Lesson,
              as: 'lessons',
              attributes: ['lessonId', 'title', 'content', 'videoUrl', 'duration', 'order', 'lessonType']
            }],
            order: [
              ['order', 'ASC'],
              [Lesson, 'order', 'ASC']
            ]
          }
        ]
      });
  
      if (!course) {
        throw new NotFoundError('Course not found');
      }
  
      // Determina o criador do curso
      const creator = course.instructor || course.organizer;
      
      // Formata os dados para resposta
      const responseData = {
        ...course.get({ plain: true }),
        creator: {
          ...creator.get({ plain: true }),
          displayName: creator.role === 'institution' 
            ? creator.institutionName 
            : creator.fullName || creator.username
        },
        metrics: {
          ...course.metrics,
          lessonsCount: course.modules?.reduce(
            (total, module) => total + (module.lessons?.length || 0), 0) || 0,
          modulesCount: course.modules?.length || 0
        }
      };
  
      res.json({
        success: true,
        data: {
          course: responseData
        }
      });
    } catch (error) {
      console.log("ERRO NO GETCOURSEBYID: ", error instanceof Error ? error.message : error);
      next(error);
    }
    },


  /**
   * Cria um novo curso (apenas instrutores/admins)
  */
  createCourse: async (req, res, next) => {
    try {
      const { userId, role } = req.user;

      if (!req.file || !req.file.buffer) {
        throw new BadRequestError('A imagem de capa é obrigatória');
      }

      let coverImageUrl;
      try {
        const result = await uploadToCloudinary(req.file, {
          folder: `course-covers/${userId}`,
          resource_type: 'image',
          transformation: [
            { width: 1200, height: 675, crop: 'fill' },
            { quality: 'auto:best' }
          ]
        });
        coverImageUrl = result.secure_url;
        console.log('Upload da imagem de capa realizado com sucesso:', coverImageUrl);
      } catch (uploadError) {
        console.error('Erro no upload da imagem para o Cloudinary:', uploadError);
        throw new Error('Falha ao processar a imagem de capa');
      }

      const parseArrayField = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return value.split(',').map(item => item.trim()).filter(Boolean);
        }
      };

      const courseData = {
        title: req.body.title?.trim(),
        shortDescription: req.body.shortDescription?.trim(),
        description: req.body.description?.trim(),
        category: req.body.category || 'technology',
        level: req.body.level || 'beginner',
        language: req.body.language || 'Portuguese',
        duration: Math.max(1, parseInt(req.body.duration) || 1),
        price: Math.max(0, parseFloat(req.body.price) || 0),
        currency: req.body.currency || 'USD',
        isPublic: req.body.isPublic === 'true',
        requirements: parseArrayField(req.body.requirements),
        learningOutcomes: parseArrayField(req.body.learningOutcomes),
        modules: parseArrayField(req.body.modules)
      };

      if (!courseData.title || courseData.title.length < 5) {
        throw new BadRequestError('O título do curso deve ter pelo menos 5 caracteres');
      }

      if (!courseData.shortDescription || courseData.shortDescription.length < 10) {
        throw new BadRequestError('A descrição curta deve ter pelo menos 10 caracteres');
      }

      const course = await Course.create({
        ...courseData,
        organizerId: userId,
        instructorId: role === 'instructor' ? userId : null,
        coverImageUrl,
        status: req.body.isPublished === 'true' ? COURSE_STATUS.PUBLISHED : COURSE_STATUS.DRAFT
      });

      try {
        await notificationService.notifyCourseCreated(course, req.user);
      } catch (notificationError) {
        console.error('Erro ao enviar notificação de curso criado:', notificationError);
      }

      res.status(201).json({
        success: true,
        data: {
          courseId: course.courseId,
          title: course.title,
          status: course.status,
          coverImageUrl: course.coverImageUrl,
          createdAt: course.createdAt
        }
      });

    } catch (error) {
      console.error('Erro detalhado na criação do curso:', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error,
        body: req.body,
        file: req.file
      });
      next(error);
    }
  },

    /**
    * Atualiza um curso (apenas dono do curso ou admin)
    */
    updateCourse: async (req, res, next) => {
        try {
            const { courseId } = req.params;
            const { userId, role } = req.user;
            let updateData = req.body;
    
            // Converter campos de array
            ['requirements', 'learningOutcomes'].forEach(field => {
                if (updateData[field] && !Array.isArray(updateData[field])) {
                    updateData[field] = updateData[field].split(',').map(item => item.trim());
                }
            });
    
            const course = await Course.findByPk(courseId);
            if (!course) {
                throw new NotFoundError('Curso não encontrado');
            }
    
            // Verifica permissões
            if (course.instructorId !== userId && role !== ROLES.ADMIN) {
                throw new ForbiddenError('Você não tem permissão para editar este curso');
            }
    
            // Atualiza a capa
            if (req.file) {
                if (course.coverImageUrl) {
                    await deleteFromCloudinary(course.coverImageUrl);
                }
                
                const result = await uploadToCloudinary(req.file, 'course-covers');
                updateData.coverImageUrl = result.secure_url;
            }
    
            await course.update(updateData);

            // Notifica o organizador sobre a publicação
            await notificationService.notifyCoursePublished(course);
    
            res.json({
                success: true,
                data: course
            });
        } catch (error) {
            console.log("MOTIVO: ", error.message);
            next(error);
        }
    },

    /**
     * Deleta um curso (apenas dono do curso ou admin)
     */
    deleteCourse: async (req, res, next) => {
        try {
            const { courseId } = req.params;
            const { userId, role } = req.user;

            const course = await Course.findByPk(courseId, {
              include: [{
                model: User,
                as: 'students',
                attributes: ['userId', 'username', email]
              }]
            });

            if (!course) {
                throw new NotFoundError('Curso não encontrado');
            }


            // Verifica permissões
            if (course.instructorId !== userId && role !== ROLES.ADMIN) {
                throw new ForbiddenError('Você não tem permissão para deletar este curso');
            }

            const affectedUsers = [...course.students];
            if (course.organizerId !== req.user.userId) {
              const organizer = await User.findByPk(course.organizerId);
              affectedUsers.push(organizer);
            }

            // Remove a capa
            if (course.coverImageUrl) {
                await deleteFromCloudinary(course.coverImageUrl);
            }

            await course.destroy();

            // Enviar notificações
            await notificationService.notifyCourseDeleted(
              course,
              req.user,
              affectedUsers
            );

            res.json({
                success: true,
                message: 'Curso excluido com sucesso'
            });
        } catch (error) {
            next(error);
        }
    },

    /**
    * Obtém todos os cursos do usuário com dados completos do criador
    */
    getAllCourses: async (req, res, next) => {
      try {
        const { userId } = req.params;
        const { status } = req.query;
        
        // Verificação de permissão
        if (req.user.userId !== userId && req.user.role !== 'admin') {
          return res.status(403).json({
            success: false,
            message: 'Você não tem permissão para acessar estes cursos'
          });
        }
        
        const where = { 
          [Op.or]: [
            { instructorId: userId },
            { organizerId: userId }
          ]
        };
        
        if (status) {
          where.status = status;
        }
        
        const courses = await Course.findAll({
          where,
          include: [
            {
              model: User,
              as: 'instructor',
              attributes: [
                'userId', 
                'username',
                'fullName',
                'avatarUrl',
                'role',
                'bio',
                'expertise'
              ]
            },
            {
              model: User,
              as: 'organizer',
              attributes: [
                'userId',
                'username',
                'institutionName',
                'avatarUrl',
                'role',
                'institutionType',
                'website'
              ]
            },
            {
              model: Module,
              as: 'modules',
              attributes: ['moduleId'],
              include: [{
                model: Lesson,
                as: 'lessons',
                attributes: ['lessonId']
              }]
            }
          ],
          order: [['createdAt', 'DESC']]
        });
    
        // Formatar os dados para resposta
        const formattedCourses = courses.map(course => {
          // Determinar o criador do curso
          const creator = course.instructor || course.organizer;
          
          // Calcular número de aulas
          const lessonsCount = course.modules?.reduce(
            (total, module) => total + (module.lessons?.length || 0), 0
          ) || 0;
    
          // Criar objeto de resposta
          return {
            ...course.get({ plain: true }),
            creator: {
              ...creator.get({ plain: true }),
              displayName: creator.role === 'institution' 
                ? creator.institutionName 
                : creator.fullName || creator.username
            },
            metrics: {
              ...course.metrics,
              lessonsCount,
              modulesCount: course.modules?.length || 0
            }
          };
        });
    
        res.json({
          success: true,
          data: {
            courses: formattedCourses
          }
        });
      } catch (error) {
          console.log("ERRO NO GETALLCOURSES: ", error instanceof Error ? error.message : error);
        next(error);
      }
    },
  
  /**
   * Obtém contagens de cursos por status
   */
  getCourseCounts: async (req, res, next) => {
    try {
      const { userId } = req.params;
      
      const counts = await Course.findAll({
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('courseId')), 'count']
        ],
        where: {
          [Op.or]: [
            { instructorId: userId },
            { organizerId: userId }
          ]
        },
        group: ['status']
      });
      
      // Formata o resultado
      const result = {
        [COURSE_STATUS.DRAFT]: 0,
        [COURSE_STATUS.PUBLISHED]: 0,
        [COURSE_STATUS.ARCHIVED]: 0
      };
      
      counts.forEach(item => {
        result[item.status] = parseInt(item.get('count'));
      });
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Check enrollment status for user
   */
  checkEnroll: async (req, res, next) => {
    try {
      const { courseId, userId } = req.params;
      
      // Verificar se o curso existe
      const course = await Course.findByPk(courseId);
      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }
      
      // Verificar se o usuário existe
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Verificar matrícula
      const enrollment = await Enrollment.findOne({
        where: {
          courseId,
          userId
        }
      });
      
      res.json({
        isEnrolled: !!enrollment,
        enrollment: enrollment || null
      });
      
    } catch (error) {
      console.log("Motivo: ", error instanceof Error ? error.message : error);
      next(error);
    }
  },

    /**
     * Matrícula de estudante em curso
     */
    enrollInCourse: async (req, res, next) => {
        try {
            const { courseId } = req.params;
            const { userId } = req.user;

            const [course, student] = await Promise.all([
              Course.findOne({
                  where: {
                      courseId,
                      status: COURSE_STATUS.PUBLISHED,
                      isPublic: true
                  }
              }),
              User.findByPk(userId)
            ]);
            
            if (!course) {
              throw new NotFoundError('Curso não encontrado ou não disponível para matrícula');
            }

            if (!student) {
              throw new NotFoundError('Usuário não encontrado');
            }

            // Verifica se já está matriculado
            const existingEnrollment = await Enrollment.findOne({
                where: { userId, courseId }
            });

            if (existingEnrollment) {
                throw new BadRequestError('Você já está matriculado neste curso');
            }

            // Cria a matrícula
            const enrollment = await Enrollment.create({
                userId,
                courseId,
                status: 'active',
                progress: 0
            });

            // Notifica o organizador sobre a nova matrícula
            await notificationService.notifyCourseEnrollment(course, student);

            res.status(201).json({
                success: true,
                data: enrollment
            });
        } catch (error) {
          console.log("ERRO NA MATRICULA: ", error instanceof Error ? error.message : error);
            next(error);
        }
    },

    /**
     * Remover a matrícula de um estudante em um curso
     */
    removeEnrollment: async (req, res, next) => {
      try {
        const { userId, courseId } = req.params;
    
        if (req.user.userId !== userId) {
          return res.status(403).json({ 
            message: 'You can only cancel your own enrollments' 
          });
        }
    
        // Verificar se a matrícula existe
        const enrollment = await sequelize.models.Enrollment.findOne({
          where: {
            userId,
            courseId
          }
        });
    
        if (!enrollment) {
          return res.status(404).json({ 
            message: 'Enrollment not found' 
          });
        }
    
        // Remover a matrícula
        await enrollment.destroy();
    
        // Atualizar contador de matrículas no curso
        await sequelize.models.Course.decrement('metrics.enrollments', {
          where: { courseId }
        });
    
        res.status(204).end();
      } catch (error) {
        console.error('Error removing enrollment:', error);
        next(error);
      }
    },

    /**
   * Obtém progresso no curso usando slug como identificador
   */
  getCourseProgress: async (req, res, next) => {
      try {
          const { slug } = req.params;
          const { userId } = req.user;

          // Buscar o curso pelo slug para obter o courseId
          const course = await Course.findOne({
              where: { slug },
              attributes: ['courseId'],
              raw: true
          });

          if (!course) {
              throw new NotFoundError('Curso não encontrado');
          }

          const { courseId } = course;

          // Verifica se o usuário está matriculado
          const enrollment = await Enrollment.findOne({
              where: { userId, courseId }
          });

          if (!enrollment) {
              throw new ForbiddenError('Você não está matriculado neste curso');
          }

          // Calcula progresso baseado em aulas concluídas
          const totalLessons = await Lesson.count({
              include: [{
                  model: Module,
                  as: 'module',
                  where: { courseId }
              }]
          });

          const completedLessons = await UserLesson.count({
              where: { 
                  userId,
                  completed: true 
              },
              include: [{
                  model: Lesson,
                  include: [{
                      model: Module,
                      as: 'module',
                      where: { courseId }
                  }]
              }]
          });

          const progress = totalLessons > 0 
              ? Math.round((completedLessons / totalLessons) * 100)
              : 0;

          // Atualiza o progresso na matrícula se necessário
          if (enrollment.progress !== progress) {
              await enrollment.update({ progress });
          }

          res.json({
              success: true,
              data: {
                  progress,
                  completedLessons,
                  totalLessons,
                  enrollment,
                  courseId
              }
          });
      } catch (error) {
          console.error('Error in getCourseProgress:', error instanceof Error ? error.message : error);
          next(error);
      }
  },

    /**
   * Obtém estatísticas de conclusão do curso
   */
  getCourseCompletionStats: async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const { userId, role } = req.user;

        // Verifica se o curso existe
        const course = await Course.findByPk(courseId, {
            include: [{
                model: Module,
                as: 'modules',
                attributes: ['moduleId', 'title', 'isPublished'],
                include: [{
                    model: Lesson,
                    as: 'lessons',
                    attributes: ['lessonId', 'isPublished']
                }]
            }]
        });

        if (!course) {
            throw new NotFoundError('Course not found');
        }

        // Para estudantes, verifica matrícula
        if (role === ROLES.STUDENT) {
            const enrollment = await Enrollment.findOne({
                where: {
                    userId,
                    courseId,
                    status: 'active'
                }
            });

            if (!enrollment) {
                throw new ForbiddenError('You are not enrolled in this course');
            }
        }

        // Calcula estatísticas de módulos
        const totalModules = course.modules.filter(m => m.isPublished).length;
        let completedModules = 0;
        let currentModule = null;

        // Para estudantes, calcula progresso real
        if (role === ROLES.STUDENT) {
            const allLessons = course.modules.flatMap(m => 
                m.lessons.filter(l => l.isPublished)
            );

            // Obtém lições concluídas pelo usuário
            const completedLessons = await UserLesson.findAll({
                where: {
                    userId,
                    completed: true,
                    lessonId: {
                        [Op.in]: allLessons.map(l => l.lessonId)
                    }
                },
                attributes: ['lessonId']
            });

            // Mapeia lições concluídas para fácil acesso
            const completedLessonIds = completedLessons.map(cl => cl.lessonId);

            // Agrupa por módulo
            const modulesCompletion = {};
            course.modules.forEach(module => {
                const publishedLessons = module.lessons.filter(l => l.isPublished);
                if (publishedLessons.length === 0) return;

                const completedInModule = publishedLessons.filter(l => 
                    completedLessonIds.includes(l.lessonId)
                ).length;

                modulesCompletion[module.moduleId] = {
                    title: module.title,
                    completed: completedInModule === publishedLessons.length,
                    progress: publishedLessons.length > 0 ? 
                        (completedInModule / publishedLessons.length) * 100 : 0
                };
            });

            // Calcula módulos completos
            completedModules = Object.values(modulesCompletion)
                .filter(m => m.completed).length;

            // Encontra o módulo atual
            currentModule = Object.values(modulesCompletion)
                .find(m => !m.completed)?.title || null;
        } else {
            // Para instrutores/admins, mostra dados gerais
            currentModule = course.modules.find(m => m.isPublished)?.title || null;
        }

        res.json({
            success: true,
            data: {
                completedModules,
                totalModules,
                currentModule,
                progress: course.metrics?.completionRate || 0
            }
        });
    } catch (error) {
        console.error("Error in getCourseCompletionStats:", error);
        next(error);
    }
}
};