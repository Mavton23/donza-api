const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const ModerationPermissions = sequelize.define('ModerationPermissions', {
        permissionId: {
            type: DataTypes.UUID,
            defaultValue: () => uuidv4(),
            primaryKey: true
        },
        role: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        permissions: {
            type: DataTypes.JSONB,
            allowNull: false
        }
        }, {
            tableName: 'moderation_permissions'
        });
    
    return ModerationPermissions;
}