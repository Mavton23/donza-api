const { Assignment, Submission, Course, Enrollment, User, Module, Lesson } = require('../models');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../utils/errors');
const notificationService = require('../services/notification.service');
const { ROLES } = require('../constants/constants');
const { sequelize } = require('../configs/db');
const logger = require('../utils/logger');

module.exports = {
   
/**
 * @swagger
 * /assignment/courses/assignments:
 *   get:
 *     summary: Lista tarefas agrupadas por curso para o instrutor
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Número da página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Itens por página
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Busca pelo título da tarefa
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [all, published, draft, closed]
 *         description: Filtra por status da tarefa
 *     responses:
 *       200:
 *         description: Lista paginada de cursos com suas tarefas
 */

getCourseAssignmentsForInstructor: async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 10, search = '', status = 'all' } = req.query;
    const offset = (page - 1) * limit;
    const isAdmin = req.user.role === ROLES.ADMIN;

    // Construir condições de busca
    const whereConditions = {
      ...(search && { 
        title: { 
          [Op.iLike]: `%${search}%` 
        } 
      }),
      ...(status !== 'all' && { 
        isPublished: status === 'published' ? true : false,
        ...(status === 'closed' && {
          dueDate: { [Op.lt]: new Date() }
        })
      })
    };

    // Buscar os cursos
    const courses = await Course.findAll({
      where: isAdmin ? {} : { instructorId: userId },
      attributes: ['courseId', 'title', 'coverImageUrl'],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['title', 'ASC']]
    });

    // Buscar assignments para cada curso separadamente
    const coursesWithAssignments = await Promise.all(
      courses.map(async course => {
        const assignments = await Assignment.findAll({
          where: {
            ...whereConditions,
            courseId: course.courseId
          },
          attributes: [
            'assignmentId',
            'title',
            'description',
            'dueDate',
            'maxScore',
            'isPublished',
            'createdAt',
            [sequelize.literal(`CASE 
              WHEN "Assignment"."dueDate" < NOW() THEN 'closed'
              WHEN "Assignment"."isPublished" = true THEN 'published'
              ELSE 'draft'
            END`), 'status']
          ],
          include: [{
            model: Submission,
            as: 'submissions',
            attributes: [],
            required: false
          }],
          group: ['Assignment.assignmentId'],
          raw: true,
          nest: true,
          subQuery: false
        });

        // Para cada assignment, buscar contagem de submissões
        const assignmentsWithCounts = await Promise.all(
          assignments.map(async assignment => {
            const counts = await Submission.findOne({
              where: { assignmentId: assignment.assignmentId },
              attributes: [
                [sequelize.fn('COUNT', sequelize.col('submissionId')), 'submissionsCount'],
                [sequelize.literal(`SUM(CASE WHEN grade IS NULL AND status = 'submitted' THEN 1 ELSE 0 END)`), 'ungradedCount']
              ],
              raw: true
            });

            return {
              ...assignment,
              submissionsCount: counts?.submissionsCount || 0,
              ungradedCount: counts?.ungradedCount || 0
            };
          })
        );

        return {
          ...course.toJSON(),
          assignments: assignmentsWithCounts
        };
      })
    );

    // Contar total de cursos para paginação
    const totalCourses = await Course.count({
      where: isAdmin ? {} : { instructorId: userId }
    });

    res.json({
      success: true,
      data: coursesWithAssignments,
      meta: {
        total: totalCourses,
        totalPages: Math.ceil(totalCourses / limit),
        currentPage: parseInt(page),
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.log("ERROR: ", error instanceof Error ? error.message : error);
    next(error);
  }
},
  // Cria uma nova tarefa
  createAssignment: async (req, res, next) => {
    try {
      const { courseId } = req.params;
      const userId = req.user.userId;
      const { title, description, dueDate, maxScore, moduleId, lessonId, isPublished } = req.body;
      const attachment = req.file;

      // Verifica se o curso existe e se o usuário é o instrutor
      const course = await Course.findByPk(courseId);
      if (!course) {
        throw new NotFoundError('Course not found');
      }

      if (course.instructorId !== userId && req.user.role !== ROLES.ADMIN) {
        throw new ForbiddenError('Only course instructor can create assignments');
      }

      // Validações adicionais
      if (moduleId) {
        const module = await Module.findOne({ where: { moduleId, courseId } });
        if (!module) {
          throw new BadRequestError('Module does not belong to this course');
        }
      }

      if (lessonId) {
        const lesson = await Lesson.findOne({ 
          where: { lessonId },
          include: [{
            model: Module,
            where: { courseId }
          }]
        });
        if (!lesson) {
          throw new BadRequestError('Lesson does not belong to this course');
        }
      }

      const assignment = await Assignment.create({
        title,
        description,
        dueDate,
        maxScore: maxScore || 100,
        courseId,
        moduleId: moduleId || null,
        lessonId: lessonId || null,
        isPublished: isPublished || false,
        creatorId: userId,
        attachmentUrl: attachment ? attachment.path : null
      });

     if (assignment.isPublished) {
        try {
          await notificationService.notifyAssignmentCreated(assignment.assignmentId);
        } catch (error) {
          logger.error(
            'Erro ao notificar criação de atividade:',
            error instanceof Error ? error.message : error
          );
        }
      }

      res.status(201).json({
        success: true,
        data: assignment
      });

    } catch (error) {
      next(error);
    }
  },

  // Atualiza uma tarefa existente
  updateAssignment: async (req, res, next) => {
    try {
      const { assignmentId } = req.params;
      const { userId } = req.user;
      const updates = req.body;
      const attachment = req.file;

      const assignment = await Assignment.findByPk(assignmentId, {
        include: [{
          model: Course,
          attributes: ['courseId', 'instructorId']
        }]
      });

      if (!assignment) {
        throw new NotFoundError('Assignment not found');
      }

      // Verifica se o usuário é o instrutor do curso ou admin
      if (assignment.course.instructorId !== userId && req.user.role !== ROLES.ADMIN) {
        throw new ForbiddenError('Only course instructor can update assignments');
      }

      // Atualiza os campos permitidos
      const allowedUpdates = ['title', 'description', 'dueDate', 'maxScore', 'isPublished'];
      allowedUpdates.forEach(update => {
        if (updates[update] !== undefined) {
          assignment[update] = updates[update];
        }
      });

      if (attachment) {
        assignment.attachmentUrl = attachment.path;
      }

      await assignment.save();

      const changes = allowedUpdates
        .filter(key => updates[key] !== undefined && updates[key] !== assignment._previousDataValues[key])
        .join(', ');

      if (assignment.isPublished) {
        const enrollments = await Enrollment.findAll({
          where: { courseId: assignment.courseId },
          attributes: ['userId']
        });

        await Promise.all(enrollments.map(enrollment =>
          notificationService.createNotification(
            enrollment.userId,
            'COURSE_ASSIGNMENT_UPDATED',
            {
              relatedEntityId: assignmentId,
              metadata: {
                courseId: assignment.courseId,
                assignmentId: assignment.assignmentId,
                assignmentTitle: assignment.title,
                changes,
                updatedAt: new Date().toISOString()
              }
            }
          )
        ));
      }

      res.json({
        success: true,
        data: assignment
      });

    } catch (error) {
      next(error);
    }
  },

  // Exclui uma tarefa
  deleteAssignment: async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
      const { assignmentId } = req.params;
      const { userId } = req.user;

      const assignment = await Assignment.findByPk(assignmentId, {
        include: [{
          model: Course,
          attributes: ['courseId', 'instructorId']
        }],
        transaction
      });

      if (!assignment) {
        await transaction.rollback();
        throw new NotFoundError('Assignment not found');
      }

      // Verifica permissões
      if (assignment.course.instructorId !== userId && req.user.role !== ROLES.ADMIN) {
        await transaction.rollback();
        throw new ForbiddenError('Only course instructor can delete assignments');
      }

      const submissions = await Submission.findAll({
        where: { assignmentId },
        attributes: ['userId'],
        group: ['userId'],
        transaction
      });

      try {
        await Promise.all(submissions.map(submission =>
          notificationService.createNotification(
            submission.userId,
            'COURSE_ASSIGNMENT_DELETED',
            {
              relatedEntityId: assignment.courseId,
              metadata: {
                courseId: assignment.courseId,
                assignmentTitle: assignment.title,
                deletedAt: new Date().toISOString()
              }
            }
          )
        ));
      } catch (error) {
        logger.error(
          'Erro ao notificar usuários sobre exclusão de atividade:',
          error instanceof Error ? error.message : error
        );
      }

      // Primeiro deleta todas as submissões
      await Submission.destroy({
        where: { assignmentId },
        transaction
      });

      // Depois deleta a tarefa
      await assignment.destroy({ transaction });

      await transaction.commit();

      res.json({
        success: true,
        message: 'Assignment and all its submissions were deleted successfully'
      });

    } catch (error) {
      await transaction.rollback();
      next(error);
    }
  },

  // Lista tarefas de um curso (para instrutor)
  getCourseAssignments: async (req, res, next) => {
    try {
      const { courseId } = req.params;
      const userId = req.user.userId;

      const course = await Course.findByPk(courseId);
      if (!course) {
        throw new NotFoundError('Course not found');
      }

      // Verifica se é o instrutor do curso
      if (course.instructorId !== userId && req.user.role !== ROLES.ADMIN) {
        throw new ForbiddenError('Only course instructor can view these assignments');
      }

      const assignments = await Assignment.findAll({
        where: { courseId },
        include: [
          {
            model: Module,
            as: 'module',
            attributes: ['moduleId', 'title']
          },
          {
            model: Lesson,
            as: 'lesson',
            attributes: ['lessonId', 'title']
          },
          {
            model: Submission,
            as: 'submissions',
            attributes: ['submissionId', 'userId', 'submittedAt', 'grade']
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      res.json({
        success: true,
        data: assignments
      });

    } catch (error) {
      next(error);
    }
  },

  // Lista tarefas de um curso (para estudante)
  getStudentAssignments: async (req, res, next) => {
    try {
      const { courseId } = req.params;
      const userId = req.user.userId;

      // Verifica se o estudante está matriculado no curso
      const enrollment = await Enrollment.findOne({
        where: { courseId, userId }
      });

      if (!enrollment) {
        throw new ForbiddenError('You are not enrolled in this course');
      }

      const assignments = await Assignment.findAll({
        where: { 
          courseId,
          isPublished: true 
        },
        include: [
          {
            model: Module,
            as: 'module',
            attributes: ['moduleId', 'title']
          },
          {
            model: Lesson,
            as: 'lesson',
            attributes: ['lessonId', 'title']
          },
          {
            model: Submission,
            as: 'submissions',
            where: { userId },
            required: false,
            attributes: ['submissionId', 'submittedAt', 'grade', 'status']
          }
        ],
        order: [['dueDate', 'ASC']]
      });

      // Formata a resposta para incluir status de submissão
      const formattedAssignments = assignments.map(assignment => {
        const submission = assignment.submissions && assignment.submissions[0];
        return {
          ...assignment.toJSON(),
          submissionStatus: submission ? submission.status : 'not_submitted',
          grade: submission ? submission.grade : null
        };
      });

      res.json({
        success: true,
        data: formattedAssignments
      });

    } catch (error) {
      next(error);
    }
  },

  // Submete uma tarefa (estudante)
  submitAssignment: async (req, res, next) => {
    const transaction = await sequelize.transaction();

    try {
      const { assignmentId } = req.params;
      const userId = req.user.userId;
      const { content } = req.body;
      const attachment = req.file;

      // Verifica se a tarefa existe e está publicada
      const assignment = await Assignment.findOne({
        where: { assignmentId, isPublished: true },
        include: [{
          model: Course,
          attributes: ['courseId']
        }],
        transaction
      });

      if (!assignment) {
        throw new NotFoundError('Assignment not found or not published');
      }

      // Verifica se o estudante está matriculado no curso
      const enrollment = await Enrollment.findOne({
        where: { 
          courseId: assignment.course.courseId, 
          userId 
        },
        transaction
      });

      if (!enrollment) {
        throw new ForbiddenError('You are not enrolled in this course');
      }

      // Verifica se já existe uma submissão
      const existingSubmission = await Submission.findOne({
        where: { assignmentId, userId }, 
        transaction
      });

      // Verifica se a data de entrega já passou
      const now = new Date();
      if (assignment.dueDate && now > new Date(assignment.dueDate)) {
        throw new BadRequestError('The due date for this assignment has passed');
      }

      // Cria ou atualiza a submissão
      let submission;
      if (existingSubmission) {
        submission = await existingSubmission.update({
          content: content || existingSubmission.content,
          attachmentUrl: attachment ? attachment.path : existingSubmission.attachmentUrl,
          submittedAt: now,
          status: 'submitted'
        }, { transaction });

      } else {
        submission = await Submission.create({
          assignmentId,
          userId,
          content,
          attachmentUrl: attachment ? attachment.path : null,
          submittedAt: now,
          status: 'submitted'
        }, { transaction });

      }

      await transaction.commit();

      try {
          await notificationService.notifyAssignmentSubmitted(submission.submissionId);
        } catch (error) {
          logger.error(
            'Erro ao notificar envio de atividade:',
            error instanceof Error ? error.message : error
          );
        }

      res.status(201).json({
        success: true,
        data: submission
      });

    } catch (error) {
      await transaction.rollback();
      console.log("ERROR: ", error instanceof Error ? error.message : error);
      next(error);
    }
  },

  // Lista submissões de uma tarefa (instrutor)
  getAssignmentSubmissions: async (req, res, next) => {
    try {
      const { assignmentId } = req.params;
      const userId = req.user.userId;

      const assignment = await Assignment.findByPk(assignmentId, {
        include: [{
          model: Course,
          attributes: ['courseId', 'instructorId']
        }]
      });

      if (!assignment) {
        throw new NotFoundError('Assignment not found');
      }

      // Verifica se é o instrutor do curso
      if (assignment.course.instructorId !== userId && req.user.role !== ROLES.ADMIN) {
        throw new ForbiddenError('Only course instructor can view these submissions');
      }

      const submissions = await Submission.findAll({
        where: { assignmentId },
        include: [{
          model: User,
          as: 'student',
          attributes: ['userId', 'username', 'email', 'avatarUrl']
        }],
        order: [['submittedAt', 'DESC']]
      });

      res.json({
        success: true,
        data: submissions
      });

    } catch (error) {
      next(error);
    }
  },

  // Avalia uma submissão (instrutor)
  gradeSubmission: async (req, res, next) => {
    try {
      const { submissionId } = req.params;
      const { userId } = req.user;
      const { grade, feedback } = req.body;

      // Validação básica da nota
      if (grade === undefined || typeof grade !== 'number' || grade < 0) {
        throw new BadRequestError('A nota deve ser um número não negativo');
      }

      const submission = await Submission.findByPk(submissionId, {
        include: [{
          model: Assignment,
          include: [{
            model: Course,
            attributes: ['courseId', 'instructorId']
          }]
        }]
      });

      if (!submission) {
        throw new NotFoundError('Submissão não encontrada');
      }

      // Verifica se é o instrutor do curso
      if (submission.assignment.course.instructorId !== userId && req.user.role !== ROLES.ADMIN) {
        throw new ForbiddenError('Apenas o instrutor do curso pode avaliar as submissões');
      }

      // Valida a nota
      if (grade > submission.assignment.maxScore) {
        throw new BadRequestError(`A nota não pode ultrapassar o máximo de ${submission.assignment.maxScore}`);
      }

      // Atualiza a submissão
      await submission.update({
        grade,
        feedback,
        status: 'graded'
      });

      try {
        await notificationService.createNotification(
          submission.userId,
          'COURSE_ASSIGNMENT_GRADED',
          {
            relatedEntityId: submissionId,
            metadata: {
              assignmentId: submission.assignmentId,
              assignmentTitle: submission.assignment.title,
              score: grade,
              maxScore: submission.assignment.maxScore,
              feedback: feedback || '',
              gradedAt: new Date().toISOString()
            }
          }
        );
      } catch (error) {
        logger.error(
          'Erro ao notificar correção de atividade:',
          error instanceof Error ? error.message : error
        );
      }


      res.json({
        success: true,
        data: submission
      });

    } catch (error) {
      console.log("ERROR: ", error instanceof Error ? error.message : error);
      next(error);
    }
  },

  // Obtém detalhes de uma submissão
  getSubmissionDetails: async (req, res, next) => {
    try {
      const { submissionId } = req.params;
      const userId = req.user.userId;

      const submission = await Submission.findByPk(submissionId, {
        include: [
          {
            model: Assignment,
            include: [{
              model: Course,
              attributes: ['courseId', 'instructorId']
            }]
          },
          {
            model: User,
            as: 'student',
            attributes: ['userId', 'username']
          }
        ]
      });

      if (!submission) {
        throw new NotFoundError('Submission not found');
      }

      // Verifica se o usuário tem permissão para ver esta submissão
      const isInstructor = submission.assignment.course.instructorId === userId;
      const isAdmin = req.user.role === ROLES.ADMIN;
      const isStudent = submission.userId === userId;

      if (!isInstructor && !isAdmin && !isStudent) {
        throw new ForbiddenError('You do not have permission to view this submission');
      }

      res.json({
        success: true,
        data: submission
      });

    } catch (error) {
      next(error);
    }
  }
};