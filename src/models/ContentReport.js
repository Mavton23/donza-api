const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const ContentReport = sequelize.define('ContentReport', {
      reportId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      reason: {
        type: DataTypes.ENUM('spam', 'inappropriate', 'off_topic', 'other'),
        allowNull: false
      },
      resolved: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      }
    }, {
      tableName: 'content_reports'
    });
  
    ContentReport.associate = (models) => {
      ContentReport.belongsTo(models.User, {
        foreignKey: 'reporterId'
      });
      ContentReport.belongsTo(models.DiscussionTopic, {
        foreignKey: 'topicId'
      });
    };
  
    return ContentReport;
  };