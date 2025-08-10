const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const CommunityRole = sequelize.define('CommunityRole', {
      roleId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      permissions: {
        type: DataTypes.JSON,
        defaultValue: {
          managePosts: false,
          manageEvents: false,
          inviteMembers: false,
          removeMembers: false,
          editCommunity: false
        }
      },
      isDefault: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      }
    }, {
      tableName: 'community_roles',
      timestamps: true
    });
  
    CommunityRole.associate = (models) => {
      CommunityRole.belongsTo(models.Community, {
        foreignKey: 'communityId',
        as: 'community'
      });
      CommunityRole.belongsToMany(models.User, {
        through: models.CommunityMemberRole,
        as: 'members'
      });
    };
  
    return CommunityRole;
  };