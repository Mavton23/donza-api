const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const UserRelationship = sequelize.define('UserRelationship', {
    relationId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    relatedUserId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    relationshipType: {
      type: DataTypes.ENUM('follow', 'blocked'),
      allowNull: false,
      defaultValue: 'follow',
    },
    status: {
      type: DataTypes.ENUM('accepted', 'blocked'),
      allowNull: false,
      defaultValue: 'accepted',
    },
  }, {
    timestamps: true,
    tableName: 'user_relationships',
    indexes: [
      {
        unique: true,
        fields: ['userId', 'relatedUserId']
      },
      {
        fields: ['relationshipType', 'status']
      }
    ]
  });

  // UserRelationship.associate = (models) => {
  //   UserRelationship.belongsTo(models.User, {
  //     foreignKey: 'userId',
  //     as: 'initiator',
  //   });

  //   UserRelationship.belongsTo(models.User, {
  //     foreignKey: 'relatedUserId',
  //     as: 'target',
  //   });
  // };

  return UserRelationship;
};
