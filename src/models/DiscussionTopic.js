const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const DiscussionTopic = sequelize.define('DiscussionTopic', {
      topicId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      title: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      isPinned: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      isClosed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      tags: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: []
      },
      flags: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
    }, {
      tableName: 'discussion_topics',
      timestamps: true,
      // indexes: [
      //   {
      //     fields: ['groupId']
      //   },
      //   {
      //     fields: ['isPinned']
      //   }
      // ]
    });
  
    DiscussionTopic.associate = (models) => {
      DiscussionTopic.belongsTo(models.StudyGroup, {
        foreignKey: 'groupId'
      });
      DiscussionTopic.belongsTo(models.User, {
        foreignKey: 'authorId',
        as: 'author'
      });
      DiscussionTopic.hasMany(models.DiscussionReply, {
        foreignKey: 'topicId',
        as: 'replies'
      });
    };
  
    return DiscussionTopic;
  };