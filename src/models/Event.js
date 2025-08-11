const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const Event = sequelize.define('Event', {
    eventId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
    },
    organizerId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATE,
    },
    location: {
      type: DataTypes.STRING,
    },
    isOnline: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    meetingUrl: {
      type: DataTypes.STRING,
    },
    maxParticipants: {
      type: DataTypes.INTEGER,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00,
    },
    status: {
      type: DataTypes.ENUM('scheduled', 'live', 'completed', 'canceled'),
      defaultValue: 'scheduled',
    },
  }, {
    timestamps: true,
    tableName: 'events',
  });

  Event.associate = (models) => {
    Event.belongsToMany(models.User, {
        through: models.EventParticipant,
        as: 'participants',
        foreignKey: 'eventId',
    });

    Event.belongsTo(models.User, {
      foreignKey: 'organizerId',
      as: 'organizer'
    });

    Event.hasMany(models.Certificate, {
      foreignKey: 'eventId',
      as: 'certificates'
    });
  
  }

  return Event;
};