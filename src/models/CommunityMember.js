const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const CommunityMember = sequelize.define('CommunityMember', {
      memberId: {
        type: DataTypes.UUID,
        defaultValue:() => uuidv4(),
        primaryKey: true
      },
      role: {
        type: DataTypes.ENUM('member', 'moderator', 'admin'),
        defaultValue: 'member'
      },
      joinedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },
      status: {
        type: DataTypes.ENUM('active', 'muted', 'banned'),
        defaultValue: 'active'
      }
    }, {
      tableName: 'community_members',
      timestamps: false,
      // indexes: [
      //   {
      //     unique: true,
      //     fields: ['communityId', 'userId']
      //   },
      //   {
      //     fields: ['role']
      //   }
      // ]
    });
  
    CommunityMember.associate = (models) => {
      CommunityMember.belongsTo(models.Community, {
        foreignKey: 'communityId'
      });
      CommunityMember.belongsTo(models.User, {
        foreignKey: 'userId'
      });
      CommunityMember.belongsToMany(models.CommunityRole, {
        through: models.CommunityMemberRole,
        as: 'roles'
      });
    };
  
    return CommunityMember;
  };