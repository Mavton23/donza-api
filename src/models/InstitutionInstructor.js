const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const InstitutionInstructor = sequelize.define('InstitutionInstructor', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    institutionId: {
      type: DataTypes.UUID,
      references: {
        model: 'users',
        key: 'userId'
      }
    },
    instructorId: {
      type: DataTypes.UUID,
      references: {
        model: 'users',
        key: 'userId'
      }
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'accepted', 'rejected'),
      defaultValue: 'pending'
    },
    invitedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    respondedAt: {
      type: DataTypes.DATE
    }
  }, {
    tableName: 'institution_instructors',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['institutionId', 'instructorId']
      }
    ]
  });

  return InstitutionInstructor;
};