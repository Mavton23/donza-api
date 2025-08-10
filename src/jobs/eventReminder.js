const { Event, User, EventParticipant } = require('../models');
const { Op } = require('sequelize');
const notificationService = require('../services/notification.service');
const logger = require('../utils/logger');
const cron = require('node-cron');

// Configuração dos tempos de lembrete (em horas)
const REMINDER_INTERVALS = [24, 1]; // 24 horas e 1 hora antes

// Função para formatar o tempo restante
const formatTimeRemaining = (hours) => {
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} ${days === 1 ? 'dia' : 'dias'}`;
  }
  return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
};

// Função principal para enviar lembretes
async function sendEventReminders() {
  const now = new Date();
  logger.info(`Iniciando envio de lembretes de eventos - ${now.toISOString()}`);

  try {
    // Busca eventos que estão dentro dos intervalos de lembrete
    const eventsToRemind = await Event.findAll({
      where: {
        status: 'scheduled',
        [Op.or]: REMINDER_INTERVALS.map(hours => ({
          startDate: {
            [Op.between]: [
              new Date(now.getTime() + (hours * 60 * 60 * 1000)),
              new Date(now.getTime() + ((hours + 0.99) * 60 * 60 * 1000))
            ]
          }
        }))
      },
      attributes: ['eventId', 'title', 'startDate', 'location', 'isOnline', 'meetingUrl']
    });

    if (eventsToRemind.length === 0) {
      logger.info('Nenhum evento para lembrar neste ciclo');
      return;
    }

    logger.info(`Encontrados ${eventsToRemind.length} eventos para lembrar`);

    // Processa cada evento
    for (const event of eventsToRemind) {
      try {
        // Calcula horas restantes arredondadas
        const hoursRemaining = Math.round(
          (event.startDate - now) / (60 * 60 * 1000)
        );

        // Verifica se está em um intervalo configurado
        if (!REMINDER_INTERVALS.includes(hoursRemaining)) {
          continue;
        }

        logger.info(`Processando lembrete para evento ${event.eventId} - ${hoursRemaining}h restantes`);

        // Busca participantes que devem receber a notificação
        const participants = await EventParticipant.findAll({
          where: { eventId: event.eventId },
          include: [{
            model: User,
            attributes: ['userId', 'email', 'notificationPreferences'],
            where: {
              notificationPreferences: {
                [Op.contains]: { eventReminders: true }
              }
            }
          }],
          limit: 1000
        });

        if (participants.length === 0) {
          logger.info(`Nenhum participante para notificar no evento ${event.eventId}`);
          continue;
        }

        logger.info(`Enviando lembretes para ${participants.length} participantes do evento ${event.eventId}`);

        // Prepara os dados da notificação
        const notificationPayload = {
          eventId: event.eventId,
          eventName: event.title,
          startDate: event.startDate,
          location: event.location,
          isOnline: event.isOnline,
          meetingUrl: event.meetingUrl,
          timeRemaining: formatTimeRemaining(hoursRemaining)
        };

        // Envia notificações em paralelo com limite
        const BATCH_SIZE = 50;
        for (let i = 0; i < participants.length; i += BATCH_SIZE) {
          const batch = participants.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(participant => 
              notificationService.createNotification(
                participant.User.userId,
                'EVENT_REMINDER',
                notificationPayload
              ).catch(err => {
                logger.error(`Erro ao enviar notificação para usuário ${participant.User.userId}`, err);
              })
          ));
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        logger.info(`Lembretes enviados com sucesso para evento ${event.eventId}`);

      } catch (error) {
        logger.error(`Erro ao processar evento ${event.eventId}`, error);
      }
    }

    logger.info('Processamento de lembretes concluído com sucesso');
  } catch (error) {
    logger.error('Erro no processo de envio de lembretes', error);
  }
}

// Configuração do agendamento
module.exports = {
  init: () => {
    // Executa a cada hora nos minutos 0
    cron.schedule('0 * * * *', sendEventReminders, {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    });

    // Executa imediatamente ao iniciar (desenvolvimento)
    if (process.env.NODE_ENV === 'development') {
      sendEventReminders();
    }

    logger.info('Serviço de lembretes de eventos iniciado');
  }
};