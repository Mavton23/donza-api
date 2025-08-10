const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.use(authenticate);

router.get('/groups/:groupId/reports/weekly', 
  authorize(['leader', 'co-leader']),
  reportController.getWeeklyReport
);

router.get('/groups/:groupId/reports/tasks', 
  authorize(['leader', 'co-leader']),
  reportController.getTaskReport
);

module.exports = router;