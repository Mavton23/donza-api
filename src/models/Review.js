const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const Review = sequelize.define('Review', {
    reviewId: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    entityType: {
      type: DataTypes.ENUM('course', 'event', 'instructor'),
      allowNull: false,
    },
    entityId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    rating: {
      type: DataTypes.INTEGER,
      validate: {
        min: 1,
        max: 5,
      },
      allowNull: false,
    },
    comment: {
      type: DataTypes.TEXT,
    },
    instructorReply: {
      type: DataTypes.TEXT,
    },
    replyDate: {
      type: DataTypes.DATE,
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  }, {
    timestamps: true,
    tableName: 'reviews',
    indexes: [
      {
        fields: ['entityType', 'entityId'],
      },
      {
        fields: ['userId'],
      },
    ],
  });

  Review.associate = (models) => {
    Review.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    });
    
    Review.belongsTo(models.Course, {
      foreignKey: 'entityId',
      as: 'course',
      constraints: false,
    });
    
    Review.belongsTo(models.Event, {
      foreignKey: 'entityId',
      constraints: false,
      scope: {
        entityType: 'event',
      },
    });
    
    Review.belongsTo(models.User, {
      foreignKey: 'entityId',
      as: 'instructor',
      constraints: false,
      scope: {
        entityType: 'instructor',
      },
    });
  };

  return Review;
};