const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const PostComment = sequelize.define('PostComment', {
    commentId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        len: [1, 1000]
      }
    },
    status: {
      type: DataTypes.ENUM('active', 'deleted', 'flagged'),
      defaultValue: 'active'
    },
    isAnswer: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'post_comments',
    timestamps: true,
    paranoid: true,
    indexes: [
      {
        fields: ['postId']
      },
      {
        fields: ['authorId']
      },
      {
        fields: ['parentCommentId']
      },
      {
        type: 'FULLTEXT',
        fields: ['content']
      }
    ]
  });

  PostComment.associate = (models) => {
    PostComment.belongsTo(models.CommunityPost, {
      foreignKey: 'postId',
      as: 'post'
    });
    PostComment.belongsTo(models.User, {
      foreignKey: 'authorId',
      as: 'author'
    });
    PostComment.belongsTo(models.PostComment, {
      foreignKey: 'parentCommentId',
      as: 'parentComment'
    });
    PostComment.hasMany(models.PostComment, {
      foreignKey: 'parentCommentId',
      as: 'replies'
    });
    PostComment.hasMany(models.CommentReaction, {
      foreignKey: 'commentId',
      as: 'reactions'
    });
  };

  return PostComment;
};