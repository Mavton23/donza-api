const calendarService = require('../services/calendar.service');

module.exports = {
    startGoogleAuth: async (req, res) => {
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/calendar.events']
        });
        res.redirect(authUrl);
    },

    handleGoogleCallback: async (req, res) => {
        const { code } = req.query;
        const { tokens } = await oauth2Client.getToken(code);
        
        // Salva tokens no usuário
        await User.update(
            { googleCalendarTokens: tokens },
            { where: { userId: req.user.userId } }
        );

        res.json({ success: true, message: 'Calendário conectado!' });
    },

    syncGroupEvents: async (req, res, next) => {
        try {
            const { groupId } = req.params;
            await calendarService.syncGroupMeetings(groupId, req.user.userId);
            res.json({ success: true, message: 'Eventos sincronizados!' });
        } catch (error) {
            next(error);
        }
    },
}