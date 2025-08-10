const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const Achievement = sequelize.define('Achievement', {
      achievementId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      type: {
        type: DataTypes.ENUM(
          'TOP_CONTRIBUTOR', 
          'TASK_COMPLETER', 
          'DISCUSSION_LEADER',
          'RESOURCE_PROVIDER'
        ),
        allowNull: false
      },
      points: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      }
    }, {
      tableName: 'achievements',
      timestamps: true
    });
  
    Achievement.associate = (models) => {
      Achievement.belongsTo(models.StudyGroupMember, {
        foreignKey: 'membershipId'
      });
    };
  
    return Achievement;
  };