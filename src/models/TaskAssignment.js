const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize) => {
    const TaskAssignment = sequelize.define('TaskAssignment', {
        assignmentId: {
        type: DataTypes.UUID,
        defaultValue: () => uuidv4(),
        primaryKey: true
        },
        status: {
        type: DataTypes.ENUM('pending', 'completed', 'rejected'),
        defaultValue: 'pending'
        }
    }, 
    { timestamps: true });

    // TaskAssignment.associate = (models) => {
    //     TaskAssignment.belongsTo(models.GroupTask, {
    //         foreignKey: 'taskId',
    //         as: 'task'
    //     });
  
    //     TaskAssignment.belongsTo(models.User, {
    //         foreignKey: 'userId',
    //         as: 'user'
    //     });
        
    //     TaskAssignment.belongsTo(models.User, {
    //         foreignKey: 'assignedBy',
    //         as: 'assigner'
    //     });
    // };

    return TaskAssignment;
}