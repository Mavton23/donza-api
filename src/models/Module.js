const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const Module = sequelize.define('Module', {
    moduleId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
    },
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    isPublished: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    courseId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'courses',
        key: 'courseId'
      }
    },
    creatorId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'userId'
      }
    }
  }, {
    timestamps: true,
    tableName: 'modules',
  });

  // Module.associate = (models) => {
  //   Module.belongsTo(models.Course, {
  //     as: 'course',
  //     foreignKey: 'courseId',
  //   });

  //   Module.hasMany(models.Lesson, {
  //     as: 'lessons',
  //     foreignKey: 'moduleId',
  //     onDelete: 'CASCADE',
  //   });

  //   Module.belongsTo(models.User, {
  //     as: 'creator',
  //     foreignKey: 'creatorId',
  //   });
  // };

  return Module;
};