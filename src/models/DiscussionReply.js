const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const DiscussionReply = sequelize.define('DiscussionReply', {
      replyId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      upvotes: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      isSolution: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      }
    }, {
      tableName: 'discussion_replies',
      timestamps: true,
      // indexes: [
      //   {
      //     fields: ['topicId']
      //   },
      //   {
      //     fields: ['isSolution']
      //   }
      // ]
    });
  
    DiscussionReply.associate = (models) => {
      DiscussionReply.belongsTo(models.DiscussionTopic, {
        foreignKey: 'topicId'
      });
      DiscussionReply.belongsTo(models.User, {
        foreignKey: 'authorId',
        as: 'author'
      });
      DiscussionReply.hasMany(models.ReplyVote, {
        foreignKey: 'replyId',
        as: 'votes'
      });
    };
  
    return DiscussionReply;
  };