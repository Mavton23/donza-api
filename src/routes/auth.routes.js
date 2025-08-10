const express = require('express');
const router = express.Router();
const { 
  validateFirstStep, 
  validateSecondStep,
  validateCompleteProfile,
  validateLogin,
  validateResendVerification,
  validateTokenVerification
} = require('../middleware/validation');
const { registrationDocuments,
  handleDocumentErrors, } = require('../middleware/upload');
const authController = require('../controllers/auth.controller');
const rateLimit = require('express-rate-limit');

// Configuração de rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  message: {
    success: false,
    error: {
      message: 'Muitas tentativas. Por favor, tente novamente mais tarde.',
      code: 'RATE_LIMIT_EXCEEDED'
    }
  },
  skipSuccessfulRequests: true
});

// Rotas de Autenticação
router.post('/register/init', validateFirstStep, authController.registerFirstStep);
router.post('/register/complete', authController.registerLastStep);
router.post('/register/upload-documents', 
  registrationDocuments,
  handleDocumentErrors,
  authController.uploadRegistrationDocuments);
router.post('/complete-profile', authController.completeProfile);
router.get('/register/verify-token/:token', validateTokenVerification, authController.verifyTempToken);

// Rota para reenvio de email de verificação
router.post('/resend-verification', validateResendVerification, authController.resendVerificationEmail);

// Rotas tradicionais de autenticação
router.post('/login', validateLogin, authController.login);
router.post('/refresh-token', authController.refreshToken);
router.get('/verify-email', authController.verifyEmail);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);
router.post('/logout', authController.logout);

module.exports = router;