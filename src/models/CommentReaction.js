const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const CommentReaction = sequelize.define('CommentReaction', {
    reactionId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true
    },
    type: {
      type: DataTypes.ENUM(
        'like',       // Curtir
        'upvote',     // Voto positivo
        'downvote',   // Voto negativo
        'laugh',      // Risada
        'celebrate',  // Celebração
        'insightful', // Perspicaz
        'confused',   // Confuso
        'thanks'      // Agradecimento
      ),
      defaultValue: 'like'
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'comment_reactions',
    timestamps: true,
    // indexes: [
    //   {
    //     fields: ['commentId']
    //   },
    //   {
    //     fields: ['userId']
    //   },
    //   {
    //     fields: ['type']
    //   },
    //   {
    //     fields: ['commentId', 'userId'],
    //     unique: true
    //   }
    // ],
  });

  // CommentReaction.associate = (models) => {
  //   CommentReaction.belongsTo(models.PostComment, {
  //     foreignKey: 'commentId',
  //     as: 'comment'
  //   });
  //   CommentReaction.belongsTo(models.User, {
  //     foreignKey: 'userId',
  //     as: 'user'
  //   });
  // };

  return CommentReaction;
};