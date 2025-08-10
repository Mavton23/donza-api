const express = require('express');
const router = express.Router();
const discussionController = require('../controllers/discussion.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.use(authenticate);

// Tópicos
router.post('/groups/:groupId/topics', 
  discussionController.createTopic
);
router.get('/groups/:groupId/topics', 
  discussionController.listTopics
);
router.patch('/topics/:topicId', 
  authorize(['leader', 'co-leader']),
  discussionController.updateTopic
);

// Respostas
router.post('/topics/:topicId/replies', 
  discussionController.createReply
);
router.patch('/replies/:replyId', 
  discussionController.updateReply
);
router.post('/replies/:replyId/vote', 
  discussionController.voteReply
);

module.exports = router;