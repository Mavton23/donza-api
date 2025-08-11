const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const GroupReport = sequelize.define('GroupReport', {
      reportId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      type: {
        type: DataTypes.ENUM(
          'WEEKLY_ACTIVITY', 
          'MONTHLY_SUMMARY', 
          'TASK_COMPLETION',
          'TOP_CONTRIBUTORS'
        ),
        allowNull: false
      },
      data: {
        type: DataTypes.JSONB,
        allowNull: false
      },
      periodStart: {
        type: DataTypes.DATE,
        allowNull: false
      },
      periodEnd: {
        type: DataTypes.DATE,
        allowNull: false
      }
    }, {
      tableName: 'group_reports',
      timestamps: true
    });
  
    // GroupReport.associate = (models) => {
    //   GroupReport.belongsTo(models.StudyGroup, {
    //     foreignKey: 'groupId'
    //   });
    //   GroupReport.belongsTo(models.User, {
    //     foreignKey: 'generatedBy',
    //     as: 'generator'
    //   });
    // };
  
    return GroupReport;
  };