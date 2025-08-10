const express = require('express');
const router = express.Router();
const eventController = require('../controllers/events.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { checkUserStatus } = require('../middleware/checkUserStatus');
const { ROLES } = require('../constants/constants');

router.get('/', 
  eventController.getPublicEvents
);

router.get('/admin/events',
  authenticate,
  authorize([ROLES.ADMIN]),
  eventController.getAllEvents
);

router.post('/',
  authenticate,
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN, ROLES.INSTITUTION]),
  checkUserStatus(),
  eventController.createEvent
);

router.route('/:eventId')
  .get(authenticate, eventController.getEventDetails)
  .put(
    authenticate,
    authorize([ROLES.INSTRUCTOR, ROLES.ADMIN, ROLES.INSTITUTION]),
    eventController.updateEvent
  )
  .delete(
    authenticate,
    authorize([ROLES.INSTRUCTOR, ROLES.ADMIN, ROLES.INSTITUTION]),
    eventController.deleteEvent
  );

router.route('/:eventId/register')
  .post(authenticate, eventController.registerForEvent)
  .delete(authenticate, eventController.cancelEventRegistration);

router.get('/:eventId/participants',
  authenticate,
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN, ROLES.INSTITUTION]),
  eventController.getEventParticipants
);

router.get('/:eventId/event-registration/:userId',
  authenticate,
  eventController.getEventParticipantUser
);

module.exports = router;