const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const Enrollment = sequelize.define('Enrollment', {
    enrollmentId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    courseId: {
      type: DataTypes.UUID(),
      allowNull: false,
    },
    progress: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100,
      },
    },
    enrolledAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    lastAccessed: {
      type: DataTypes.DATE,
    },
    favorite: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    notes: {
      type: DataTypes.TEXT,
    },
    completedAt: {
      type: DataTypes.DATE,
    },
    status: {
      type: DataTypes.ENUM('active', 'completed', 'canceled'),
      defaultValue: 'active',
    },
    rating: {
      type: DataTypes.INTEGER,
      validate: {
        min: 1,
        max: 5,
      },
    },
    review: {
      type: DataTypes.TEXT,
    },
  }, {
    timestamps: true,
    tableName: 'enrollments',
  });

  // Enrollment.associate = (models) => {
  //   Enrollment.belongsTo(models.Course, {
  //     foreignKey: 'courseId',
  //     as: 'course'
  //   });

  //   Enrollment.belongsTo(models.User, {
  //     foreignKey: 'userId',
  //     as: 'user'
  //   });
  // };

  return Enrollment;
};