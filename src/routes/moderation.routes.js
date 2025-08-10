const express = require('express');
const router = express.Router();
const moderationController = require('../controllers/moderation.controller');
const authenticate = require('../middleware/authenticate');
const advancedAuthorize = require('../middleware/advancedAuthorize');

router.use(authenticate);

// Sistema hierárquico de moderação
router.post('/groups/:groupId/members/:userId/warn', 
  advancedAuthorize('warn', 'members'),
  moderationController.warnMember
);

router.post('/groups/:groupId/members/:userId/mute', 
  advancedAuthorize('mute', 'members'),
  moderationController.muteMember
);

router.post('/groups/:groupId/members/:userId/ban', 
  advancedAuthorize('ban', 'members'),
  moderationController.banMember
);

router.post('/groups/:groupId/content/:contentId/scan', 
  advancedAuthorize('scan', 'content'),
  moderationController.scanContent
);

router.post('/appeals/:actionId', 
  advancedAuthorize('review_appeals', 'system'),
  moderationController.handleAppeal
);

// Painel de moderação
router.get('/groups/:groupId/moderation-dashboard', 
  advancedAuthorize('view_dashboard', 'system'),
  moderationController.getModerationDashboard
);

// // Exportar registros
// router.get('/groups/:groupId/moderation-logs/export', 
//   advancedAuthorize('export_logs', 'system'),
//   moderationController.exportModerationLogs
// );

module.exports = router;