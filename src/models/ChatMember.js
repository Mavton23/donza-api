const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const ChatMember = sequelize.define('ChatMember', {
    memberId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true
    },
    lastSeen: {
      type: DataTypes.DATE
    },
    muteUntil: {
      type: DataTypes.DATE
    }
  }, {
    tableName: 'chat_members',
    timestamps: false
  });

  // ChatMember.associate = (models) => {
  //   ChatMember.belongsTo(models.GroupChat, {
  //     foreignKey: 'chatId'
  //   });
  //   ChatMember.belongsTo(models.User, {
  //     foreignKey: 'userId'
  //   });
  // };

  return ChatMember;
};