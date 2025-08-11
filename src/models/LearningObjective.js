const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const LearningObjective = sequelize.define('LearningObjective', {
      objectiveId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      level: {
        type: DataTypes.ENUM('basic', 'intermediate', 'advanced'),
        defaultValue: 'basic'
      },
      subjectArea: {
        type: DataTypes.STRING(50),
        allowNull: false
      }
    }, {
      tableName: 'learning_objectives',
      timestamps: true,
      // indexes: [
      //   {
      //     fields: ['subjectArea']
      //   },
      //   {
      //     fields: ['level']
      //   },
      //   {
      //     type: 'FULLTEXT',
      //     fields: ['name', 'description']
      //   }
      // ]
    });
  
    LearningObjective.associate = (models) => {
      LearningObjective.belongsToMany(models.CommunityPost, {
        through: 'PostObjectives',
        as: 'posts'
      });
    };
  
    return LearningObjective;
  };