const express = require('express');
const router = express.Router();
const moduleController = require('../controllers/module.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { ROLES } = require('../constants/constants');

router.get('/list', 
  authenticate,
  authorize(['instructor', 'admin']), 
  moduleController.listModules);

router.post('/:courseId/modules',
  authenticate,
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
  moduleController.createModule
);

router.put('/:courseId/modules/:moduleId',
  authenticate,
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
  moduleController.updateModule
);

router.delete('/:courseId/modules/:moduleId',
  authenticate,
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
  moduleController.deleteModule
);

router.get('/:courseId/modules',
  authenticate,
  moduleController.getCourseModules
);

router.get('/:courseId/modules/:moduleId',
  authenticate,
  moduleController.getModuleDetails
);

module.exports = router;