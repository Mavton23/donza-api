const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const GroupMeeting = sequelize.define('GroupMeeting', {
      meetingId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT
      },
      startTime: {
        type: DataTypes.DATE,
        allowNull: false
      },
      endTime: {
        type: DataTypes.DATE
      },
      meetingUrl: {
        type: DataTypes.STRING,
        validate: {
          isUrl: true
        }
      },
      recurring: {
        type: DataTypes.JSON,
        defaultValue: null
      },
      status: {
        type: DataTypes.ENUM('scheduled', 'completed', 'canceled'),
        defaultValue: 'scheduled'
      }
    }, {
      tableName: 'group_meetings',
      timestamps: true,
      // indexes: [
      //   {
      //     fields: ['groupId']
      //   },
      //   {
      //     fields: ['startTime']
      //   }
      // ]
    });
  
    GroupMeeting.associate = (models) => {
      GroupMeeting.belongsTo(models.StudyGroup, {
        foreignKey: 'groupId',
        as: 'studyGroup'
      });
      GroupMeeting.belongsTo(models.User, {
        foreignKey: 'organizerId',
        as: 'organizer'
      });
      GroupMeeting.belongsToMany(models.User, {
        through: 'MeetingParticipants',
        as: 'participants'
      });
    };
  
    return GroupMeeting;
  };