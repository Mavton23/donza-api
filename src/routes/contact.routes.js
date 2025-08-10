const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contact.controller');
const { validateContactRequest } = require('../validation/contact.validators');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { ROLES } = require('../constants/constants');

// Rotas públicas
router.post(
  '/',
  validateContactRequest,
  contactController.createContactRequest
);

// Rotas autenticadas
router.use(authenticate);

router.get(
  '/',
  authorize([ROLES.ADMIN, ROLES.SUPPORT]),
  contactController.listContactRequests
);

router.get(
  '/:requestId',
  authorize([ROLES.ADMIN, ROLES.SUPPORT]),
  contactController.verifyRequestOwnership,
  contactController.getContactRequest
);

router.put(
  '/:requestId/status',
  authorize([ROLES.ADMIN, ROLES.SUPPORT]),
  contactController.verifyRequestOwnership,
  contactController.updateRequestStatus
);

// Rota para integração com chat
router.post(
  '/chat/session',
  contactController.startChatSession
);

module.exports = router;