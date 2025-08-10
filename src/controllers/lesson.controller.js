const { User, Lesson, Module, Course, UserLesson, Enrollment } = require('../models');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/file-upload.service');
const { generateVideoThumbnail, generatePdfThumbnail } = require('../utils/generateThumbnails');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../utils/errors');
const notificationService = require('../services/notification.service');
const { ROLES, LESSON_TYPES } = require('../constants/constants');
const { sequelize } = require('../configs/db');

/**
 * Atualiza a duração total do curso somando todas as lições
 * @param {string} courseId - ID do curso a ser atualizado
 */
const updateCourseDuration = async (courseId) => {
    try {
        // Calcula a soma de todas as durações das lições do curso (em minutos)
        const totalMinutes = await Lesson.sum('duration', {
            include: [{
                model: Module,
                as: 'module',
                where: { courseId },
                required: true,
                attributes: []
            }],
            where: {
                isPublished: true
            }
        }) || 0;

        // Converte para horas (arredondando para cima)
        const durationHours = Math.ceil(totalMinutes / 60);

        // Atualiza o curso com a nova duração
        const [affectedRows] = await Course.update(
            { 
                duration: durationHours,
                // Atualiza também a contagem de módulos ativos
                moduleCount: sequelize.literal(`
                    (SELECT COUNT(*) FROM "Modules" 
                    WHERE "courseId" = '${courseId}' 
                    AND "isPublished" = true)
                `)
            },
            { 
                where: { courseId } 
            }
        );

        if (affectedRows === 0) {
            console.warn(`Course ${courseId} not found for duration update`);
        }

        return durationHours;
    } catch (error) {
        console.error('Error updating course duration:', error instanceof Error ? error.message : error);
        throw new Error('Failed to update course duration');
    }
};

// Função auxiliar para calcular duração de mídia
const getMediaDuration = async (file) => {
    return new Promise((resolve) => {
        const media = file.mimetype.includes('video') 
            ? document.createElement('video') 
            : document.createElement('audio');
        
        const objectUrl = URL.createObjectURL(file);
        media.src = objectUrl;
        
        media.onloadedmetadata = () => {
            resolve(media.duration);
            URL.revokeObjectURL(objectUrl);
        };
        
        media.onerror = () => {
            resolve(0);
            URL.revokeObjectURL(objectUrl);
        };
    });
}

