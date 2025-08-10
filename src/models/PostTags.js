const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const PostTags = sequelize.define('PostTags', {
      relevance: {
        type: DataTypes.FLOAT,
        defaultValue: 1.0
      }
    }, {
      tableName: 'post_tags',
      timestamps: false
    });
  
    return PostTags;
  };