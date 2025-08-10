const express = require('express');
const router = express.Router();
const assignmentController = require('../controllers/assignment.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { checkUserStatus } = require('../middleware/checkUserStatus');
const { singleImage, handleUploadErrors } = require('../middleware/upload');
const { ROLES } = require('../constants/constants');

router.use(authenticate);

router.get('/courses/assignments',
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
  assignmentController.getCourseAssignmentsForInstructor
);

router.post('/courses/:courseId/assignments',
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
  checkUserStatus(),
  singleImage,
  handleUploadErrors,
  assignmentController.createAssignment
);

router.put('/assignments/:assignmentId',
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
  singleImage,
  handleUploadErrors,
  assignmentController.updateAssignment
);

router.delete('/assignments/:assignmentId',
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
  assignmentController.deleteAssignment
);

router.get('/courses/:courseId/assignments',
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
  assignmentController.getCourseAssignments
);

router.get('/assignments/:assignmentId/submissions',
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
  assignmentController.getAssignmentSubmissions
);

router.put('/submissions/:submissionId/grade',
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
  assignmentController.gradeSubmission
);

// Rotas para estudantes
router.get('/courses/:courseId/my-assignments',
  authorize([ROLES.STUDENT]),
  assignmentController.getStudentAssignments
);

router.post('/assignments/:assignmentId/submit',
  authorize([ROLES.STUDENT]),
  singleImage,
  handleUploadErrors,
  assignmentController.submitAssignment
);

router.get('/submissions/:submissionId',
  assignmentController.getSubmissionDetails
);

module.exports = router;