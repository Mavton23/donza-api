const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const StudyGroupPendingMember = sequelize.define('StudyGroupPendingMember', {
        requestId: {
            type: DataTypes.UUID,
            defaultValue: () => uuidv4(),
            primaryKey: true
        },
        status: {
            type: DataTypes.ENUM('pending', 'approved', 'rejected'),
            defaultValue: 'pending'
        },
        groupId: { 
            type: DataTypes.UUID,
            allowNull: false
        },
        userId: { 
            type: DataTypes.UUID,
            allowNull: false
        },
        requestedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        reviewedAt: {
            type: DataTypes.DATE
        },
        reviewedBy: {
            type: DataTypes.UUID
        },
        message: {
            type: DataTypes.TEXT
        },
        responseMessage: {
            type: DataTypes.TEXT
        }
    }, {
        tableName: 'study_group_pending_members',
        timestamps: false,
        indexes: [
            {
                unique: true,
                fields: ['groupId', 'userId']
            },
            {
                fields: ['status']
            }
        ]
    });

    // StudyGroupPendingMember.associate = (models) => {
    //     StudyGroupPendingMember.belongsTo(models.StudyGroup, {
    //         foreignKey: 'groupId',
    //         as: 'studyGroup'
    //     });
    //     StudyGroupPendingMember.belongsTo(models.User, {
    //         foreignKey: 'userId',
    //         as: 'user'
    //     });
    //     StudyGroupPendingMember.belongsTo(models.User, {
    //         foreignKey: 'reviewedBy',
    //         as: 'reviewer'
    //     });
    // };

    return StudyGroupPendingMember;
};