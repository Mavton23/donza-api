const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
  const Lesson = sequelize.define('Lesson', {
    lessonId: {
      type: DataTypes.UUID,
      defaultValue: () => uuidv4(),
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    externalResources: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: []
    },
    mediaUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'URL unificada para vídeo, PDF ou áudio'
    },
    videoUrl: {
      type: DataTypes.STRING,
    },
    pdfUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },
    audioUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },
    duration: {
      type: DataTypes.INTEGER,
    },
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    lessonType: {
      type: DataTypes.ENUM('video', 'text', 'quiz', 'assignment'),
      defaultValue: 'video',
    },
    isFree: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isPublished: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    creatorId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'userId'
      }
    },
  }, {
    timestamps: true,
    tableName: 'lessons',
  });

  Lesson.associate = (models) => {
    Lesson.belongsTo(models.Module, {
        as: 'module',
        foreignKey: 'moduleId',
    });

    Lesson.belongsTo(models.User, {
      as: 'creator',
      foreignKey: 'creatorId',
    });
  }

  return Lesson;
};