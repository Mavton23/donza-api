const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const Notification = sequelize.define('Notification', {
      notificationId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM(
          'DONZA_NOTIFICATION',
          'USER_REVIEW_REQUIRED',
          'USER_APPROVED',
          'USER_REJECTED',
          'EVENT_REMINDER',
          'EVENT_CREATED',
          'EVENT_UPDATED',
          'EVENT_DELETED',
          'EVENT_REGISTRATION',
          'EVENT_REGISTRATION_CANCELLED',
          'TASK_DEADLINE',
          'NEW_MESSAGE',
          'COURSE_UPDATE',
          'REVIEW_REPLY',
          'NEW_MEMBER',
          'ROLE_CHANGED',
          'MEETING_SCHEDULED',
          'TASK_ASSIGNED',
          'NEW_FOLLOWER',
          'FOLLOWING_UPDATE',
          'UNFOLLOWED',
          'COURSE_CREATED',
          'COURSE_DELETED',
          'COURSE_PUBLISHED',
          'COURSE_ENROLLMENT',
          'COURSE_UNENROLLMENT',
          'COURSE_COMPLETION',
          'COURSE_APPROVAL',
          'COURSE_REJECTION',
          'COURSE_MATERIAL_UPDATE',
          'COURSE_DEADLINE_REMINDER',
          'COURSE_NEW_ANNOUNCEMENT',
          'MODULE_UPDATED',
          'COMMUNITY_CREATED',
          'MEMBER_REQUEST',
          'NEW_COMMUNITY_MEMBER',
          'NEW_COMMUNITY_POST',
          'POST_REACTION',
          'NEW_COMMENT',
          'COMMENT_REPLY',
          'POST_DELETED',
          'COMMENT_DELETED',
          'NEW_DIRECT_MESSAGE',
          'CONVERSATION_READ',
          'NEW_CONVERSATION',
          'NEW_TICKET',
          'STUDY_GROUP_NEW_MESSAGE',
          'STUDY_GROUP_TOPIC_CHANGED',
          'STUDY_GROUP_MESSAGE_EDITED',
          'STUDY_GROUP_MESSAGE_DELETED',
          'STUDY_GROUP_MESSAGE_OFF_TOPIC',
          'STUDY_GROUP_CONTENT_UPLOADED',
          'STUDY_GROUP_LINK_ADDED',
          'STUDY_GROUP_CONTENT_UPDATED',
          'STUDY_GROUP_CONTENT_DELETED',
          'DISCUSSION_TOPIC_CREATED',
          'DISCUSSION_TOPIC_UPDATED',
          'DISCUSSION_REPLY_ADDED',
          'DISCUSSION_REPLY_UPDATED',
          'DISCUSSION_REPLY_VOTED',
          'STUDY_GROUP_TASK_CREATED',
          'STUDY_GROUP_TASK_UPDATED',
          'STUDY_GROUP_TASK_DELETED',
          'STUDY_GROUP_TASK_ASSIGNED',
          'STUDY_GROUP_TASK_STATUS_CHANGED',
          'COMMUNITY_UPDATED',
          'MEMBER_LEFT_COMMUNITY',
          'STUDY_GROUP_INVITE',
          'STUDY_GROUP_JOIN_REQUEST',
          'STUDY_GROUP_REQUEST_APPROVED',
          'STUDY_GROUP_REQUEST_REJECTED',
          'STUDY_GROUP_ROLE_CHANGE',
          'STUDY_GROUP_REMOVED',
          'STUDY_GROUP_UPDATED',
          'STUDY_GROUP_DELETED',
          'STUDY_GROUP_MEETING_SCHEDULED'
        ),
        allowNull: false
      },
      title: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      relatedEntityId: {
        type: DataTypes.UUID,
        allowNull: true
      },
      isRead: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      emailSent: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      metadata: {
        type: DataTypes.JSONB
      },
      scheduledAt: {
        type: DataTypes.DATE,
        allowNull: true
      }
    }, {
      tableName: 'notifications',
      timestamps: true,
      indexes: [
        {
          fields: ['userId', 'isRead']
        },
        {
          fields: ['scheduledAt']
        }
      ]
    });
  
    // Notification.associate = (models) => {
    //   Notification.belongsTo(models.User, {
    //     foreignKey: 'userId',
    //     as: 'user'
    //   });
    //   Notification.belongsTo(models.Course, {
    //     foreignKey: 'relatedEntityId',
    //     constraints: false,
    //     as: 'course'
    //   });

    //   Notification.belongsTo(models.Event, {
    //     foreignKey: 'relatedEntityId',
    //     constraints: false,
    //     as: 'event'
    //   });
    // };
  
    return Notification;
  };