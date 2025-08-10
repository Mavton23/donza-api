const express = require('express');
const router = express.Router();
const searchController = require('../controllers/search.controller');
const authenticate = require('../middleware/authenticate');

router.use(authenticate);

router.get('/', searchController.search);
router.get('/instructors', searchController.searchInstructors);
router.get('/messageable-users', searchController.searchMessageableUsers);
router.get('/enrolled-courses', searchController.searchEnrolledCourses);

module.exports = router;