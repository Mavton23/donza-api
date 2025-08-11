const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const EventParticipant = sequelize.define('EventParticipant', {
        registrationId: {
            type: DataTypes.UUID,
            defaultValue: () => uuidv4(),
            primaryKey: true,
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        eventId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        status: {
            type: DataTypes.ENUM('registered', 'attended', 'cancelled'),
            defaultValue: 'registered'
        },
        attended: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        registeredAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        }
    }, {
        timestamps: true,
        tableName: 'event_participants',
        indexes: [
            {
                fields: ['userId', 'eventId'],
                unique: true
            }
        ]
    });

    // EventParticipant.associate = (models) => {
    //     EventParticipant.belongsTo(models.User, {
    //         foreignKey: 'userId',
    //         as: 'user'
    //     });
        
    //     EventParticipant.belongsTo(models.Event, {
    //         foreignKey: 'eventId',
    //         as: 'event'
    //     });
    // };

    return EventParticipant;
};