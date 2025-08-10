const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const CommunityMemberRole = sequelize.define('CommunityMemberRole', {
      id: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      }
    }, {
      tableName: 'community_member_roles',
      timestamps: false
    });
  
    return CommunityMemberRole;
  };