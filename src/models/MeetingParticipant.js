const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const MeetingParticipant = sequelize.define('MeetingParticipant', {
      participationId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      attendanceStatus: {
        type: DataTypes.ENUM('confirmed', 'declined', 'pending'),
        defaultValue: 'pending'
      },
      joinedAt: {
        type: DataTypes.DATE
      },
      leftAt: {
        type: DataTypes.DATE
      }
    }, {
      tableName: 'meeting_participants',
      timestamps: false
    });
  
    // MeetingParticipant.associate = (models) => {
    //   MeetingParticipant.belongsTo(models.GroupMeeting, {
    //     foreignKey: 'meetingId'
    //   });
    //   MeetingParticipant.belongsTo(models.User, {
    //     foreignKey: 'userId'
    //   });
    // };
  
    return MeetingParticipant;
  };