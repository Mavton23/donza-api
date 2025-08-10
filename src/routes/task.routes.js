const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');
const authenticate = require('../middleware/authenticate')
const authorize = require('../middleware/authorize');

router.use(authenticate);

// Tarefas
router.post('/groups/:groupId/tasks', 
  authorize(['instructor','leader', 'co-leader']),
  taskController.createTask
);
router.get('/groups/:groupId/tasks', taskController.listTasks);

router.get('/:groupId/tasks/:taskId', taskController.getTaskDetails);

router.patch('/tasks/:taskId', 
  authorize(['instructor', 'leader', 'co-leader']),
  taskController.updateTask
);

router.delete('/tasks/:taskId',
  authorize(['instructor', 'leader', 'co-leader']),
  taskController.deleteTask
);

// Atribuição de tarefas
router.post('/tasks/:taskId/assign', 
  authorize(['instructor','leader', 'co-leader']),
  taskController.assignTask
);
router.patch('/assignments/:assignmentId', 
  taskController.updateAssignmentStatus
);

module.exports = router;