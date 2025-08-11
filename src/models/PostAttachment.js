const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const PostAttachment = sequelize.define('PostAttachment', {
      attachmentId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      url: {
        type: DataTypes.STRING(512),
        allowNull: false,
        validate: {
          isUrl: true
        }
      },
      type: {
        type: DataTypes.ENUM(
          'file',
          'link',
          'video',
          'image',
          'document',
          'presentation'
        ),
        defaultValue: 'file'
      },
      title: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      metadata: {
        type: DataTypes.JSON,
        defaultValue: {}
      }
    }, {
      tableName: 'post_attachments',
      timestamps: true,
      // indexes: [
      //   {
      //     fields: ['postId']
      //   },
      //   {
      //     fields: ['type']
      //   }
      // ]
    });
  
    PostAttachment.associate = (models) => {
      PostAttachment.belongsTo(models.CommunityPost, {
        foreignKey: 'postId',
        as: 'post'
      });
      PostAttachment.belongsTo(models.User, {
        foreignKey: 'uploadedById',
        as: 'uploadedBy'
      });
    };
  
    return PostAttachment;
  };