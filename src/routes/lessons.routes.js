const express = require('express');
const router = express.Router();
const lessonController = require('../controllers/lesson.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { checkUserStatus } = require('../middleware/checkUserStatus');
const { genericLessonMaterials, lessonBatchMaterials, handleBatchUploads, handleUploadErrors } = require('../middleware/upload');
const { ROLES } = require('../constants/constants');

router.get('/lessons', 
  authenticate,
  authorize([ROLES.INSTRUCTOR, ROLES.INSTITUTION]),
  lessonController.getLessons
)

router.get('/:lessonId/completion-status',
  authenticate,
  authorize([ROLES.STUDENT]),
  lessonController.checkLessonCompletionStatus
);

router.get('/lesson/:lessonId',
  authenticate,
  authorize([ROLES.INSTRUCTOR, ROLES.INSTITUTION, ROLES.ADMIN]),
  lessonController.getLessonById
);

router.post('/:courseId/modules/:moduleId/lessons',
  authenticate,
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
  checkUserStatus(),
  genericLessonMaterials,
  handleUploadErrors,
  lessonController.createLesson
);

router.post('/lessons/batch',
  authenticate,
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
  checkUserStatus(),
  lessonBatchMaterials,
  handleBatchUploads,
  lessonController.createLessonsBatch
);

router.delete('/:courseId/modules/:moduleId/lessons/:lessonId',
  authenticate,
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN, ROLES.INSTITUTION]),
  lessonController.deleteLesson
);

router.put('/:courseId/modules/:moduleId/lessons/:lessonId/reorder',
  authenticate,
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN, ROLES.INSTITUTION]),
  lessonController.reorderLesson
);

router.put('/:courseId/modules/:moduleId/lessons/bulk-reorder',
  authenticate,
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN, ROLES.INSTITUTION]),
  lessonController.bulkReorderLessons
);

router.put('/:courseId/modules/:moduleId/lessons/:lessonId',
  authenticate,
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
  genericLessonMaterials,
  handleUploadErrors,
  lessonController.updateLesson
);

// router.delete('/:moduleId/lessons/:lessonId',
//   authenticate,
//   authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
//   lessonController.deleteLesson
// );

router.get('/:moduleId/lessons',
  authenticate,
  lessonController.getModuleLessons
);

router.get('/:moduleId/lessons/:lessonId',
  authenticate,
  lessonController.getLessonDetails
);

router.post('/:lessonId/complete',
  authenticate,
  authorize([ROLES.STUDENT]),
  lessonController.markLessonAsCompleted
);

module.exports = router;