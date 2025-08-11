const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const Assignment = sequelize.define('Assignment', {
      assignmentId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      dueDate: {
        type: DataTypes.DATE,
        allowNull: true
      },
      maxScore: {
        type: DataTypes.INTEGER,
        defaultValue: 100
      },
      isPublished: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      courseId: {
        type: DataTypes.UUID,
        allowNull: false
      },
      moduleId: {
        type: DataTypes.UUID,
        allowNull: true
      },
      lessonId: {
        type: DataTypes.UUID,
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('draft', 'published', 'closed'),
        defaultValue: 'draft'
      },
      allowLateSubmissions: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      latePenalty: {
        type: DataTypes.FLOAT,
        defaultValue: 0
      },
      submissionFormat: {
        type: DataTypes.ENUM('text', 'file', 'both'),
        defaultValue: 'both'
      },
      allowedFileTypes: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: ['pdf', 'docx', 'zip']
      }
    }, {
      tableName: 'assignments',
      timestamps: true
    });
  
    Assignment.associate = (models) => {
      Assignment.belongsTo(models.Course, {
        foreignKey: 'courseId',
        as: 'course'
      });
      Assignment.belongsTo(models.Module, {
        foreignKey: 'moduleId',
        as: 'module'
      });
      Assignment.belongsTo(models.Lesson, {
        foreignKey: 'lessonId',
        as: 'lesson'
      });
      Assignment.hasMany(models.Submission, {
        foreignKey: 'assignmentId',
        as: 'submissions'
      });
    };
  
    return Assignment;
  };