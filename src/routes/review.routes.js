const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/review.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { ROLES } = require('../constants/constants');
const { 
  validateReviewCreation, 
  validateReviewUpdate,
  validateReviewReply
} = require('../validation/review.validation');

// Rotas públicas (leituras)
router.get('/:entityType/:entityId/reviews', reviewController.getEntityReviews);
router.get('/:entityType/:entityId/reviews/summary', reviewController.getReviewSummary);
router.get('/courses/:courseId/reviews', reviewController.getCourseReviews);
router.get('/courses/:slug/reviews', reviewController.getCourseReviewsBySlug);

// Rotas autenticadas
router.post('/courses/:courseId/reviews',
  authenticate,
  authorize([ROLES.STUDENT]),
  validateReviewCreation, // Substitui o validate(reviewSchema)
  reviewController.createReview
);

// Estudante
router.get('/:entityType/:entityId/can-review', 
  authenticate,
  authorize([ROLES.STUDENT]), 
  reviewController.canUserReview
);
router.post('/:entityType/:entityId/reviews', 
  authorize([ROLES.STUDENT]), 
  reviewController.submitReview
);

// Rotas de moderação (instrutores/admins)
router.patch('/reviews/:reviewId/status',
  authenticate,
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
  reviewController.updateReviewStatus
);

// Instrutor
router.put('/reviews/:reviewId/reply',
  authenticate, 
  authorize([ROLES.INSTRUCTOR]), 
  reviewController.submitReply
);

// Instituição
router.get('/analytics/reviews', 
  authorize([ROLES.INSTITUTION]), 
  reviewController.getAnalytics
);

// Rotas do do curso para responder a avaliacao
router.patch('/reviews/:reviewId/reply',
  authenticate,
  authorize([ROLES.INSTRUCTOR, ROLES.ADMIN]),
  validateReviewReply,
  reviewController.addReply
);

// Rotas do autor da review (editar/excluir)
router.put('/reviews/:reviewId',
  authenticate,
  authorize([ROLES.STUDENT, ROLES.INSTRUCTOR, ROLES.ADMIN]),
  validateReviewUpdate, // Substitui o validate(reviewSchema)
  reviewController.updateReview
);

router.delete('/reviews/:reviewId',
  authenticate,
  authorize([ROLES.STUDENT, ROLES.INSTRUCTOR, ROLES.ADMIN]),
  reviewController.deleteReview
);

// Rotas administrativas
router.get('/admin/reviews/pending',
  authenticate,
  authorize([ROLES.ADMIN, ROLES.INSTRUCTOR]), // Instrutores também podem ver pendentes de seus cursos
  reviewController.getPendingReviews
);

module.exports = router;