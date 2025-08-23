const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { ROLES } = require('../constants/constants');

router.use(authenticate);

// Métodos de pagamento
router.get('/:userId/methods',
    authorize([ROLES.STUDENT, ROLES.INSTRUCTOR, ROLES.INSTITUTION, ROLES.ADMIN]),
    paymentController.getMethods
);

router.post('/:userId/methods',
    authorize([ROLES.STUDENT, ROLES.INSTRUCTOR, ROLES.INSTITUTION, ROLES.ADMIN]),
    paymentController.addPaymentMethod
);

router.delete('/:userId/methods/:methodId',
    authorize([ROLES.STUDENT, ROLES.INSTRUCTOR, ROLES.INSTITUTION, ROLES.ADMIN]),
    paymentController.removePaymentMethod
);

// Histórico de pagamentos
router.get('/:userId/history',
    authorize([ROLES.STUDENT, ROLES.INSTRUCTOR, ROLES.INSTITUTION, ROLES.ADMIN]),
    paymentController.billingHistory
);

module.exports = router;