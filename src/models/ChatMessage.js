const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const ChatMessage = sequelize.define('ChatMessage', {
      messageId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      type: {
        type: DataTypes.ENUM('text', 'image', 'file', 'link', 'topic_change'),
        defaultValue: 'text'
      },
      metadata: {
        type: DataTypes.JSON
      },
      edited: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      readBy: {
        type: DataTypes.JSON,
        defaultValue: []
      },
      isOnTopic: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    }, {
      tableName: 'chat_messages',
      timestamps: true,
      // indexes: [
      //   {
      //     fields: ['chatId', 'createdAt']
      //   },
      //   {
      //     fields: ['isOnTopic']
      //   }
      // ]
    });
  
    ChatMessage.associate = (models) => {
      ChatMessage.belongsTo(models.GroupChat, {
        foreignKey: 'chatId'
      });
      ChatMessage.belongsTo(models.User, {
        foreignKey: 'senderId',
        as: 'sender'
      });
      ChatMessage.belongsTo(models.ChatMessage, {
        foreignKey: 'replyToId',
        as: 'replyTo'
      });
    };
  
    return ChatMessage;
};