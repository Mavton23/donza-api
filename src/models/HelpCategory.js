const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const HelpCategory = sequelize.define('HelpCategory', {
    id: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    icon: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    displayOrder: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  }, {
    tableName: 'help_categories',
    timestamps: true,
    // indexes: [
    //   {
    //     name: 'help_categories_name_index',
    //     fields: ['name'],
    //   },
    //   {
    //     name: 'help_categories_order_index',
    //     fields: ['displayOrder'],
    //   },
    // ],
  });

  // HelpCategory.associate = (models) => {
  //   HelpCategory.hasMany(models.HelpArticle, {
  //     foreignKey: 'category',
  //     sourceKey: 'name',
  //     as: 'articles',
  //   });
  // };

  return HelpCategory;
};