const { User, Module, Course, Lesson } = require('../models');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../utils/errors');
const notificationService = require('../services/notification.service');
const { ROLES } = require('../constants/constants');

module.exports = {
    /**
     * @swagger
     * /modules/list:
     *   get:
     *     summary: Lista todos os módulos do instrutor (vinculados ou não a cursos)
     *     tags: [Modules]
     *     security:
     *       - bearerAuth: []
     *     responses:
     *       200:
     *         description: Lista de módulos
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                 data:
     *                   type: array
     *                   items:
     *                     $ref: '#/components/schemas/Module'
     */
    listModules: async (req, res, next) => {
    try {
        const { userId } = req.user;

        const modules = await Module.findAll({
            where: { creatorId: userId, isPublished: true },
            include: [
                {
                model: Course,
                as: 'course',
                attributes: ['courseId', 'title']
                },
                {
                model: User,
                as: 'creator',
                attributes: ['userId', 'username']
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        res.status(200).json({
        success: true,
        data: modules
        });
    } catch (error) {
        console.error('LIST INSTRUCTOR MODULES ERROR:', error);
        next(error);
    }
    },

    /**
 * @swagger
 * /modules:
 *   post:
 *     summary: Cria um novo módulo (opcionalmente vinculado a um curso)
 *     tags: [Modules]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Module'
 *     responses:
 *       201:
 *         description: Módulo criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Module'
 */
    createModule: async (req, res, next) => {
        try {
            const { courseId } = req.params;
            const { userId, role } = req.user;
            const { title, description = '', isPublished = false, order } = req.body;
    
            // Validação básica do título
            if (!title || typeof title !== 'string' || title.trim().length < 3) {
                throw new BadRequestError('O título do módulo deve ter pelo menos 3 caracteres');
            }
    
            let course = null;
            let isIndependent = false;
    
            if (courseId) {
                course = await Course.findByPk(courseId, {
                    include: [{
                        model: User,
                        as: 'organizer',
                        attributes: ['userId']
                    }]
                });
    
                if (!course) {
                    throw new NotFoundError('Curso não encontrado');
                }
    
                // Verifica se o usuário é o instrutor, organizador ou admin
                const isInstructor = course.instructorId === userId;
                const isOrganizer = course.organizer?.userId === userId;
                const isAdmin = role === ROLES.ADMIN;
    
                if (!isInstructor && !isOrganizer && !isAdmin) {
                    throw new ForbiddenError('Você não tem permissão para adicionar módulos a este curso');
                }
            } else {
                // Para módulos independentes, apenas admin e instrutores podem criar
                if (role !== ROLES.ADMIN && role !== ROLES.INSTRUCTOR) {
                    throw new ForbiddenError('Você não tem permissão para criar módulos independentes');
                }
                isIndependent = true;
            }
    
            // Calcula a ordem automaticamente se não for fornecida
            let calculatedOrder = order;
            if (!order) {
                const whereClause = courseId ? { courseId } : { courseId: null };
                const lastModule = await Module.findOne({
                    where: whereClause,
                    order: [['order', 'DESC']],
                    attributes: ['order']
                });
                calculatedOrder = lastModule ? lastModule.order + 1 : 1;
            }
    
            // Cria o módulo
            const module = await Module.create({
                title: title.trim(),
                description: description.trim(),
                order: calculatedOrder,
                isPublished,
                courseId: courseId || null,
                creatorId: userId
            });
    
            // Retorna o módulo criado com informações completas
            const createdModule = await Module.findByPk(module.moduleId, {
                include: [
                    {
                        model: Lesson,
                        as: 'lessons',
                        attributes: ['lessonId', 'title', 'order'],
                        order: [['order', 'ASC']]
                    },
                    {
                        model: Course,
                        as: 'course',
                        attributes: ['courseId', 'title'],
                        required: false
                    },
                    {
                        model: User,
                        as: 'creator',
                        attributes: ['userId', 'username']
                    }
                ]
            });

            // Notifica alunos matriculados
            try {
                await notificationService.notifyModuleCreated(
                    module.moduleId,
                    userId
                );
                } catch (error) {
                console.error(
                    'Erro ao notificar criação de módulo:',
                    error instanceof Error ? error.message : error
                );
            }
    
            res.status(201).json({
                success: true,
                data: createdModule,
                isIndependent
            });
        } catch (error) {
            console.error("ERROR ON CREATEMODULE: ", error instanceof Error ? error.message : error);
            next(error);
        }
    },

    /**
     * Atualiza um módulo existente
     */
    updateModule: async (req, res, next) => {
        try {
            const { courseId, moduleId } = req.params;
            const { userId, role } = req.user;
            const updateData = req.body;

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
                throw new ForbiddenError('Você não tem permissão para editar este módulo');
            }

            // Busca o módulo
            const module = await Module.findOne({
                where: { moduleId, courseId }
            });

            if (!module) {
                throw new NotFoundError('Módulo não encontrado');
            }

            // Se estiver publicando, adiciona a data de publicação
            if (updateData.isPublished && !module.isPublished) {
                updateData.publishedAt = new Date();
            }
            // Se estiver despublicando, remove a data de publicação
            else if (!updateData.isPublished && module.isPublished) {
                updateData.publishedAt = null;
            }

            await module.update(updateData);

            // Notifica alunos que já acessaram
            try {
                await notificationService.notifyModuleUpdated(
                    moduleId,
                    userId
                );
                } catch (error) {
                console.error(
                    'Erro ao notificar atualização de módulo:',
                    error instanceof Error ? error.message : error
                );
            }

            res.json({
                success: true,
                data: module
            });

        } catch (error) {
            next(error);
        }
    },

    /**
     * Remove um módulo
     */
    deleteModule: async (req, res, next) => {
        try {
            const { courseId, moduleId } = req.params;
            const { userId, role } = req.user;

            // Verifica se o módulo existe e pertence ao curso
            const module = await Module.findOne({
                where: { moduleId, courseId },
                include: {
                    model: Course,
                    as: 'course',
                    attributes: ['instructorId']
                }
            });

            if (!module) {
                throw new NotFoundError('Módulo não encontrado');
            }

            // Verifica permissões
            if (module.Course.instructorId !== userId && role !== ROLES.ADMIN) {
                throw new ForbiddenError('Você não tem permissão para remover este módulo');
            }

            // Notifica antes de deletar
            await notificationService.notifyModuleDeletion(
                moduleId,
                userId
            );

            await module.destroy();

            // Reordena os módulos restantes
            await this._reorderModules(courseId);

            res.json({
                success: true,
                message: 'Módulo removido com sucesso'
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * Lista todos os módulos de um curso
     */
    getCourseModules: async (req, res, next) => {
        try {
            const { courseId } = req.params;
            const { userId, role } = req.user;

            // Verifica se o curso existe
            const course = await Course.findByPk(courseId);
            if (!course) {
                throw new NotFoundError('Curso não encontrado');
            }

            // Se não for admin/instrutor do curso, mostra apenas módulos publicados
            const isInstructorOrAdmin = role === ROLES.ADMIN || 
                                      (role === ROLES.INSTRUCTOR && course.instructorId === userId);

            const where = { courseId };
            if (!isInstructorOrAdmin) {
                where.isPublished = true;
            }

            const modules = await Module.findAll({
                where,
                include: [
                    {
                        model: Lesson,
                        as: 'lessons',
                        attributes: ['lessonId', 'title', 'duration', 'lessonType', 'isPublished', 'order'],
                        where: !isInstructorOrAdmin ? { isPublished: true } : {},
                        required: false,
                        order: [['order', 'ASC']]
                    }
                ],
                order: [['order', 'ASC']]
            });

            res.json({
                success: true,
                data: modules
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * Obtém detalhes de um módulo específico
     */
    getModuleDetails: async (req, res, next) => {
        try {
            const { courseId, moduleId } = req.params;
            const { userId, role } = req.user;

            // Verifica se o módulo existe e pertence ao curso
            const module = await Module.findOne({
                where: { moduleId, courseId },
                include: [
                    {
                        model: Course,
                        as: 'course',
                        attributes: ['instructorId', 'isPublic', 'status']
                    },
                    {
                        model: Lesson,
                        as: 'lessons',
                        attributes: ['lessonId', 'title', 'duration', 'lessonType', 'isPublished', 'order'],
                        order: [['order', 'ASC']]
                    }
                ]
            });

            if (!module) {
                throw new NotFoundError('Módulo não encontrado');
            }

            // Verifica se o usuário tem acesso
            const isInstructorOrAdmin = role === ROLES.ADMIN || 
                                      (role === ROLES.INSTRUCTOR && module.Course.instructorId === userId);

            // Se não for admin/instrutor, verifica se o módulo e curso estão publicados
            if (!isInstructorOrAdmin) {
                if (!module.isPublished || 
                    !module.Course.isPublic || 
                    module.Course.status !== 'published') {
                    throw new ForbiddenError('Você não tem acesso a este módulo');
                }
            }

            res.json({
                success: true,
                data: module
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * Método auxiliar para reordenar módulos após exclusão
     */
    _reorderModules: async (courseId) => {
        const modules = await Module.findAll({
            where: { courseId },
            order: [['order', 'ASC']]
        });

        for (let i = 0; i < modules.length; i++) {
            if (modules[i].order !== i + 1) {
                await modules[i].update({ order: i + 1 });
            }
        }
    }
};