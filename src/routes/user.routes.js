const express = require('express');
const userController = require('../controllers/user.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { avatarUpload, handleUploadErrors } = require('../middleware/upload');
const router = express.Router();

// Perfil do usuário logado
router.get('/me', authenticate, userController.getProfile);
router.get('/profile/:username', authenticate, userController.getUserProfile)
router.put('/me', authenticate, userController.updateProfile);
// Upload de avatar
router.post('/me/avatar', 
  authenticate, 
  avatarUpload,
  handleUploadErrors, 
  userController.uploadAvatar);
router.get('/stats', userController.getPublicStats);
router.get('/:userId/stats', authenticate, userController.getUserStats);
router.get('/progress', authenticate, userController.getProgressData)

// Rotas de conexões entre usuários
router.get('/:userId/followers', authenticate, userController.getUserFollowers);
router.get('/:userId/following', authenticate, userController.getUserFollowing);
router.get('/follow-status/:targetUserId', authenticate, userController.getFollowStatus);
router.post('/follow/:targetUserId', authenticate, userController.followUser);
router.delete('/follow/:targetUserId', authenticate, userController.unfollowUser);

// Rota de busca de users para mensagens
router.get('/users/search', authenticate, userController.searchUsers);


// ==============================================
// Admin routes
// ==============================================
router.get('/', authenticate, authorize(['admin']), userController.getAllUsers);
router.get('/:id', authenticate, userController.getUserById);
router.get('/:userId/dashboard', authenticate, userController.getUserDashboard);
router.put('/:id/role', authenticate, authorize(['admin']), userController.updateUserRole);
router.delete('/:id', authenticate, authorize(['admin']), userController.deleteUser);



router.get('/admin/courses', 
  authenticate, 
  authorize(['admin']),
  userController.getCourses
);

router.get('/admin/events',
  authenticate,
  authorize(['admin']),
  userController.getEvents
);

module.exports = router;