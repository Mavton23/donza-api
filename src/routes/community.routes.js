const express = require('express');
const router = express.Router();
const communityController = require('../controllers/community.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { checkUserStatus } = require('../middleware/checkUserStatus');
const { singleImage, handleUploadErrors } = require('../middleware/upload');

router.use(authenticate);

router.get('/communities', 
  communityController.getCommunities);
router.get('/communities/:communityId', 
  authenticate,
  communityController.getCommunityDetails
);


// Operações básicas de comunidades
router.post('/communities', 
  checkUserStatus(),
  singleImage,
  handleUploadErrors, 
communityController.createCommunity);

router.get('/communities/:communityId/membership', 
  communityController.getCommunityMembership
)

router.get('/communities/:communityId/members', 
  communityController.getCommunityMembers
)

router.patch('/communities/:communityId', authorize(['community_admin']), communityController.updateCommunity);

// Participação em comunidades
router.post('/communities/:communityId/join', communityController.joinCommunity);
router.post('/communities/:communityId/leave', communityController.leaveCommunity);

// Posts da comunidade
router.get('/communities/:communityId/posts', 
  communityController.getCommunityPosts
);

router.get('/communities/:communityId/posts/:postId', 
  communityController.getPostById);

router.get('/communities/posts/:postId/user-reaction',
  communityController.getUserReaction
);

// Like status
router.get('/communities/posts/:postId/like-status', 
  communityController.getLikeStatus);

// Comments
router.get('/communities/posts/:postId/comments', 
  communityController.getPostComments);

// Comments (Edit)
router.put('/communities/posts/:postId/comments/:commentId', 
  communityController.editPostComment);

// Comments (Create)
router.post('/communities/posts/:postId/comments', 
  communityController.createPostComment);

// Comments (Delete)
router.delete('/communities/posts/:postId/comments/:commentId', 
  communityController.postDeleteComment);


// Like
router.post('/communities/posts/:postId/react', 
  communityController.addReaction
);

router.post('/communities/posts/:postId/unreact', 
  communityController.removeReaction
);

// Delete
router.delete('/communities/:communityId/posts/:postId',
communityController.deletePost);

router.post('/communities/:communityId/posts', 
  communityController.verifyCommunityMember, 
  communityController.createPost
);

module.exports = router;