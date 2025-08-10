const { GroupTask, TaskAssignment, StudyGroupMember, User } = require('../models');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const { Op } = require('sequelize');
const notificationService = require('../services/notification.service');
const { sequelize } = require('../configs/db');
const { logger } = require('handlebars');

module.exports = {
    listTasks: async (req, res, next) => {
        try {
            const { userId } = req.user;
            const { groupId } = req.params;
            const { status, assignedTo } = req.query;

            // Verifica se o usuário é membro do grupo
            const isMember = await StudyGroupMember.findOne({
                where: { groupId, userId, status: 'active' }
            });
            
            if (!isMember) {
                throw new ForbiddenError('Você não é membro deste grupo');
            }

            // Filtros da query
            const where = { groupId };
            const include = [{
                model: TaskAssignment,
                as: 'assignments',
                include: [{
                    model: User,
                    as: 'user',
                    attributes: ['userId', 'username', 'avatarUrl']
                }]
            }];

            if (status) {
                where.status = status;
            }

            if (assignedTo === 'me') {
                include[0].where = { userId };
            } else if (assignedTo === 'others') {
                include[0].where = { 
                    userId: { [Op.ne]: userId } 
                };
            }

            const tasks = await GroupTask.findAll({
                where,
                include,
                order: [
                    ['priority', 'DESC'],
                    ['deadline', 'ASC'],
                    ['createdAt', 'DESC']
                ]
            });

            // Formata os dados para incluir assignees no nível superior
            const formattedTasks = tasks.map(task => {
                const taskData = task.get({ plain: true });
                return {
                    ...taskData,
                    assignees: taskData.assignments.map(a => a.user)
                };
            });

            res.json({
                success: true,
                data: formattedTasks
            });

        } catch (error) {
            console.log("ERROR: ", error instanceof Error ? error.message : error);
            next(error);
        }
    },

    createTask: async (req, res, next) => {
        try {
            const { userId } = req.user;
            const { groupId } = req.params;
            const { title, description, deadline, priority, assignee } = req.body;

            if (!title) {
                throw new Error('Título da tarefa é obrigatório');
            }

            // Verifica se já existe uma tarefa com o mesmo título NO MESMO GRUPO
            const existingTask = await GroupTask.findOne({
                where: {
                    title,
                    groupId
                }
            });

            if (existingTask) {
                return res.status(409).json({
                    success: false,
                    message: 'Já existe uma tarefa com este título no grupo!'
                });
            }

            // Verifica se o usuário pode criar tarefas no grupo
            const member = await StudyGroupMember.findOne({
                where: { 
                    groupId, 
                    userId,
                    status: 'active',
                    role: { [Op.in]: ['leader', 'co-leader', 'moderator'] }
                }
            });

            if (!member) {
                throw new ForbiddenError('Você não tem permissão para criar tarefas neste grupo');
            }

            // Extrai o assigneeId do objeto assignee
            const assigneeId = assignee?.userId || null;

            // Verifica se o assignee é membro do grupo
            let assigneeMember = null;
            
            if (assigneeId) {
                assigneeMember = await StudyGroupMember.findOne({
                    where: { 
                        groupId, 
                        userId: assigneeId,
                        status: 'active'
                    }
                });

            if (!assigneeMember) {
                throw new ForbiddenError('O usuário atribuído não é membro ativo deste grupo');
            }
            }

            // Cria a tarefa e a atribuição em uma transação
            const result = await sequelize.transaction(async (t) => {
            // Cria a tarefa principal
            const task = await GroupTask.create({
                title,
                description,
                deadline,
                priority: priority || 'medium',
                groupId,
                creatorId: userId,
                status: assigneeId ? 'in_progress' : 'pending',
                assignerId: assigneeId ? userId : null
            }, { transaction: t });

            // Se houver assignee, cria a atribuição
            let assignment = null;
            if (assigneeId) {
                assignment = await TaskAssignment.create({
                taskId: task.taskId,
                userId: assigneeId,
                assignedBy: userId,
                status: 'pending'
                }, { transaction: t });
            }

            return { task, assignment };
            });

            try {
                await notificationService.notifyTaskCreated(result.task.taskId);
            } catch (error) {
                logger.error(
                    'Erro ao notificar criação de tarefa:',
                    error instanceof Error ? error.message : error
                );
            }

                if (assigneeId) {
                try {
                    await notificationService.notifyTaskAssigned(
                    result.task.taskId,
                    assigneeId,
                    userId
                    );
                } catch (error) {
                    console.error(
                    'Erro ao notificar atribuição de tarefa:',
                    error instanceof Error ? error.message : error
                    );
                }
                }


            // Busca os dados completos para retornar
            const taskWithAssignees = await GroupTask.findByPk(result.task.taskId, {
                include: [{
                    model: TaskAssignment,
                    as: 'assignments',
                    include: [{
                        model: User,
                        as: 'user',
                        attributes: ['userId', 'username', 'avatarUrl']
                    }]
                }]
            });

            res.status(201).json({
            success: true,
            data: {
                ...taskWithAssignees.get({ plain: true }),
                assignees: taskWithAssignees.assignments.map(a => a.user)
            }
            });

        } catch (error) {
            logger.log("ERROR CREATING TASK: ", error instanceof Error ? error.message : error);
            next(error);
        }
    },

   updateTask: async (req, res, next) => {
        try {
            const { taskId } = req.params;
            const { userId, username } = req.user;
            const { title, description, deadline, priority, status } = req.body;

            // Verifica existência da tarefa e groupId
            const task = await GroupTask.findByPk(taskId, {
                attributes: ['taskId', 'groupId'],
                raw: true
            });

            if (!task) {
                throw new NotFoundError('Tarefa não encontrada');
            }

            // Verifica permissão do usuário (leader ou co-leader ativo)
            const isLeader = await StudyGroupMember.findOne({
                where: {
                    groupId: task.groupId,
                    userId,
                    status: 'active',
                    role: { [Op.in]: ['leader', 'co-leader'] }
                }
            });

            if (!isLeader) {
                throw new ForbiddenError('Você não tem permissão para editar esta tarefa');
            }

            // Prepara campos para atualizar
            const updatableFields = {};

            if (title) updatableFields.title = title;
            if (description) updatableFields.description = description;
            if (deadline) updatableFields.deadline = deadline;
            if (priority) updatableFields.priority = priority;
            if (status) updatableFields.status = status;

            if (Object.keys(updatableFields).length === 0) {
                return res.status(400).json({ success: false, message: 'Nenhum campo válido para atualizar foi fornecido' });
            }

            // Atualiza tarefa e retorna o registro atualizado
            const [updatedRows, [updatedTask]] = await GroupTask.update(updatableFields, {
                where: { taskId },
                returning: true
            });

            if (updatedRows === 0) {
                throw new Error('Nenhuma alteração foi realizada na tarefa');
            }

            const changes = Object.keys(updatableFields).join(', ');

            // Busca membros ativos do grupo para notificação
            let members = [];
            
            try {
                members = await StudyGroupMember.findAll({
                    where: {
                        groupId: task.groupId,
                        status: 'active'
                    },
                    attributes: ['userId'],
                    raw: true
                });
                } catch (error) {
                    logger.error('Erro ao buscar membros do grupo para notificação:', error instanceof Error ? error.message : error);
                }

            // Notifica atualização da tarefa para todos membros do grupo
            try {
                await Promise.all(members.map(member =>
                    notificationService.createNotification(
                    member.userId,
                    'STUDY_GROUP_TASK_UPDATED',
                    {
                        relatedEntityId: taskId,
                        metadata: {
                        groupId: task.groupId,
                        taskId: updatedTask.taskId,
                        taskTitle: updatedTask.title,
                        updaterId: userId,
                        updaterUsername: username,
                        changes,
                        updatedAt: new Date().toISOString()
                        }
                    }
                    )
                ));
            } catch (error) {
                logger.error('Erro ao notificar atualização de tarefa para membros:', error instanceof Error ? error.message : error);
            }

            // Se houve mudança de status, notifica especificamente os assignees
            if (status) {
                let assignments = [];
            
                try {
                    assignments = await TaskAssignment.findAll({
                    where: { taskId },
                        attributes: ['userId'],
                        raw: true
                    });
                } catch (error) {
                    logger.error('Erro ao buscar atribuições para notificação de mudança de status:', error instanceof Error ? error.message : error);
                }

            try {
                await Promise.all(assignments.map(assignment =>
                notificationService.createNotification(
                    assignment.userId,
                    'STUDY_GROUP_TASK_STATUS_CHANGED',
                    {
                    relatedEntityId: taskId,
                    metadata: {
                        groupId: task.groupId,
                        taskId: updatedTask.taskId,
                        taskTitle: updatedTask.title,
                        newStatus: status,
                        changedBy: username,
                        changedAt: new Date().toISOString()
                    }
                    }
                )
                ));
            } catch (error) {
                logger.error('Erro ao notificar mudança de status da tarefa:', error instanceof Error ? error.message : error);
              }
            }

            // Busca tarefa atualizada com assigness para resposta
            const taskWithAssignees = await GroupTask.findByPk(taskId, {
                include: [{
                    model: TaskAssignment,
                    as: 'assignments',
                    include: [{
                    model: User,
                    as: 'user',
                    attributes: ['userId', 'username', 'avatarUrl']
                    }]
                }]
            });

            res.json({
                success: true,
                data: {
                    ...taskWithAssignees.get({ plain: true }),
                    assignees: taskWithAssignees.assignments.map(a => a.user)
                }
            });

        } catch (error) {
            console.error("ERROR:", error instanceof Error ? error.message : error);
            next(error);
        }
    },

    deleteTask: async (req, res, next) => {
        try {
            const { taskId } = req.params;
            const { userId, username } = req.user;

            // Verifica se a tarefa existe e obtém groupId e title
            const task = await GroupTask.findByPk(taskId, {
                attributes: ['taskId', 'groupId', 'title'],
                raw: true
            });

            if (!task) {
                throw new NotFoundError('Tarefa não encontrada');
            }

            // Verifica se o usuário é líder/co-líder ativo
            const isLeader = await StudyGroupMember.findOne({
                where: {
                    groupId: task.groupId,
                    userId,
                    status: 'active',
                    role: { [Op.in]: ['leader', 'co-leader'] }
                }
            });

            if (!isLeader) {
                throw new ForbiddenError('Você não tem permissão para excluir esta tarefa');
            }

            // Buscar as atribuições antes da exclusão para notificação
            let assignments = [];
            try {
                assignments = await TaskAssignment.findAll({
                    where: { taskId },
                    attributes: ['userId'],
                    raw: true
            });
            } catch (error) {
                logger.error('Erro ao buscar atribuições para notificação de tarefa deletada:', error instanceof Error ? error.message : error);
            }

            const deletedRows = await sequelize.transaction(async (t) => {
            
             await TaskAssignment.destroy({
                where: { taskId },
                transaction: t
            });

            const result = await GroupTask.destroy({
                where: { taskId },
                transaction: t
            });

                return result;
            });

            if (deletedRows === 0) {
                throw new Error('Nenhuma tarefa foi excluída');
            }

            // Notificar usuários atribuídos à tarefa excluída
            try {
                await Promise.all(assignments.map(assignment =>
                    notificationService.createNotification(
                    assignment.userId,
                    'STUDY_GROUP_TASK_DELETED',
                    {
                        relatedEntityId: task.groupId,
                        metadata: {
                        groupId: task.groupId,
                        taskTitle: task.title,
                        deleterId: userId,
                        deleterUsername: username,
                        deletedAt: new Date().toISOString()
                        }
                    }
                )
            ));
            } catch (error) {
                logger.error('Erro ao notificar atribuições sobre exclusão de tarefa:', error instanceof Error ? error.message : error);
            }

            res.json({
                success: true,
                message: 'Tarefa excluída com sucesso',
                data: { taskId }
            });

        } catch (error) {
            logger.error("Error:", error instanceof Error ? error.message : error);
            next(error);
        }
    },

    assignTask: async (req, res, next) => {
        try {
            const { taskId } = req.params;
            const { userId: assignerId } = req.user;
            const { userId: assigneeId } = req.body;

            // Busca a tarefa com informações básicas do grupo
            const task = await GroupTask.findByPk(taskId, {
                attributes: ['taskId', 'groupId', 'status'],
                raw: true
            });

            if (!task) {
                throw new NotFoundError('Tarefa não encontrada');
            }

            // Verifica se o atribuidor tem permissão e se o atribuído é membro
            const [assigner, assignee] = await Promise.all([
                StudyGroupMember.findOne({
                    where: { 
                        groupId: task.groupId, 
                        userId: assignerId,
                        status: 'active',
                        role: { [Op.in]: ['leader', 'co-leader', 'moderator'] }
                    },
                    include: [{
                        model: User,
                        as: 'user',
                        attributes: ['userId', 'username']
                    }]
                }),
                StudyGroupMember.findOne({
                    where: { 
                        groupId: task.groupId, 
                        userId: assigneeId,
                        status: 'active'
                    },
                    include: [{
                        model: User,
                        as: 'user',
                        attributes: ['userId', 'username', 'email']
                    }]
                })
            ]);

            if (!assigner) {
                throw new ForbiddenError('Você não tem permissão para atribuir tarefas neste grupo');
            }

            if (!assignee) {
                throw new ForbiddenError('O usuário não é membro ativo deste grupo');
            }

            // Verifica se já existe atribuição
            const existingAssignment = await TaskAssignment.findOne({
                where: { taskId, userId: assigneeId }
            });

            if (existingAssignment) {
                return res.status(400).json({
                    success: 'false',
                    message: 'Esta tarefa já está atribuída a este usuário'
                });
            }

            // Cria a atribuição usando transação
            const result = await sequelize.transaction(async (transaction) => {
                const assignment = await TaskAssignment.create({
                    taskId,
                    userId: assigneeId,
                    assignedBy: assignerId,
                    status: 'pending'
                }, { transaction });

                // Atualiza o status da tarefa se necessário
                if (task.status === 'pending') {
                    await GroupTask.update(
                        { status: 'in_progress' },
                        { where: { taskId }, transaction }
                    );
                }

                return assignment;
            });

            try {
                await notificationService.notifyTaskAssigned(
                    taskId,
                    assigneeId,
                    assignerId
                );
            } catch (error) {
                logger.error(
                    'Erro ao notificar atribuição de tarefa:',
                    error instanceof Error ? error.message : error
                );
            }


            // Retorna os dados completos
            const fullAssignment = await TaskAssignment.findByPk(result.assignmentId, {
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['userId', 'username', 'email']
                    },
                    {
                        model: User,
                        as: 'assigner',
                        attributes: ['userId', 'username']
                    }
                ]
            });

            res.status(201).json({
                success: true,
                data: fullAssignment
            });

        } catch (error) {
            next(error);
        }
    },

    updateAssignmentStatus: async (req, res, next) => {
        try {
            const { assignmentId } = req.params;
            const { userId } = req.user;
            const { status } = req.body;

            // Busca a atribuição com informações da tarefa e usuário
            const assignment = await TaskAssignment.findByPk(assignmentId, {
                include: [
                    {
                        model: GroupTask,
                        as: 'task',
                        attributes: ['groupId']
                    },
                    {
                        model: User,
                        as: 'user',
                        attributes: ['userId', 'name']
                    }
                ]
            });

            if (!assignment) {
                throw new NotFoundError('Atribuição não encontrada');
            }

            // Verifica permissões
            const isAssignee = assignment.userId === userId;
            const isLeader = await StudyGroupMember.findOne({
                where: { 
                    groupId: assignment.task.groupId,
                    userId,
                    status: 'active',
                    role: { [Op.in]: ['leader', 'co-leader'] }
                }
            });

            if (!isAssignee && !isLeader) {
                throw new ForbiddenError('Você não tem permissão para atualizar esta tarefa');
            }

            // Valida transições de status
            const validTransitions = {
                pending: ['in_progress', 'completed', 'rejected'],
                in_progress: ['completed', 'rejected'],
                completed: ['in_progress'],
                rejected: ['pending']
            };

            if (!validTransitions[assignment.status]?.includes(status)) {
                throw new Error('Transição de status inválida');
            }

            // Atualiza o status
            assignment.status = status;
            
            if (status === 'completed') {
                assignment.completedAt = new Date();
            } else {
                assignment.completedAt = null;
            }

            await assignment.save();

            // Atualiza status da tarefa principal se todas estiverem completas
            if (status === 'completed') {
                const incompleteAssignments = await TaskAssignment.count({
                    where: { 
                        taskId: assignment.taskId,
                        status: { [Op.not]: 'completed' }
                    }
                });

                if (incompleteAssignments === 0) {
                    await GroupTask.update(
                        { status: 'completed' },
                        { where: { taskId: assignment.taskId } }
                    );
                }
            }

            res.json({
                success: true,
                data: assignment
            });

        } catch (error) {
            next(error);
        }
    },

    // Método adicional para buscar detalhes de uma tarefa específica
    getTaskDetails: async (req, res, next) => {
        try {
            const { taskId } = req.params;
            const { userId } = req.user;

            const task = await GroupTask.findByPk(taskId, {
                include: [
                    {
                        model: TaskAssignment,
                        as: 'assignments',
                        include: [{
                            model: User,
                            as: 'user',
                            attributes: ['userId', 'username', 'avatarUrl']
                        }]
                    },
                    {
                        model: User,
                        as: 'creator',
                        attributes: ['userId', 'username', 'avatarUrl']
                    }
                ]
            });

            if (!task) {
                throw new NotFoundError('Tarefa não encontrada');
            }

            // Verifica se o usuário tem acesso à tarefa
            const hasAccess = await StudyGroupMember.findOne({
                where: { 
                    groupId: task.groupId, 
                    userId,
                    status: 'active'
                }
            });

            if (!hasAccess) {
                throw new ForbiddenError('Você não tem acesso a esta tarefa');
            }

            // Formata os dados
            const taskData = task.get({ plain: true });
            taskData.assignees = taskData.assignments.map(a => a.user);

            res.json({
                success: true,
                data: taskData
            });

        } catch (error) {
            console.log("ERROR: ", error instanceof Error ? error.message : error);
            next(error);
        }
    }
};