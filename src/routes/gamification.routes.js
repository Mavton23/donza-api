const express = require('express');
const router = express.Router();
const gamificationController = require('../controllers/gamification.controller');
const authenticate = require('../middleware/authenticate');

router.use(authenticate);

router.get('/groups/:groupId/leaderboard', 
  gamificationController.getLeaderboard
);
// router.get('/members/:membershipId/achievements', 
//   gamificationController.getAchievements
// );

module.exports = router;