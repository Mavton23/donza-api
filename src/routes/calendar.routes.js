const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendar.controller');
const authenticate = require('../middleware/authenticate');

router.use(authenticate);

// Autenticação OAuth2
router.get('/google/auth', calendarController.startGoogleAuth);
router.get('/google/callback', calendarController.handleGoogleCallback);

// Sincronização
router.post('/groups/:groupId/sync', 
  calendarController.syncGroupEvents
);

module.exports = router;