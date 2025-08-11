const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const MessageRequest = sequelize.define('MessageRequest', {
        requestId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
        },
        subject: {
        type: DataTypes.STRING,
        allowNull: false
        },
        message: {
        type: DataTypes.TEXT,
        allowNull: false
        },
        status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        defaultValue: 'pending'
        }
    }, {
        tableName: 'message_requests'
    });

    // MessageRequest.associate = (models) => {
    //     MessageRequest.belongsTo(models.User, {
    //         as: 'sender',
    //         foreignKey: 'senderId'
    //     });
    //     MessageRequest.belongsTo(models.User, {
    //         as: 'receiver',
    //         foreignKey: 'receiverId'
    //     });
    // }

    return MessageRequest;
}
