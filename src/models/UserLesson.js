const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const UserLesson = sequelize.define('UserLesson', {
        userLessonId: {
            type: DataTypes.UUID,
            defaultValue: () => uuidv4(),
            primaryKey: true,
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        lessonId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        completed: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        completedAt: {
            type: DataTypes.DATE
        }
    }, {
        timestamps: true,
        tableName: 'user_lessons',
        indexes: [
            {
                fields: ['userId', 'lessonId'],
                unique: true
            }
        ]
    });

    UserLesson.associate = (models) => {
        UserLesson.belongsTo(models.User, {
            foreignKey: 'userId'
        });
        UserLesson.belongsTo(models.Lesson, {
            foreignKey: 'lessonId'
        });
    };

    return UserLesson;
};