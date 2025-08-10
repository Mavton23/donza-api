const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const PostObjectives = sequelize.define('PostObjectives', {
      relevance: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        validate: {
          min: 1,
          max: 5
        }
      }
    }, {
      tableName: 'post_objectives',
      timestamps: false
    });
  
    return PostObjectives;
  };