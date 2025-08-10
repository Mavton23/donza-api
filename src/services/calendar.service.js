const { google } = require('googleapis');
const { GroupMeeting, GroupTask } = require('../models');

// Configuração OAuth2 (Google)
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

module.exports = {
  /**
   * Cria um evento no Google Calendar
   */
  createGoogleCalendarEvent: async (userId, eventData) => {
    try {
      // Obter tokens do usuário
      const user = await User.findByPk(userId);
      if (!user.googleCalendarTokens) {
        throw new Error('Usuário não conectou o Google Calendar');
      }

      oauth2Client.setCredentials(user.googleCalendarTokens);
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      const event = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: eventData.title,
          description: eventData.description,
          start: { dateTime: eventData.startTime, timeZone: 'UTC' },
          end: { dateTime: eventData.endTime, timeZone: 'UTC' },
          attendees: eventData.attendees?.map(email => ({ email })),
          reminders: { useDefault: true }
        }
      });

      return event.data;
    } catch (error) {
      console.error('Erro ao criar evento no Google Calendar:', error.message);
      throw error;
    }
  },

  /**
   * Sincroniza todas as reuniões de um grupo com o calendário
   */
  syncGroupMeetings: async (groupId, userId) => {
    const meetings = await GroupMeeting.findAll({ where: { groupId } });
    const members = await StudyGroupMember.findAll({ 
      where: { groupId },
      include: ['user']
    });

    for (const meeting of meetings) {
      await this.createGoogleCalendarEvent(userId, {
        title: `[Grupo] ${meeting.title}`,
        description: meeting.description,
        startTime: meeting.startTime.toISOString(),
        endTime: meeting.endTime.toISOString(),
        attendees: members.map(m => m.user.email)
      });
    }
  }
};