const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const CommunityInvite = sequelize.define('CommunityInvite', {
      inviteId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isEmail: true
        }
      },
      status: {
        type: DataTypes.ENUM('pending', 'accepted', 'expired', 'revoked'),
        defaultValue: 'pending'
      },
      token: {
        type: DataTypes.STRING(64),
        unique: true
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    }, {
      tableName: 'community_invites',
      timestamps: true,
      // indexes: [
      //   {
      //     fields: ['communityId', 'email'],
      //     unique: true
      //   }
      // ]
    });
  
    CommunityInvite.associate = (models) => {
      CommunityInvite.belongsTo(models.Community, {
        foreignKey: 'communityId',
        as: 'community'
      });
      CommunityInvite.belongsTo(models.User, {
        foreignKey: 'inviterId',
        as: 'inviter'
      });
      CommunityInvite.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user',
        allowNull: true
      });
    };
  
    return CommunityInvite;
  };