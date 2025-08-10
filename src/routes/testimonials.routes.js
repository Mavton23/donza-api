const express = require('express');
const router = express.Router();
const testimonialsController = require('../controllers/testimonials.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// Rotas públicas
router.get('/', testimonialsController.listTestimonials);
router.get('/featured', testimonialsController.getFeaturedTestimonials);

// Rotas autenticadas
router.use(authenticate);

router.post('/', testimonialsController.createTestimonial);

// Rotas para proprietário do depoimento
router.put('/:testimonialId', testimonialsController.updateTestimonial);
router.delete('/:testimonialId', testimonialsController.deleteTestimonial);


module.exports = router;