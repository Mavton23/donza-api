const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const GroupChat = sequelize.define('GroupChat', {
      chatId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      currentTopic: {
        type: DataTypes.STRING,
        allowNull: true
      },
      topicSetAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      topicSetBy: {
        type: DataTypes.UUID,
        allowNull: true
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      lastActivity: {
        type: DataTypes.DATE
      },
      discussionSettings: {
        type: DataTypes.JSON,
        defaultValue: {
          allowImages: true,
          allowFiles: false,
          deleteMessagesAfter: 30, // Dias
          onlyLeadersCanSetTopic: false,
          minTopicDuration: 15 // Minutos
        }
      }
    }, {
      tableName: 'group_chats',
      timestamps: true
    });
  
    GroupChat.associate = (models) => {
      GroupChat.belongsTo(models.StudyGroup, {
        foreignKey: 'groupId',
        unique: true
      });
      GroupChat.belongsTo(models.User, {
        foreignKey: 'topicSetBy',
        as: 'topicSetter'
      });
    };
  
    return GroupChat;
};