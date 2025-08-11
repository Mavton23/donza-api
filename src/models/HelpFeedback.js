const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const HelpFeedback = sequelize.define('HelpFeedback', {
    feedbackId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
    },
    wasHelpful: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    comment: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  }, {
    tableName: 'help_feedbacks',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    indexes: [
      {
        name: 'help_feedbacks_user_article_index',
        fields: ['userId', 'articleId'],
        unique: true,
      },
      {
        name: 'help_feedbacks_article_index',
        fields: ['articleId'],
      },
    ],
  });

  HelpFeedback.associate = (models) => {
    HelpFeedback.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    });
    
    HelpFeedback.belongsTo(models.HelpArticle, {
      foreignKey: 'articleId',
      as: 'article',
    });
  };

  return HelpFeedback;
};