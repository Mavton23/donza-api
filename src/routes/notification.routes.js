const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { ROLES } = require('../constants/constants');

// Rotas do usuário autenticado
router.get('/notifications',
  authenticate,
  notificationController.getUserNotifications
);

router.get('/has-unread',
  authenticate,
  notificationController.hasUnreadNotifications
);

router.get('/notifications/preferences',
  authenticate,
  notificationController.getPreferences
);

router.patch('/notifications/:notificationId/read',
  authenticate,
  notificationController.verifyNotificationOwnership,
  notificationController.markAsRead
);

router.patch('/notifications/read-all',
  authenticate,
  notificationController.markAllAsRead
);

router.put('/notifications/preferences',
  authenticate,
  notificationController.updatePreferences
);

// Rotas administrativas
router.get('/admin/notifications/:userId',
  authenticate,
  authorize([ROLES.ADMIN]),
  notificationController.getUserNotificationsAdmin
);

router.post('/admin/notifications',
  authenticate,
  authorize([ROLES.ADMIN]),
  notificationController.createNotification
);

module.exports = router;