module.exports = {

  getLessons: async(req, res) => {
    try {
        const { userId } = req.user;

        const lessons = await Lesson.findAll({
            where: { creatorId: userId, isPublished: true }
        })

        res.status(200).json(lessons);
    } catch (error) {
        console.log("ERROR: ", error instanceof Error ? error.message : error);
    }
  },

  /**
 * Verifica o status de conclusão de uma aula pelo estudante
 */
checkLessonCompletionStatus: async (req, res, next) => {
    try {
        const { lessonId } = req.params;
        const { userId } = req.user;
        
        // Verifica se a aula existe
        const lesson = await Lesson.findOne({
            where: { lessonId },
            include: {
                model: Module,
                as: 'module',
                attributes: ['courseId']
            }
        });


        if (!lesson) {
            throw new NotFoundError('Aula não encontrada');
        }

        // Verifica se o estudante está matriculado no curso
        const enrollment = await Enrollment.findOne({
            where: { 
                userId,
                courseId: lesson.module.courseId,
                status: 'active'
            }
        });

        if (!enrollment) {
            throw new ForbiddenError('Você não está matriculado neste curso');
        }

        // Verifica se a aula foi concluída
        const userLesson = await UserLesson.findOne({
            where: { userId, lessonId },
            attributes: ['completed']
        });

        res.json({
            success: true,
            data: {
                isCompleted: !!userLesson?.completed
            }
        });
    } catch (error) {
        console.log("ERRO: ", error instanceof Error ? error.message : error);
        next(error);
    }
},

/**
 * @swagger
 * /lessons/{lessonId}:
 *   get:
 *     summary: Retorna todas as informações de uma lição específica
 *     tags: [Lessons]
 *     parameters:
 *       - in: path
 *         name: lessonId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID da lição
 *     responses:
 *       200:
 *         description: Informações completas da lição
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Lesson'
 *       404:
 *         description: Lição não encontrada
 *       500:
 *         description: Erro no servidor
 */
getLessonById: async (req, res, next) => {
    try {
      const { lessonId } = req.params;
      
      if (!lessonId) {
        throw new BadRequestError('Lesson ID is required');
      }
  
      const lesson = await Lesson.findOne({
        where: { lessonId },
        include: [
          {
            model: Module,
            as: 'module',
            attributes: ['moduleId', 'title', 'order'],
            include: [{
              model: Course,
              as: 'course',
              attributes: ['courseId', 'title', 'instructorId']
            }]
          },
          {
            model: User,
            as: 'creator',
            attributes: ['userId', 'username', 'email', 'avatarUrl']
          }
        ],
        attributes: { 
          exclude: ['createdAt', 'updatedAt', 'deletedAt'] 
        }
      });
  
      if (!lesson) {
        throw new NotFoundError('Lesson not found');
      }
  
      // Verifica se o usuário tem permissão para ver a lição
      const { userId, role } = req.user;
      const isAdmin = role === ROLES.ADMIN;
      const isInstructor = role === ROLES.INSTRUCTOR;
      const isLessonCreator = lesson.creatorId === userId;
      const isCourseInstructor = lesson.module?.course?.instructorId === userId;
  
      // Se a lição não for pública, verifica as permissões
      if (!lesson.isPublished && !isAdmin && !isLessonCreator && !isCourseInstructor) {
        throw new ForbiddenError('You do not have permission to view this lesson');
      }
  
      // Formata os dados de retorno
      const responseData = {
        lessonId: lesson.lessonId,
        title: lesson.title,
        description: lesson.description,
        content: lesson.content,
        lessonType: lesson.lessonType,
        videoUrl: lesson.videoUrl,
        thumbnailUrl: lesson.thumbnailUrl,
        duration: lesson.duration,
        isFree: lesson.isFree,
        isPublished: lesson.isPublished,
        order: lesson.order,
        externalResources: lesson.externalResources,
        attachments: lesson.attachments,
        createdAt: lesson.createdAt,
        creator: lesson.creator,
        module: lesson.module ? {
          moduleId: lesson.module.moduleId,
          title: lesson.module.title,
          order: lesson.module.order,
          course: lesson.module.course
        } : null,
        permissions: {
          canEdit: isAdmin || isLessonCreator || isCourseInstructor,
          canDelete: isAdmin || isLessonCreator || isCourseInstructor,
          canPublish: isAdmin || isCourseInstructor
        }
      };
  
      res.status(200).json({
        success: true,
        data: responseData
      });
  
    } catch (error) {
      console.error('GET LESSON ERROR:', error);
      next(error);
    }
  },

    /**
     * Cria uma nova aula (com ou sem vínculo com módulo/curso)
     */
    createLesson: async (req, res, next) => {
        console.log("LESSON DATA: ", req.body);
        try {
            const { userId, role } = req.user;
            const { 
                title, 
                description = '', 
                content = '', 
                lessonType = 'video', 
                duration = 0, 
                isFree = false, 
                isPublished,
                order,
                externalResources = [],
            } = req.body;

            const { courseId, moduleId } = req.params;

            // Validação básica dos dados
            if (!title || typeof title !== 'string' || title.trim().length < 3) {
                throw new BadRequestError('O título da aula deve ter pelo menos 3 caracteres');
            }

            if (!Object.values(LESSON_TYPES).includes(lessonType)) {
                throw new BadRequestError('Tipo de aula inválido');
            }

            let course, calculatedOrder;
            
            // Se moduleId foi fornecido, valida o módulo e curso
            if (moduleId) {
                if (!courseId) {
                    throw new BadRequestError('courseId é necessário quando moduleId é fornecido');
                }

                course = await Course.findOne({
                    where: { courseId },
                    include: [{
                        model: Module,
                        as: 'modules',
                        where: { moduleId },
                        required: true,
                        attributes: ['moduleId']
                    }, {
                        model: User,
                        as: 'organizer',
                        attributes: ['userId']
                    }],
                    attributes: ['courseId', 'instructorId']
                });

                if (!course) {
                    throw new NotFoundError('Curso ou módulo não encontrado');
                }

                // Verifica permissões (instrutor, organizador ou admin)
                const isInstructor = course.instructorId === userId;
                const isOrganizer = course.organizer?.userId === userId;
                const isAdmin = role === ROLES.ADMIN;

                if (!isInstructor && !isOrganizer && !isAdmin) {
                    throw new ForbiddenError('Você não tem permissão para adicionar aulas neste curso');
                }

                // Calcula a ordem se não fornecida
                if (!order) {
                    const lastLesson = await Lesson.findOne({
                        where: { moduleId },
                        order: [['order', 'DESC']],
                        attributes: ['order']
                    });
                    calculatedOrder = lastLesson ? lastLesson.order + 1 : 1;
                } else {
                    calculatedOrder = order;
                }
            } else {
                if (role !== ROLES.ADMIN && role !== ROLES.INSTRUCTOR) {
                    throw new ForbiddenError('Você não tem permissão para criar aulas independentes');
                }
                calculatedOrder = order || 0;
            }

            // Processa upload de forma dinâmica
            let mediaUrl = null;
            let thumbnailUrl = null;
            const attachments = [];

            try {
                if (req.file) {
                    const file = req.file;
                    const uploadPath = moduleId 
                        ? `courses/${courseId}/${lessonType}s` 
                        : `lessons/independent/${lessonType}s`;

                    let resourceType = 'auto';
                    if (lessonType === 'video' || lessonType === 'audio') {
                        resourceType = 'video';
                    }

                    const result = await uploadToCloudinary(file, uploadPath, { resource_type: resourceType });
                    mediaUrl = result.secure_url;

                    // Gera thumbnails
                    if (lessonType === 'video') {
                        thumbnailUrl = await generateVideoThumbnail(result);
                    } else if (lessonType === 'pdf') {
                        thumbnailUrl = await generatePdfThumbnail(result);
                    }

                    // Calcula duração para vídeos/áudios se não fornecida
                    if ((lessonType === 'video' || lessonType === 'audio') && !duration) {
                        const mediaDuration = await getMediaDuration(file);
                        duration = Math.round(mediaDuration / 60);
                    }
                }

                // Processa anexos adicionais
                if (req.files?.attachments) {
                    const uploadPath = moduleId 
                        ? `courses/${courseId}/attachments` 
                        : `lessons/independent/attachments`;

                    for (const file of req.files.attachments) {
                        const result = await uploadToCloudinary(
                            file, 
                            uploadPath,
                            { resource_type: 'auto' }
                        );
                        attachments.push({
                            url: result.secure_url,
                            name: file.originalname,
                            type: file.mimetype,
                            size: file.size
                        });
                    }
                }
            } catch (uploadError) {
                console.error('Upload error:', uploadError);
                throw new Error('Falha ao processar arquivos enviados');
            }

            // Estrutura de dados para criação da aula
            const lessonData = {
                title: title.trim(),
                description: description.trim(),
                content,
                lessonType,
                duration: parseInt(duration) || 0,
                isFree,
                isPublished,
                order: calculatedOrder,
                moduleId: moduleId || null,
                externalResources: Array.isArray(externalResources) ? externalResources : [],
                attachments,
                creatorId: userId,
                mediaUrl,
                thumbnailUrl,
                videoUrl: (lessonType === 'video' || lessonType === 'audio') ? mediaUrl : null,
                pdfUrl: lessonType === 'pdf' ? mediaUrl : null
            };

            const lesson = await Lesson.create(lessonData);

            // Atualiza a duração total do módulo e curso
            if (moduleId && courseId) {
                await updateCourseDuration(courseId);
            }

            // Notifica alunos matriculados
            try {
                await notificationService.notifyLessonCreated(
                    lesson.lessonId,
                    userId
                );
            } catch (error) {
                console.log("Error: ", error instanceof Error ? error.message : error);
            }

            res.status(201).json({
                success: true,
                data: await Lesson.findByPk(lesson.lessonId, {
                    include: moduleId ? [{
                        model: Module,
                        as: 'module',
                        attributes: ['title']
                    }] : []
                })
            });

        } catch (error) {
            console.error('CREATE LESSON ERROR:', error instanceof Error ? error.message : error);
            next(error);
        }
    },

    /**
     * Cria múltiplas lições em uma única requisição
     */
    createLessonsBatch: async (req, res, next) => {
    try {
        const { userId, role } = req.user;
        const { lessons, courseId } = req.body;

        // Validação básica do payload
        if (!Array.isArray(lessons) || lessons.length === 0) {
        throw new BadRequestError('O payload deve conter um array de lições não vazio');
        }

        if (lessons.length > 20) {
        throw new BadRequestError('Máximo de 20 lições por requisição');
        }

        if (!courseId) {
        throw new BadRequestError('courseId é obrigatório para criação em lote');
        }

        // Verifica se o curso existe e as permissões
        const course = await Course.findOne({
        where: { courseId },
        include: [{
            model: User,
            as: 'organizer',
            attributes: ['userId']
        }],
        attributes: ['courseId', 'instructorId']
        });

        if (!course) {
        throw new NotFoundError('Curso não encontrado');
        }

        // Verifica permissões (instrutor, organizador ou admin)
        const isInstructor = course.instructorId === userId;
        const isOrganizer = course.organizer?.userId === userId;
        const isAdmin = role === ROLES.ADMIN;

        if (!isInstructor && !isOrganizer && !isAdmin) {
        throw new ForbiddenError('Você não tem permissão para adicionar aulas neste curso');
        }

        const results = {
        success: [],
        errors: [],
        moduleLessonCounts: {}
        };

        // Processa cada lição em paralelo
        await Promise.all(lessons.map(async (lessonData, index) => {
        try {
            // Validação básica dos dados da lição
            if (!lessonData.title || typeof lessonData.title !== 'string' || lessonData.title.trim().length < 3) {
            throw new BadRequestError('O título da aula deve ter pelo menos 3 caracteres');
            }

            if (!lessonData.moduleId) {
            throw new BadRequestError('moduleId é obrigatório para cada lição');
            }

            // Verifica se o módulo pertence ao curso
            const module = await Module.findOne({
            where: {
                moduleId: lessonData.moduleId,
                courseId
            },
            attributes: ['moduleId']
            });

            if (!module) {
            throw new NotFoundError(`Módulo ${lessonData.moduleId} não encontrado no curso`);
            }

            // Calcula a ordem se não fornecida
            if (!results.moduleLessonCounts[lessonData.moduleId]) {
            const lastLesson = await Lesson.findOne({
                where: { moduleId: lessonData.moduleId },
                order: [['order', 'DESC']],
                attributes: ['order']
            });
            results.moduleLessonCounts[lessonData.moduleId] = lastLesson ? lastLesson.order + 1 : 1;
            } else {
            results.moduleLessonCounts[lessonData.moduleId]++;
            }

            const order = lessonData.order || results.moduleLessonCounts[lessonData.moduleId];

            // Prepara os dados da lição
            const lessonPayload = {
            title: lessonData.title.trim(),
            description: lessonData.description || '',
            content: lessonData.content || '',
            lessonType: lessonData.lessonType || 'video',
            duration: parseInt(lessonData.duration) || 0,
            isFree: Boolean(lessonData.isFree),
            isPublished: Boolean(lessonData.isPublished),
            order,
            moduleId: lessonData.moduleId,
            externalResources: Array.isArray(lessonData.externalResources) 
                ? lessonData.externalResources.filter(r => r.trim() !== '')
                : [],
            creatorId: userId
            };

            // Processa uploads se existirem
            if (lessonData.videoUrl) {
            lessonPayload.videoUrl = lessonData.videoUrl;
            }

            // Cria a lição
            const lesson = await Lesson.create(lessonPayload);
            
            results.success.push({
                index,
                lessonId: lesson.lessonId,
                title: lesson.title,
                moduleId: lesson.moduleId,
                order: lesson.order
            });

            // Notifica alunos
            try {
            await notificationService.notifyLessonCreated(
                lesson.lessonId,
                userId
            );
            } catch (notificationError) {
            console.error(`Erro na notificação para lição ${lesson.lessonId}:`, notificationError);
            }

        } catch (error) {
            results.errors.push({
            index,
            error: error instanceof Error ? error.message : 'Erro desconhecido',
            lessonTitle: lessonData.title || 'Sem título',
            moduleId: lessonData.moduleId || 'Desconhecido'
            });
        }
        }));

        // Atualiza a duração total do curso
        try {
            await updateCourseDuration(courseId);
        } catch (durationError) {
            console.error('Erro ao atualizar duração do curso:', durationError);
        }

        res.status(201).json({
            success: true,
            createdCount: results.success.length,
            errorCount: results.errors.length,
            data: results.success,
            errors: results.errors.length > 0 ? results.errors : undefined
        });

    } catch (error) {
        console.error('CREATE LESSONS BATCH ERROR:', error);
        next(error);
    }
    },

    /**
    * Exclui uma lição
    */
    deleteLesson: async (req, res, next) => {
        try {
        const { courseId, moduleId, lessonId } = req.params;
        const { userId, role } = req.user;

        // Verifica permissões
        const course = await Course.findOne({
            where: { courseId },
            include: [{
            model: User,
            as: 'organizer',
            attributes: ['userId']
            }]
        });

        if (!course) {
            throw new NotFoundError('Curso não encontrado');
        }

        const isAuthorized = course.instructorId === userId || 
                            course.organizer?.userId === userId || 
                            role === ROLES.ADMIN;

        if (!isAuthorized) {
            throw new ForbiddenError('Você não tem permissão para excluir esta aula');
        }

        // Verifica se a lição existe
        const lesson = await Lesson.findOne({
            where: { lessonId, moduleId },
            include: [{
            model: Module,
            as: 'module',
            where: { courseId },
            attributes: ['moduleId']
            }]
        });

        if (!lesson) {
            throw new NotFoundError('Aula não encontrada');
        }

        // Notifica antes de deletar
        await notificationService.notifyLessonDeletion(
            lessonId,
            userId
        );

        await lesson.destroy();

        // Atualiza a duração do curso
        await updateCourseDuration(courseId);

        res.json({
            success: true,
            message: 'Aula excluída com sucesso'
        });

        } catch (error) {
        next(error);
        }
    },

    /**
   * Reordena uma lição específica
   */
  reorderLesson: async (req, res, next) => {
    try {
      const { courseId, moduleId, lessonId } = req.params;
      const { newPosition } = req.body;
      const { userId, role } = req.user;

      const course = await Course.findByPk(courseId);
      if (!course) {
        throw new NotFoundError('Curso não encontrado');
      }

      const isAuthorized = course.instructorId === userId || 
                         role === ROLES.ADMIN ||
                         (course.organizerId === userId && role === ROLES.INSTITUTION);

      if (!isAuthorized) {
        throw new ForbiddenError('Você não tem permissão para reordenar aulas');
      }

      const lessonToMove = await Lesson.findByPk(lessonId);
      if (!lessonToMove || lessonToMove.moduleId !== moduleId) {
        throw new NotFoundError('Aula não encontrada neste módulo');
      }

      // Busca todas as lições do módulo
      const lessons = await Lesson.findAll({
        where: { moduleId },
        order: [['order', 'ASC']]
      });

      // Remove a lição da lista
      const filteredLessons = lessons.filter(l => l.lessonId !== lessonId);

      // Insere na nova posição
      filteredLessons.splice(newPosition - 1, 0, lessonToMove);

      // Atualiza a ordem de todas as lições
      await Promise.all(filteredLessons.map(async (lesson, index) => {
        await lesson.update({ order: index + 1 });
      }));

      // Notifica reorganização
    await notificationService.notifyLessonsReordered(
      courseId,
      userId
    );

      res.json({
        success: true,
        data: await Lesson.findAll({
          where: { moduleId },
          order: [['order', 'ASC']]
        })
      });

    } catch (error) {
      next(error);
    }
  },

  /**
   * Reordenação em massa de lições
   */
  bulkReorderLessons: async (req, res, next) => {
    try {
      const { courseId, moduleId } = req.params;
      const { newOrder } = req.body;
      const { userId, role } = req.user;

      // Verifica permissões
      const course = await Course.findByPk(courseId);
      if (!course) {
        throw new NotFoundError('Curso não encontrado');
      }

      if (course.instructorId !== userId && role !== ROLES.ADMIN && 
          !(course.organizerId === userId && role === ROLES.INSTITUTION)) {
        throw new ForbiddenError('Você não tem permissão para reordenar aulas');
      }

      // Verifica se todas as lições pertencem ao módulo
      const lessonsCount = await Lesson.count({
        where: { 
          lessonId: newOrder,
          moduleId 
        }
      });

      if (lessonsCount !== newOrder.length) {
        throw new BadRequestError('Algumas aulas não pertencem a este módulo');
      }

      await sequelize.transaction(async (t) => {
        await Promise.all(newOrder.map(async (lessonId, index) => {
          await Lesson.update(
            { order: index + 1 },
            { 
              where: { lessonId },
              transaction: t 
            }
          );
        }));
      });

      // Notifica reorganização
        await notificationService.notifyLessonsReordered(
            courseId,
            userId
        );

      res.json({
        success: true,
        data: await Lesson.findAll({
          where: { moduleId },
          order: [['order', 'ASC']]
        })
      });

    } catch (error) {
      next(error);
    }
  },


    /**
    * Atualiza uma aula existente
    */
    updateLesson: async (req, res, next) => {
        console.log("LESSON DATA: ", req.body);
        try {
            const { courseId, moduleId, lessonId } = req.params;
            const { userId, role } = req.user;
            
            // Verifica permissões ampliadas (instrutor, admin ou instituição)
            const course = await Course.findOne({
                where: { courseId },
                include: [{
                    model: User,
                    as: 'organizer',
                    attributes: ['userId']
                }]
            });

            if (!course) {
                throw new NotFoundError('Curso não encontrado');
            }

            const isAuthorized = course.instructorId === userId || 
                            course.organizer?.userId === userId || 
                            role === ROLES.ADMIN;

            if (!isAuthorized) {
                throw new ForbiddenError('Você não tem permissão para editar esta aula');
            }

            // Busca a lição com validação de pertencimento
            const lesson = await Lesson.findOne({
                where: { lessonId, moduleId },
                include: [{
                    model: Module,
                    as: 'module',
                    where: { courseId },
                    required: true
                }]
            });

            if (!lesson) {
                throw new NotFoundError('Aula não encontrada neste módulo');
            }

            const updateData = {
                title: req.body.title,
                description: req.body.description,
                content: req.body.content,
                lessonType: req.body.lessonType,
                duration: parseInt(req.body.duration) || 0,
                isFree: req.body.isFree === 'true',
                isPublished: req.body.isPublished === 'true',
                externalResources: req.body.externalResources 
                    ? JSON.parse(req.body.externalResources)
                    : []
            };

            // Processamento de arquivo principal
            if (req.file) {
                const file = req.file;
                const uploadPath = `courses/${courseId}/${req.body.lessonType}s`;
                
                // Remove arquivo antigo
                if (lesson.mediaUrl) {
                    await deleteFromCloudinary(lesson.mediaUrl);
                }

                let resourceType = 'auto';
                if (req.body.lessonType === 'video' || req.body.lessonType === 'audio') {
                    resourceType = 'video';
                }

                const result = await uploadToCloudinary(file, uploadPath, { resource_type: resourceType });
                updateData.mediaUrl = result.secure_url;

                if (req.body.lessonType === 'video' || req.body.lessonType === 'audio') {
                    updateData.videoUrl = result.secure_url;
                } else if (req.body.lessonType === 'pdf') {
                    updateData.pdfUrl = result.secure_url;
                }

                // Gera thumbnail
                if (req.body.lessonType === 'video') {
                    updateData.thumbnailUrl = await generateVideoThumbnail(result);
                } else if (req.body.lessonType === 'pdf') {
                    updateData.thumbnailUrl = await generatePdfThumbnail(result);
                }

                // Calcula duração para vídeos/áudios
                if ((req.body.lessonType === 'video' || req.body.lessonType === 'audio') && !req.body.duration) {
                    const mediaDuration = await getMediaDuration(file);
                    updateData.duration = Math.round(mediaDuration / 60);
                }
            }

            // Processamento de anexos
            if (req.files?.attachments) {
                const newAttachments = [];
                
                // Mantém anexos existentes
                const keepExisting = req.body.keepExistingAttachments === 'true';
                const currentAttachments = keepExisting ? 
                    (lesson.attachments || []) : [];

                // Upload dos novos anexos
                for (const file of req.files.attachments) {
                    const result = await uploadToCloudinary(
                        file, 
                        `courses/${courseId}/attachments`,
                        { resource_type: 'auto' }
                    );
                    newAttachments.push({
                        url: result.secure_url,
                        name: file.originalname,
                        type: file.mimetype,
                        size: file.size
                    });
                }
                
                updateData.attachments = [...currentAttachments, ...newAttachments];
            }

            // Atualiza a lição
            await lesson.update(updateData);

            // Atualiza a duração total do módulo e curso
            if (moduleId && courseId) {
                await updateCourseDuration(courseId);
            }

            // Notifica alunos que já acessaram
            await notificationService.notifyLessonUpdated(
                lessonId,
                userId
            );

            // Busca a lição atualizada com relacionamentos
            const updatedLesson = await Lesson.findByPk(lessonId, {
                include: [{
                    model: Module,
                    as: 'module',
                    attributes: ['title']
                }]
            });

            res.json({
                success: true,
                data: updatedLesson
            });

        } catch (error) {
            console.error('UPDATE LESSON ERROR:', error);
            next(error);
        }
    },

    /**
     * Lista todas as aulas de um módulo
     */
    getModuleLessons: async (req, res, next) => {
        try {
            const { moduleId } = req.params;
            const { userId, role } = req.user;

            // Verifica se o módulo existe
            const module = await Module.findOne({
                where: { moduleId },
                include: {
                    model: Course,
                    as: 'course',
                    attributes: ['instructorId', 'isPublic', 'status']
                }
            });

            if (!module) {
                throw new NotFoundError('Módulo não encontrado');
            }

            // Se não for admin/instrutor do curso, mostra apenas aulas publicadas
            const isInstructorOrAdmin = role === ROLES.ADMIN || 
                                      (role === ROLES.INSTRUCTOR && module.Course.instructorId === userId);

            const where = { moduleId };
            if (!isInstructorOrAdmin) {
                where.isPublished = true;
                
                // Verifica se o curso está publicado
                if (!module.Course.isPublic || module.Course.status !== 'published') {
                    throw new ForbiddenError('Você não tem acesso a este módulo');
                }
            }

            const lessons = await Lesson.findAll({
                where,
                attributes: [
                    'lessonId', 
                    'title', 
                    'description', 
                    'lessonType', 
                    'duration', 
                    'isFree', 
                    'order',
                    'createdAt'
                ],
                order: [['order', 'ASC']]
            });

            res.json({
                success: true,
                data: lessons
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * Obtém detalhes de uma aula específica
     */
    getLessonDetails: async (req, res, next) => {
        try {
            const { moduleId, lessonId } = req.params;
            const { userId, role } = req.user;

            // Verifica se a aula existe e pertence ao módulo
            const lesson = await Lesson.findOne({
                where: { lessonId, moduleId },
                include: {
                    model: Module,
                    as: 'module',
                    include: {
                        model: Course,
                        as: 'course',
                        attributes: ['instructorId', 'isPublic', 'status']
                    }
                }
            });

            if (!lesson) {
                throw new NotFoundError('Aula não encontrada');
            }

            // Verifica se o usuário tem acesso
            const isInstructorOrAdmin = role === ROLES.ADMIN || 
                                      (role === ROLES.INSTRUCTOR && lesson.Module.Course.instructorId === userId);

            // Se não for admin/instrutor, verifica se a aula está publicada
            if (!isInstructorOrAdmin) {
                if (!lesson.isPublished || 
                    !lesson.Module.isPublished ||
                    !lesson.Module.Course.isPublic || 
                    lesson.Module.Course.status !== 'published') {
                    throw new ForbiddenError('Você não tem acesso a esta aula');
                }
            }

            // Para estudantes, verifica se estão matriculados
            if (role === ROLES.STUDENT && !lesson.isFree) {
                const enrollment = await Enrollment.findOne({
                    where: { 
                        userId,
                        courseId: lesson.Module.courseId,
                        status: 'active'
                    }
                });

                if (!enrollment) {
                    throw new ForbiddenError('Você precisa se matricular no curso para acessar esta aula');
                }
            }

            res.json({
                success: true,
                data: lesson
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * Marca uma aula como concluída pelo estudante
     */
    markLessonAsCompleted: async (req, res, next) => {
        try {
            const { lessonId } = req.params;
            const { userId } = req.user;

            // Verifica se a aula existe
            const lesson = await Lesson.findOne({
                where: { lessonId },
                include: {
                    model: Module,
                    as: 'module',
                    attributes: ['courseId']
                }
            });

            if (!lesson) {
                throw new NotFoundError('Aula não encontrada');
            }

            // Verifica se o estudante está matriculado no curso
            const enrollment = await Enrollment.findOne({
                where: { 
                    userId,
                    courseId: lesson.module.courseId,
                    status: 'active'
                }
            });

            if (!enrollment) {
                throw new ForbiddenError('Você não está matriculado neste curso');
            }

            // Marca a aula como concluída
            const [userLesson, created] = await UserLesson.findOrCreate({
                where: { userId, lessonId },
                defaults: { completed: true }
            });

            if (!created) {
                await userLesson.update({ completed: true });
            }

            // Notificar conclusão
            try {
                await notificationService.notifyLessonCompletion(
                    userId,
                    lessonId
                );
            } catch (err) {
                console.log("NOTIFYING: ", err instanceof Error ? err.message : err);
            }

            res.json({
                success: true,
                message: 'Aula marcada como concluída'
            });
        } catch (error) {
            console.log("COMPLETING: ", error instanceof Error ? error.message : error);
            next(error);
        }
    },

    /**
     * Método auxiliar para reordenar aulas após exclusão
     */
    _reorderLessons: async (moduleId) => {
        const lessons = await Lesson.findAll({
            where: { moduleId },
            order: [['order', 'ASC']]
        });

        for (let i = 0; i < lessons.length; i++) {
            if (lessons[i].order !== i + 1) {
                await lessons[i].update({ order: i + 1 });
            }
        }
    }
};