const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const HelpArticle = sequelize.define('HelpArticle', {
    articleId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
      comment: 'Identificador único do artigo de ajuda'
    },
    title: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Título do artigo',
      validate: {
        notEmpty: true
      }
    },
    slug: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: 'slug_unique',
      comment: 'Slug para URLs amigáveis'
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'getting-started',
      comment: 'Categoria do artigo'
    },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived'),
      defaultValue: 'draft',
      comment: 'Status de publicação do artigo'
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Conteúdo completo do artigo'
    },
    excerpt: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: 'Resumo do artigo'
    },
    viewCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Número de visualizações'
    },
    feedbackCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Número de feedbacks recebidos'
    },
    helpfulCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Número de usuários que marcaram como útil'
    },
    rating: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      comment: 'Avaliação média (0-5)'
    },
    lastReviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Data da última revisão do conteúdo'
    },
    reviewerId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'ID do usuário que revisou o artigo'
    }
  }, {
    tableName: 'help_articles',
    timestamps: true,
    comment: 'Artigos da central de ajuda',
    hooks: {
      beforeValidate: (article) => {
        if (article.title && !article.slug) {
          article.slug = article.title.toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
        }
      },
      beforeSave: (article) => {
        if (article.feedbackCount > 0) {
          article.rating = (article.helpfulCount / article.feedbackCount) * 5;
        }
      }
    },
    // indexes: [
    //   {
    //     name: 'slug_unique',
    //     fields: ['slug'],
    //     unique: true
    //   },
    //   {
    //     name: 'help_articles_category_index',
    //     fields: ['category']
    //   },
    //   {
    //     name: 'help_articles_rating_index',
    //     fields: ['rating']
    //   }
    // ]
  });

  // HelpArticle.associate = (models) => {
  //   HelpArticle.belongsTo(models.HelpCategory, {
  //       foreignKey: 'category',
  //       as: 'categoryInfo', 
  //       targetKey: 'name', 
  //       onDelete: 'SET NULL',
  //   });

  //   HelpArticle.belongsTo(models.User, {
  //     foreignKey: 'reviewerId',
  //     as: 'reviewer',
  //     onDelete: 'SET NULL'
  //   });

  //   HelpArticle.hasMany(models.HelpFeedback, {
  //     foreignKey: 'articleId',
  //     as: 'feedbacks',
  //     onDelete: 'CASCADE'
  //   });
  // };

  return HelpArticle;
};