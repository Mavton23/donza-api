const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const Conversation = sequelize.define('Conversation', {
      conversationId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      lastMessageAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      contextType: {
        type: DataTypes.ENUM('direct', 'course', 'support', 'group'),
        defaultValue: 'direct'
      },
      contextId: {
        type: DataTypes.UUID,
        allowNull: true
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    }, {
      tableName: 'conversations',
      timestamps: true
    });
  
    // Conversation.associate = (models) => {
    //   Conversation.belongsToMany(models.User, {
    //     through: models.ConversationParticipant,
    //     as: 'participants',
    //     foreignKey: 'conversationId'
    //   });
    
    //   // Todas as mensagens da conversa
    //   Conversation.hasMany(models.Message, {
    //     foreignKey: 'conversationId',
    //     as: 'messages'
    //   });
    
    //   // Última mensagem (alias separado)
    //   Conversation.hasMany(models.Message, {
    //     foreignKey: 'conversationId',
    //     as: 'lastMessage'
    //   });
    
    //   // Mensagens não lidas (alias separado)
    //   Conversation.hasMany(models.Message, {
    //     foreignKey: 'conversationId',
    //     as: 'unreadCount'
    //   });
    // };
  
    return Conversation;
  };