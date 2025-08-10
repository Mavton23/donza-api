const express = require('express');
const router = express.Router();
const institutionController = require('../controllers/institution.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.use(authenticate);
router.use(authorize(['institution']));

// ==============================================
// Rotas Institucionais (Invites)
// ==============================================
router.post('/invites', institutionController.sendInstructorInvite);

router.post('/invites/respond', institutionController.respondToInvite);


// ==============================================
// Rotas Institucionais (Dashboard)
// ==============================================

// Dashboard Institucional
router.get('/:userId/stats',   
  institutionController.getInstitutionStats
);

router.get('/:userId/recent-enrollments',   
  institutionController.getRecentEnrollments
);

router.get('/:userId/instructors',   
  institutionController.getInstitutionInstructors
);

// Configurações da Instituição
router.get('/:userId/settings',   
  institutionController.getInstitutionData
);

// Analytics
router.get('/:userId/analytics',   
  institutionController.getInstitutionAnalytics
);

router.get('/:userId/top-courses',   
  institutionController.getTopCourses
);

// Rotas Complementares
router.get('/:userId/courses',   
  institutionController.getInstitutionCourses
);

router.get('/certificates',   
  institutionController.getInstitutionCertificates
);

router.post('/:userId/courses/new',   
  institutionController.createCourse
);

router.get('/:userId/members',   
  institutionController.getInstitutionMembers
);

router.get('/:userId/billing',   
  institutionController.getBillingInfo
);

module.exports = router;

