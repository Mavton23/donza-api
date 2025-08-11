const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const PostView = sequelize.define('PostView', {
      viewId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      duration: {
        type: DataTypes.INTEGER, // em segundos
        defaultValue: 0
      },
      deviceType: {
        type: DataTypes.ENUM('desktop', 'mobile', 'tablet'),
        allowNull: true
      }
    }, {
      tableName: 'post_views',
      timestamps: true,
      // indexes: [
      //   {
      //     fields: ['postId']
      //   },
      //   {
      //     fields: ['userId']
      //   },
      //   {
      //     fields: ['createdAt']
      //   }
      // ]
    });
  
    // PostView.associate = (models) => {
    //   PostView.belongsTo(models.CommunityPost, {
    //     foreignKey: 'postId',
    //     as: 'post'
    //   });
    //   PostView.belongsTo(models.User, {
    //     foreignKey: 'userId',
    //     as: 'user'
    //   });
    // };
  
    return PostView;
  };