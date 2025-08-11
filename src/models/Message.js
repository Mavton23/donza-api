const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const Message = sequelize.define('Message', {
      messageId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
          notEmpty: true,
          len: [1, 2000]
        }
      },
      contextType: {
        type: DataTypes.ENUM('direct', 'course', 'support', 'announcement'),
        defaultValue: 'direct'
      },
      courseId: {
        type: DataTypes.UUID,
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('sent', 'delivered', 'read', 'pending_approval'),
        defaultValue: 'sent'
      },
      isTicket: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      isRead: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      }
    }, {
      tableName: 'messages',
      timestamps: true,
      // indexes: [
      //   {
      //     fields: ['conversationId']
      //   },
      //   {
      //     fields: ['senderId']
      //   },
      //   {
      //     fields: ['isRead']
      //   },
      //   {
      //     name: 'message_context_index',
      //     fields: ['contextType', 'courseId'] 
      //   }
      // ]
    });
  
    // Message.associate = (models) => {
    //   Message.belongsTo(models.User, {
    //     foreignKey: 'senderId',
    //     as: 'sender'
    //   });
    //   Message.belongsTo(models.Conversation, {
    //     foreignKey: 'conversationId',
    //     as: 'conversation'
    //   });
    // };
  
    return Message;
  };