const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const SharedContent = sequelize.define('SharedContent', {
      contentId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT
      },
      fileUrl: {
        type: DataTypes.STRING
      },
      fileType: {
        type: DataTypes.ENUM('pdf', 'video', 'code', 'link', 'slide', 'image'),
        allowNull: false
      },
      externalUrl: {
        type: DataTypes.STRING,
        validate: {
          isUrl: true
        }
      },
      downloadCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      }
    }, {
      tableName: 'shared_contents',
      timestamps: true,
      // indexes: [
      //   {
      //     fields: ['groupId', 'fileType']
      //   },
      // ]
    });
  
    SharedContent.associate = (models) => {
      SharedContent.belongsTo(models.StudyGroup, {
        foreignKey: 'groupId'
      });
      SharedContent.belongsTo(models.User, {
        foreignKey: 'uploaderId',
        as: 'uploader'
      });
    };
  
    return SharedContent;
  };