const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const ConversationParticipant = sequelize.define('ConversationParticipant', {
    conversationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'conversations',
        key: 'conversationId'
      },
      onDelete: 'CASCADE'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'userId'
      },
      onDelete: 'CASCADE'
    },
    joinedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    muted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    archived: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    tableName: 'ConversationParticipants',
    timestamps: true,
    // indexes: [
    //   {
    //     unique: true,
    //     fields: ['conversationId', 'userId']
    //   }
    // ]
  });

  // ConversationParticipant.associate = (models) => {
  //   ConversationParticipant.belongsTo(models.Conversation, {
  //     foreignKey: 'conversationId',
  //     as: 'Conversation'
  //   });
    
  //   ConversationParticipant.belongsTo(models.User, {
  //     foreignKey: 'userId',
  //     as: 'User'
  //   });
  // };

  return ConversationParticipant;
};
