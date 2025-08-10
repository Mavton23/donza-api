const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const CommunityPost = sequelize.define('CommunityPost', {
      postId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      title: {
        type: DataTypes.STRING(120),
        allowNull: false,
        validate: {
          len: [3, 120]
        }
      },
      content: {
        type: DataTypes.TEXT('long'),
        allowNull: false
      },
      excerpt: {
        type: DataTypes.STRING(200),
        allowNull: true
      },
      isPinned: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      status: {
        type: DataTypes.ENUM('draft', 'published', 'archived', 'deleted'),
        defaultValue: 'draft'
      },
      visibility: {
        type: DataTypes.ENUM('public', 'members', 'restricted'),
        defaultValue: 'public'
      },
      postType: {
        type: DataTypes.ENUM('discussion', 'question', 'resource', 'announcement', 'assignment'),
        defaultValue: 'discussion'
      },
      difficultyLevel: {
        type: DataTypes.ENUM('beginner', 'intermediate', 'advanced'),
        allowNull: true
      },
      isOriginalContent: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      sourceUrl: {
        type: DataTypes.STRING(512),
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSON,
        defaultValue: {}
      },
      editHistory: {
        type: DataTypes.JSON,
        defaultValue: []
      },
      lastEditedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      acceptedAnswerId: {
        type: DataTypes.UUID,
        allowNull: true
      },
      isLocked: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      stats: {
        type: DataTypes.JSONB,
        defaultValue: {
          reactions: {
            like: 0,
            helpful: 0,
            creative: 0,
            confused: 0,
            celebrate: 0,
            insightful: 0
          },
          viewCount: 0,
          commentCount: 0
        }
    },
    }, {
      tableName: 'community_posts',
      timestamps: true,
      indexes: [
        {
          fields: ['communityId']
        },
        {
          fields: ['authorId']
        },
        {
          fields: ['isPinned']
        },
        {
          fields: ['postType']
        },
        {
          fields: ['status']
        }
      ]
    });
  
    CommunityPost.associate = (models) => {
      CommunityPost.belongsTo(models.Community, {
        foreignKey: 'communityId',
        as: 'community'
      });
      CommunityPost.belongsTo(models.User, {
        foreignKey: 'authorId',
        as: 'author'
      });
      CommunityPost.hasMany(models.PostComment, {
        foreignKey: 'postId',
        as: 'comments'
      });
      CommunityPost.hasMany(models.PostReaction, {
        foreignKey: 'postId',
        as: 'reactions'
      });
      CommunityPost.belongsToMany(models.Tag, {
        through: 'PostTags',
        as: 'tags'
      });
      CommunityPost.belongsToMany(models.LearningObjective, {
        through: 'PostObjectives',
        as: 'objectives'
      });
      CommunityPost.hasMany(models.PostAttachment, {
        foreignKey: 'postId',
        as: 'attachments'
      })
    };
  
    return CommunityPost;
  };