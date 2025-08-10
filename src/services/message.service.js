const { Conversation, Message, User } = require('../models');
const notificationService = require('./notification.service');

class MessageService {
  async startConversation(participantIds) {
    // Verifica se já existe conversa entre os participantes
    const existing = await this._findExistingConversation(participantIds);
    if (existing) return existing;

    // Cria nova conversa
    const conversation = await Conversation.create();
    await conversation.addParticipants(participantIds);
    return conversation;
  }

  async _findExistingConversation(participantIds) {
    const conversations = await Conversation.findAll({
      include: [{
        model: User,
        as: 'participants',
        attributes: ['userId'],
        through: { attributes: [] }
      }],
      having: sequelize.where(
        sequelize.fn('array_agg', sequelize.col('participants.userId')),
        '=',
        participantIds.sort()
      ),
      group: ['Conversation.conversationId']
    });

    return conversations.length > 0 ? conversations[0] : null;
  }
}

module.exports = new MessageService();