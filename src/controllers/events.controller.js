const { Event, User, EventParticipant } = require('../models');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../utils/errors');
const notificationService = require('../services/notification.service');
const { ROLES, EVENT_STATUS } = require('../constants/constants');
const { sequelize } = require('../configs/db');

module.exports = {
    /**
     * Obtém todos os eventos públicos
     */
    getPublicEvents: async (req, res, next) => {
        try {
            const { page = 1, limit = 10, type, date, status, search } = req.query;
            const offset = (page - 1) * limit;
            
            const where = {};
            
            // Filtro de status
            if (status && ['scheduled', 'live', 'completed', 'canceled'].includes(status)) {
                where.status = status;
            } else {
                where.status = 'scheduled';
            }
            
            // Filtro de tipo
            if (type === 'online') {
                where.isOnline = true;
            } else if (type === 'in-person') {
                where.isOnline = false;
            }
            
            // Filtro por data
            if (date) {
                where.startDate = {
                    [Op.gte]: new Date(date),
                    [Op.lt]: new Date(new Date(date).setDate(new Date(date).getDate() + 1))
                };
            }
            
            // Filtro de busca
            if (search) {
                where[Op.or] = [
                    { title: { [Op.iLike]: `%${search}%` } },
                    { description: { [Op.iLike]: `%${search}%` } }
                ];
            }
            
            const { count, rows: events } = await Event.findAndCountAll({
                where,
                limit: parseInt(limit),
                offset: parseInt(offset),
                include: [
                    {
                        model: User,
                        as: 'participants',
                        attributes: ['userId', 'username', 'avatarUrl', 'institutionName'],
                        through: { attributes: [] }
                    },
                    {
                        model: User,
                        as: 'organizer',
                        attributes: ['userId', 'username', 'avatarUrl']
                    }
                ],
                order: [['startDate', 'ASC']],
                distinct: true
            });
            
            res.json({
                success: true,
                data: events,
                meta: {
                    total: count,
                    page: parseInt(page),
                    totalPages: Math.ceil(count / limit)
                }
            });
        } catch (error) {
            console.error('Error in getPublicEvents:', error);
            next(error);
        }
    },

    /**
     * Obtém detalhes de um evento específico
     */
    getEventDetails: async (req, res, next) => {
        try {
            const { eventId } = req.params;
            
            const event = await Event.findByPk(eventId, {
                include: [
                    {
                        model: User,
                        as: 'organizer',
                        attributes: ['userId', 'username', 'avatarUrl', 'institutionName', 'bio', 'email', 'contactPhone']
                    },
                    {
                        model: User,
                        as: 'participants',
                        attributes: ['userId', 'username', 'avatarUrl'],
                        through: { attributes: [] }
                    }
                ]
            });

            if (!event) {
                throw new NotFoundError('Evento não encontrado');
            }

            res.json(event);
        } catch (error) {
            next(error);
        }
    },

    getEventParticipantUser: async (req, res, next) => {
        try {
            const { eventId, userId } = req.params;
            
            // Verifica se o evento existe
            const event = await Event.findByPk(eventId);
            if (!event) {
                throw new NotFoundError('Evento não encontrado');
            }
    
            // Verifica se o usuário existe
            const user = await User.findByPk(userId);
            if (!user) {
                throw new NotFoundError('Usuário não encontrado');
            }
    
            // Verifica se o usuário está registrado no evento
            const registration = await EventParticipant.findOne({
                where: {
                    eventId,
                    userId
                }
            });
    
            res.json({
                isRegistered: !!registration,
                registrationDate: registration?.createdAt || null
            });
        } catch (error) {
            console.log("Motivo: ", error instanceof Error ? error.message : error);
            next(error);
        }
    },

    /**
     * Cria um novo evento
     */
    createEvent: async (req, res, next) => {
        try {
            const { userId, role } = req.user;
            const eventData = req.body;
            
            // Verifica se é instituição
            if (role === ROLES.INSTITUTION) {
                const institution = await User.findByPk(userId);
                if (!institution.institutionName) {
                    throw new ForbiddenError('Seu perfil de instituição precisa ser completado');
                }
                eventData.organizerId = userId;
            }
            
            const event = await Event.create({
                ...eventData,
                status: EVENT_STATUS.SCHEDULED,
                organizerId: eventData.organizerId || userId
            });

            // Notifica o criador
            await notificationService.notifyEventCreated(event, req.user);

            res.status(201).json({
                success: true,
                data: event
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * Atualiza um evento existente
     */
    updateEvent: async (req, res, next) => {
        try {
            const { eventId } = req.params;
            const { userId, role } = req.user;
            const updateData = req.body;

            const event = await Event.findByPk(eventId, {
                include: [{
                    model: User,
                    as: 'participants',
                    attributes: ['userId']
                }]
            });
            if (!event) {
                throw new NotFoundError('Evento não encontrado');
            }

            // Verifica permissões
            const isOrganizer = event.organizerId === userId;
            const isAdmin = role === ROLES.ADMIN;
            const isInstitution = role === ROLES.INSTITUTION;
            
            if (!isOrganizer && !isAdmin && !isInstitution) {
                throw new ForbiddenError('Você não tem permissão para editar este evento');
            }

            // Restrições para não-admins
            if (!isAdmin) {
                if (updateData.organizerId && updateData.organizerId !== userId) {
                    throw new ForbiddenError('Apenas administradores podem transferir eventos');
                }
                
                // Impede mudança de status para certos valores
                if (updateData.status && 
                    [EVENT_STATUS.COMPLETED, EVENT_STATUS.CANCELED].includes(updateData.status)) {
                    throw new ForbiddenError('Você não pode marcar o evento como completado/cancelado');
                }
            }

            await event.update(updateData);

            const changes = req.body;

            // Notifica participantes apenas se houver mudanças relevantes
            if (Object.keys(changes).length > 0 && event.participants.length > 0) {
                const significantChanges = ['startDate', 'endDate', 'location', 'isOnline', 'meetingUrl', 'status'];
                const hasSignificantChange = Object.keys(changes).some(key => significantChanges.includes(key));
                
                if (hasSignificantChange) {
                    await notificationService.notifyEventUpdated(
                        { ...event.get({ plain: true }), changes },
                        req.user,
                        event.participants
                    );
                }
            }

            res.json({
                success: true,
                data: event
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * Remove um evento
     */
    deleteEvent: async (req, res, next) => {
        try {
            const { eventId } = req.params;
            const { userId, role } = req.user;

            const event = await Event.findByPk(eventId, {
                include: [{
                    model: User,
                    as: 'participants',
                    attributes: ['userId', 'email']
                }]
            });

            if (!event) {
                throw new NotFoundError('Evento não encontrado');
            }

            // Verifica permissões
            const isOrganizer = event.organizerId === userId;
            const isAdmin = role === ROLES.ADMIN;
            const isInstitution = role === ROLES.INSTITUTION;
            
            if (!isOrganizer && !isAdmin && !isInstitution) {
                throw new ForbiddenError('Você não tem permissão para deletar este evento');
            }

            await event.destroy();

            // Notifica participantes e organizador
            await notificationService.notifyEventDeleted(
                event,
                req.user,
                event.participants
            );

            res.json({
                success: true,
                message: 'Evento deletado com sucesso'
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * Registra usuário em um evento
     */
    registerForEvent: async (req, res, next) => {
        try {
            const { eventId } = req.params;
            const { userId } = req.user;

            const [event, participant] = await Promise.all([
                Event.findByPk(eventId, {
                    include: [{
                        model: User,
                        as: 'organizer',
                        attributes: ['userId']
                    }]
                }),
                User.findByPk(userId)
            ]);

            if (!event) {
                throw new NotFoundError('Evento não encontrado');
            }

            // Verifica se o evento está agendado
            if (event.status !== EVENT_STATUS.SCHEDULED) {
                throw new BadRequestError('Este evento não está aceitando inscrições');
            }

            // Verifica limite de participantes
            if (event.maxParticipants) {
                const participantCount = await EventParticipant.count({
                    where: { eventId }
                });
                
                if (participantCount >= event.maxParticipants) {
                    throw new BadRequestError('Este evento atingiu o limite de participantes');
                }
            }

            // Verifica se já está inscrito
            const existingRegistration = await EventParticipant.findOne({
                where: { userId, eventId }
            });

            if (existingRegistration) {
                throw new BadRequestError('Você já está registrado neste evento');
            }

            // Cria o registro
            await EventParticipant.create({
                userId,
                eventId,
                registeredAt: new Date()
            });

            // Notifica o participante e o organizador
            await notificationService.notifyEventRegistration(event, participant);

            res.status(201).json({
                success: true,
                message: 'Inscrição no evento realizada com sucesso'
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * Cancela registro em um evento
     */
    cancelEventRegistration: async (req, res, next) => {
        try {
            const { eventId } = req.params;
            const { userId } = req.user;

            const [event, participant] = await Promise.all([
                Event.findByPk(eventId, {
                    include: [{
                        model: User,
                        as: 'organizer',
                        attributes: ['userId']
                    }]
                }),
                User.findByPk(userId)
            ]);

            if (!event) {
                throw new NotFoundError('Evento não encontrado');
            }

            // Verifica se o evento permite cancelamento
            if (event.startDate < new Date()) {
                throw new BadRequestError('Não é possível cancelar a inscrição após o início do evento');
            }

            // Remove o registro
            const result = await EventParticipant.destroy({
                where: { userId, eventId }
            });

            if (result === 0) {
                throw new NotFoundError('Inscrição não encontrada');
            }

            // Notifica o participante e o organizador
            await notificationService.notifyEventRegistrationCancelled(event, participant);

            res.json({
                success: true,
                message: 'Inscrição cancelada com sucesso'
            });
        } catch (error) {
            next(error);
        }
    },

    /**
     * Obtém lista de participantes de um evento
     */
    getEventParticipants: async (req, res, next) => {
        try {
            const { eventId } = req.params;
            const { userId, role } = req.user;
    
            const event = await Event.findByPk(eventId);
            if (!event) {
                throw new NotFoundError('Evento não encontrado');
            }
    
            // Verifica se é o organizador ou admin
            const isOrganizer = event.organizerId === userId;
            const isAdmin = role === ROLES.ADMIN;
            const isInstitution = role === ROLES.INSTITUTION;
            
            if (!isOrganizer && !isAdmin && !isInstitution) {
                throw new ForbiddenError('Você não tem permissão para ver os participantes deste evento');
            }
    
            const participants = await EventParticipant.findAll({
                where: { eventId },
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['userId', 'username', 'email', 'avatarUrl']
                    }
                ],
                order: [['registeredAt', 'ASC']]
            });
    
            res.json(participants);
        } catch (error) {
            next(error);
        }
    },

    /**
     * Obtém lista dos eventos existentes
     */
    getAllEvents: async (req, res) => {
        try {
            // Verificação de permissão
            if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Apenas administradores podem listar todos os eventos'
            });
            }

            // Extrair parâmetros
            const { page = 1, limit = 10, status, type, sort = 'upcoming' } = req.query;
            const offset = (page - 1) * limit;

            const where = {};
            if (status) where.status = status;
            if (type) where.isOnline = type === 'online';

            let order;
            switch (sort) {
            case 'upcoming':
                order = [['startDate', 'ASC']];
                break;
            case 'recent':
                order = [['startDate', 'DESC']];
                break;
            default:
                order = [['startDate', 'ASC']];
            }

            const { count, rows: events } = await Event.findAndCountAll({
            where,
            include: [{
                model: User,
                as: 'organizer',
                attributes: ['userId', 'username', 'fullName', 'avatarUrl', 'institutionName']
            }],
            order,
            limit: parseInt(limit),
            offset: parseInt(offset),
            distinct: true
            });

            // Contar participantes para cada evento
            const eventsWithParticipants = await Promise.all(
            events.map(async event => {
                const participantsCount = await event.countParticipants();
                return {
                ...event.get({ plain: true }),
                participantsCount,
                organizer: {
                    ...event.organizer.get({ plain: true }),
                    name: event.organizer.institutionName || event.organizer.fullName || event.organizer.username
                }
                };
            })
            );

            res.json({
            success: true,
            data: {
                events: eventsWithParticipants,
                page: parseInt(page),
                totalPages: Math.ceil(count / limit),
                totalItems: count
            }
            });

        } catch (error) {
            console.error('Error in getAllEvents:', {
            message: error.message,
            stack: error.stack
            });
            
            res.status(500).json({
            success: false,
            message: 'Erro ao carregar eventos',
            ...(process.env.NODE_ENV === 'development' && {
                error: error.message
            })
          });
        }
    }
};