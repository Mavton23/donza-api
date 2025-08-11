const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const StudyGroupMember = sequelize.define('StudyGroupMember', {
        membershipId: {
            type: DataTypes.UUID,
            defaultValue: () => uuidv4(),
            primaryKey: true
        },
        role: {
            type: DataTypes.ENUM('member', 'leader', 'co-leader', 'moderator'),
            defaultValue: 'member'
        },
        joinedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        contributionScore: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        lastActiveAt: {
            type: DataTypes.DATE
        },
        achievements: {
            type: DataTypes.ARRAY(DataTypes.STRING)
        },
        status: {
            type: DataTypes.ENUM('active', 'muted', 'banned', 'left'),
            defaultValue: 'active'
        },
        mutedUntil: {
            type: DataTypes.DATE
        },
        joinMethod: {
            type: DataTypes.ENUM('direct', 'invite', 'approval', 'promoted'),
            defaultValue: 'direct'
        },
        inviteCodeUsed: {
            type: DataTypes.STRING
        },
        preventiveModeration: {
            type: DataTypes.JSONB,
                defaultValue: {
                    contentFilter: {
                    enabled: true,
                    level: 'medium'
                },
                    rateLimiting: {
                    postsPerHour: 10,
                    commentsPerHour: 20
                },
                    newMemberRestrictions: {
                    contentCreation: false,
                    duration: '24h'
                }
            }
        }
    }, {
        tableName: 'study_group_members',
        timestamps: false,
        indexes: [
            {
                unique: true,
                fields: ['groupId', 'userId']
            },
            {
                fields: ['role']
            },
            {
                fields: ['status']
            }
        ]
    });

    // StudyGroupMember.associate = (models) => {
    //     StudyGroupMember.belongsTo(models.StudyGroup, {
    //         foreignKey: 'groupId'
    //     });
    //     StudyGroupMember.belongsTo(models.User, {
    //         foreignKey: 'userId',
    //         as: 'user'
    //     });
    // };

    return StudyGroupMember;
};