const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { ROLES } = require('../constants/constants');

// Métricas gerais (apenas admin)
router.get('/admin/metrics',
  authenticate,
  authorize([ROLES.ADMIN]),
  dashboardController.getAdminMetrics
);

// Métricas por curso (instrutores e admin)
router.get('/courses/:courseId/metrics',
  authenticate,
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
  dashboardController.getCourseMetrics
);

// Métricas do instrutor
router.get('/instructors/:instructorId/metrics',
  authenticate,
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
  dashboardController.getInstructorMetrics
);

router.get('/instructor/analytics',
  authenticate,
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
  dashboardController.getInstructorAnalytics
);

module.exports = router;