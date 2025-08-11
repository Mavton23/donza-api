const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const ReplyVote = sequelize.define('ReplyVote', {
      voteId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      voteType: {
        type: DataTypes.ENUM('up', 'down'),
        allowNull: false
      }
    }, {
      tableName: 'reply_votes',
      timestamps: true,
      // indexes: [
      //   {
      //     unique: true,
      //     fields: ['replyId', 'userId']
      //   }
      // ]
    });
  
    // ReplyVote.associate = (models) => {
    //   ReplyVote.belongsTo(models.DiscussionReply, {
    //     foreignKey: 'replyId'
    //   });
    //   ReplyVote.belongsTo(models.User, {
    //     foreignKey: 'userId'
    //   });
    // };
  
    return ReplyVote;
  };