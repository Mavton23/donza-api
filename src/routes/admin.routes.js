const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const testimonialsController = require('../controllers/testimonials.controller');
const courseController = require('../controllers/course.controller');
const activityLogger = require('../middleware/activityLogger');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { ROLES } = require('../constants/constants');
const adminRegisterValidations = require('../validation/admin.validators');

router.use('/register', 
  adminRegisterValidations,
  adminController.registerAdmin
);

router.use(authenticate);

router.get('/stats',  
  authorize([ROLES.ADMIN]),
  adminController.getStats
);

router.get('/pending-verifications', 
  authorize([ROLES.ADMIN]),
  adminController.getPendingVerificationsCount
);

router.get('/verifications', 
  authorize([ROLES.ADMIN]),
  adminController.listVerifications
);

router.get('/verifications/:id', 
  authorize([ROLES.ADMIN]),
  adminController.getVerificationDetails
);

router.put('/verifications/:id', 
  authorize([ROLES.ADMIN]),
  adminController.processVerification
);

router.put('/documents/:docId/review', 
  authenticate, 
  authorize([ROLES.ADMIN]), 
  adminController.reviewDocument
);

router.get('/documents/:docId/download', 
  authenticate, 
  authorize([ROLES.ADMIN]), 
  adminController.downloadDocument
);

router.get('/stats/chart', 
  authorize([ROLES.ADMIN]),
  adminController.getChartStats
);

// Rotas de status do sistema
router.get('/system-status', 
  authorize([ROLES.ADMIN]),
  adminController.getSystemStatus
);

router.get('/system-metrics', 
  authorize([ROLES.ADMIN]),
  // activityLogger.logAdminAction('view', 'metrics'),
  adminController.getSystemMetrics
);

// Rotas de atividades
router.get('/activities', 
  authorize([ROLES.ADMIN]),
  // activityLogger.logAdminAction('view', 'activities'),
  adminController.getActivities
);

router.get('/activities/:activityId', 
  authorize([ROLES.ADMIN]),
  // activityLogger.logAdminAction('view', 'activity'),
  adminController.getActivityDetails
);

router.get(
    '/courses',
    authenticate,
    authorize(['admin']),
    courseController.getAllAdminCourses
);

router.get(
  '/testimonials',
  authorize(['admin']),
  testimonialsController.listAdminTestimonials
);

router.put(
  '/:testimonialId/moderate',
  authorize(['admin']),
  testimonialsController.moderateTestimonial
);

module.exports = router;