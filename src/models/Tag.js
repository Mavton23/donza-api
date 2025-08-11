const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const Tag = sequelize.define('Tag', {
      tagId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      isSystemTag: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      }
    }, {
      tableName: 'tags',
      timestamps: true,
      indexes: [
        {
          fields: ['name'],
          unique: true
        },
        {
          fields: ['isSystemTag']
        }
      ]
    });
  
    Tag.associate = (models) => {
      Tag.belongsToMany(models.CommunityPost, {
        through: 'PostTags',
        as: 'posts'
      });
    };
  
    return Tag;
  };