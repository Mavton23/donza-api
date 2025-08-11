const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const PostReaction = sequelize.define('PostReaction', {
    reactionId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true
    },
    type: {
      type: DataTypes.ENUM(
        'like', 
        'helpful',
        'creative',
        'confused',
        'celebrate',
        'insightful'
      ),
      defaultValue: 'like'
    }
  }, {
    tableName: 'post_reactions',
    timestamps: true,
    // indexes: [
    //   {
    //     fields: ['postId']
    //   },
    //   {
    //     fields: ['userId']
    //   },
    //   {
    //     fields: ['type']
    //   },
    //   {
    //     fields: ['postId', 'userId'],
    //     unique: true
    //   }
    // ]
  });

  // PostReaction.associate = (models) => {
  //   PostReaction.belongsTo(models.CommunityPost, {
  //     foreignKey: 'postId',
  //     as: 'post'
  //   });
  //   PostReaction.belongsTo(models.User, {
  //     foreignKey: 'userId',
  //     as: 'user'
  //   });
  // };

  return PostReaction;
};