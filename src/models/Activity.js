const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const Activity = sequelize.define('Activity', {
    activityId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    groupId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'study_groups',
        key: 'groupId'
      }
    },
    type: {
      type: DataTypes.ENUM(
        'course_started',
        'course_completed',
        'lesson_completed',
        'resource_viewed',
        'achievement_earned',
        'enrollment',
        'group_join',
        'group_leave',
        'group_role_change',
        'content_upload',
        'link_shared',
        'content_update',
        'content_delete',
        'content_download',
        'meeting_scheduled',
        'meeting_attended',
        'discussion_started',
        'task_created',
        'task_completed',
        'system_maintenance',
        'system_backup',
        'admin_user_created',
        'admin_user_updated',
        'admin_content_created',
        'admin_content_updated',
        'system_alert'
      ),
      allowNull: false
    },
    entityType: {
      type: DataTypes.ENUM(
        'course', 
        'lesson', 
        'resource', 
        'achievement', 
        'event',
        'study_group',
        'group_content',
        'group_meeting',
        'discussion_topic',
        'group_task'
      ),
      allowNull: false
    },
    entityId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    duration: {
      type: DataTypes.INTEGER, // em segundos
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'activities',
    timestamps: true,
    // indexes: [
    //   {
    //     fields: ['userId']
    //   },
    //   {
    //     fields: ['groupId']
    //   },
    //   {
    //     fields: ['createdAt']
    //   },
    //   {
    //     fields: ['type']
    //   }
    // ]
  });

  // Activity.associate = (models) => {
  //   Activity.belongsTo(models.User, {
  //     foreignKey: 'userId',
  //     as: 'user'
  //   });
    
  //   Activity.belongsTo(models.Course, {
  //     foreignKey: 'courseId',
  //     as: 'activityCourse'
  //   });
    
  //   Activity.belongsTo(models.Lesson, {
  //     foreignKey: 'entityId',
  //     as: 'lesson',
  //     constraints: false
  //   });
    
  //   Activity.belongsTo(models.Event, {
  //     foreignKey: 'entityId',
  //     as: 'event',
  //     constraints: false
  //   });
    
  //   Activity.belongsTo(models.StudyGroup, {
  //     foreignKey: 'groupId',
  //     as: 'group'
  //   });
    
  //   Activity.belongsTo(models.SharedContent, {
  //     foreignKey: 'entityId',
  //     as: 'content',
  //     constraints: false
  //   });
    
  //   Activity.belongsTo(models.GroupMeeting, {
  //     foreignKey: 'entityId',
  //     as: 'meeting',
  //     constraints: false
  //   });
    
  //   Activity.belongsTo(models.DiscussionTopic, {
  //     foreignKey: 'entityId',
  //     as: 'discussion',
  //     constraints: false
  //   });
    
  //   Activity.belongsTo(models.GroupTask, {
  //     foreignKey: 'entityId',
  //     as: 'task',
  //     constraints: false
  //   });
  // };

  return Activity;
};