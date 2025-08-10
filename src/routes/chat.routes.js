const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.use(authenticate);

// Tópicos de debate
router.get('/groups/:groupId/chat/topic', 
  chatController.getCurrentTopic
);

router.post('/groups/:groupId/chat/topic', 
  authorize(['leader', 'co-leader']),
  chatController.setTopic
);

router.get('/groups/:groupId/chat/topic/history', 
  chatController.getTopicHistory
);

// Mensagens
router.get('/groups/:groupId/chat/messages', 
  chatController.getMessages
);

router.post('/groups/:groupId/chat/messages', 
  chatController.sendMessage
);

router.delete('/messages/:messageId', 
  authorize(['leader', 'co-leader']),
  chatController.deleteMessage
);

router.put('/messages/:messageId', 
  authorize(['member']),
  chatController.editMessage
);

router.post('/messages/:messageId/read', 
  chatController.markAsRead
);

router.post('/messages/:messageId/off-topic', 
  authorize(['leader', 'co-leader']),
  chatController.markAsOffTopic
);

// Membros
router.get('/groups/:groupId/chat/members', 
  chatController.getActiveMembers
);

router.patch('/groups/:groupId/chat/members/me', 
  chatController.updateMemberStatus
);

module.exports = router;