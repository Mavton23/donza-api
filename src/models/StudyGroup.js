const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const StudyGroup = sequelize.define('StudyGroup', {
        groupId: {
            type: DataTypes.UUID,
            defaultValue: () => uuidv4(),
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT
        },
        meetingSchedule: {
            type: DataTypes.JSON
        },
        maxMembers: {
            type: DataTypes.INTEGER
        },
        status: {
            type: DataTypes.ENUM('active', 'paused', 'completed', 'archived'),
            defaultValue: 'active'
        },
        privacy: {
            type: DataTypes.ENUM('public', 'private', 'invite_only'),
            defaultValue: 'public'
        },
        tags: {
            type: DataTypes.ARRAY(DataTypes.STRING),
            defaultValue: []
        },
        goals: {
            type: DataTypes.TEXT
        },
        inviteCode: {
            type: DataTypes.STRING,
            unique: true
        },
        approvalRequired: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        coverImageUrl: {
            type: DataTypes.STRING
        }
    }, {
        tableName: 'study_groups',
        timestamps: true,
        hooks: {
            beforeCreate: (group) => {
                if (group.privacy === 'private' || group.privacy === 'invite_only') {
                    group.inviteCode = require('crypto').randomBytes(8).toString('hex');
                    group.approvalRequired = true;
                }
            }
        }
    });

    StudyGroup.associate = (models) => {
        StudyGroup.belongsTo(models.Community, {
            foreignKey: 'communityId'
        });
        StudyGroup.belongsTo(models.User, {
            foreignKey: 'creatorId',
            as: 'creator'
        });
        StudyGroup.belongsToMany(models.User, {
            through: models.StudyGroupMember,
            as: 'members'
        });
        StudyGroup.hasMany(models.StudyGroupPendingMember, {
            foreignKey: 'groupId',
            as: 'pendingMemberRequests'
        });
        StudyGroup.hasMany(models.GroupMeeting, {
            foreignKey: 'groupId',
            as: 'meetings'
        });
        StudyGroup.hasMany(models.DiscussionTopic, {
            foreignKey: 'groupId',
            as: 'discussionTopics'
        });
        StudyGroup.hasMany(models.SharedContent, {
            foreignKey: 'groupId',
            as: 'sharedContents'
        });
        StudyGroup.hasMany(models.GroupTask, {
            foreignKey: 'groupId',
            as: 'tasks'
        });
        StudyGroup.hasOne(models.GroupChat, {
            foreignKey: 'groupId',
            as: 'chat'
        });
    };

    return StudyGroup;
};