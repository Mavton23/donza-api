const express = require('express');
const router = express.Router();
const messageController = require('../controllers/message.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// Rotas de conversas
router.post('/conversations', 
  authenticate,
  messageController.getOrCreateConversation
);

router.patch('/:conversationId/read', 
  authenticate, 
  messageController.markAsRead
);

router.get('/messages/today-count', 
  authenticate, 
  messageController.getTodayMessageCount
);

router.get('/conversations', 
  authenticate,
  messageController.getUserConversations
);

router.get('/has-unread',
  authenticate,
  messageController.hasUnreadMessages
);

router.post('/conversations/:conversationId/messages', 
  authenticate,
  messageController.verifyConversationAccess, 
  messageController.sendMessage
);
router.get('/conversations/:conversationId/messages', 
  authenticate,
  messageController.verifyConversationAccess, 
  messageController.getMessages
);

module.exports = router;