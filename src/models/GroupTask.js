const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const GroupTask = sequelize.define('GroupTask', {
      taskId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT
      },
      deadline: {
        type: DataTypes.DATE
      },
      status: {
        type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'archived'),
        defaultValue: 'pending'
      },
      priority: {
        type: DataTypes.ENUM('low', 'medium', 'high'),
        defaultValue: 'medium'
      }
    }, {
      tableName: 'group_tasks',
      timestamps: true,
      indexes: [
        {
          fields: ['groupId']
        },
        {
          fields: ['status']
        },
        {
          fields: ['deadline']
        }
      ]
    });
  
    // GroupTask.associate = (models) => {
    //   GroupTask.belongsTo(models.StudyGroup, {
    //     foreignKey: 'groupId',
    //     as: 'group'
    //   });

    //   GroupTask.belongsTo(models.User, {
    //     foreignKey: 'creatorId',
    //     as: 'creator'
    //   });

    //   // Associação com o atribuidor (usuário)
    //   GroupTask.belongsTo(models.User, {
    //     foreignKey: 'assignerId',
    //     as: 'assigner'
    //   });

    //   // Associação muitos-para-muitos com User através de TaskAssignment
    //   GroupTask.belongsToMany(models.User, {
    //     through: models.TaskAssignment,
    //     foreignKey: 'taskId',
    //     otherKey: 'userId',
    //     as: 'assignees'
    //   });

    //   // Associação um-para-muitos com TaskAssignment
    //   GroupTask.hasMany(models.TaskAssignment, {
    //     foreignKey: 'taskId',
    //     as: 'assignments'
    //   });
    // };
  
    return GroupTask;
  };