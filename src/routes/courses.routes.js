const express = require('express');
const router = express.Router();
const courseController = require('../controllers/course.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { checkUserStatus } = require('../middleware/checkUserStatus');
const { singleImage, handleUploadErrors } = require('../middleware/upload');
const { ROLES } = require('../constants/constants');

// Rotas abertas
router.get('/', courseController.getAllPublicCourses);
router.get('/courses/featured', courseController.getFeaturedCourses);
router.get('/courses/:userId/enrolled', courseController.getCourseEnrolled);
router.get('/:slug', courseController.getCourseBySlug);

// Rotas autenticadas
router.get('/courses/:userId/counts', 
  authenticate, 
  authorize([ROLES.INSTRUCTOR, ROLES.INSTITUTION, ROLES.ADMIN]),
  courseController.getCourseCounts);

router.get('/course/:courseId', 
  authenticate,
  authorize([ROLES.STUDENT, ROLES.INSTRUCTOR, ROLES.INSTITUTION, ROLES.ADMIN]),
  courseController.getCourseById
);

router.get('/:courseId/completion-stats',
  authenticate,
  authorize([ROLES.STUDENT, ROLES.INSTRUCTOR, ROLES.ADMIN]),
  courseController.getCourseCompletionStats
);

router.get('/courses/:userId', 
  authenticate, 
  authorize([ROLES.INSTRUCTOR, ROLES.INSTITUTION, ROLES.ADMIN]),
  courseController.getAllCourses);

router.post('/create', 
  authenticate, 
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]), 
  checkUserStatus(),
  singleImage,
  handleUploadErrors, 
  courseController.createCourse
);

router.put('/:courseId', 
  authenticate, 
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]), 
  singleImage,
  handleUploadErrors, 
  courseController.updateCourse
);

router.delete('/:courseId', 
  authenticate, 
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]), 
  courseController.deleteCourse
);

// Matrícula em cursos
router.get('/users/:userId/enrollments', 
  authenticate,
  authorize([ROLES.STUDENT]),
  courseController.getCourseEnrolled
);

router.get('/:courseId/enroll/:userId', 
  authenticate, 
  authorize([ROLES.STUDENT, ROLES.INSTRUCTOR, ROLES.INSTITUTION]), 
  courseController.checkEnroll
);

router.post('/:courseId/enroll', 
  authenticate, 
  authorize([ROLES.STUDENT]), 
  courseController.enrollInCourse
);

router.delete('/:userId/enrollments/:courseId', 
  authenticate,
  authorize([ROLES.STUDENT]),
  courseController.removeEnrollment
);

router.get('/:slug/progress', 
  authenticate, 
  courseController.getCourseProgress
);

module.exports = router;