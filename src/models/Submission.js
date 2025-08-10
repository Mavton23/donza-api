const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const Submission = sequelize.define('Submission', {
      submissionId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
      },
      assignmentId: {
        type: DataTypes.UUID,
        allowNull: false
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      attachmentUrl: {
        type: DataTypes.STRING,
        allowNull: true
      },
      grade: {
        type: DataTypes.FLOAT,
        allowNull: true
      },
      feedback: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      submittedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },
      status: {
        type: DataTypes.ENUM('draft', 'submitted', 'graded', 'late'),
        defaultValue: 'draft'
      },
      isLate: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      gradePercentage: { // Nota em percentual (0-100)
        type: DataTypes.FLOAT,
        computed() {
          return this.grade ? (this.grade / this.assignment.maxScore) * 100 : null;
        }
      }
    }, {
      tableName: 'submissions',
      timestamps: true
    });
  
    Submission.associate = (models) => {
      Submission.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'student'
      });
      Submission.belongsTo(models.Assignment, {
        foreignKey: 'assignmentId',
        as: 'assignment'
      });
    };
  
    return Submission;
  };