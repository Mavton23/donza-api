const express = require('express');
const router = express.Router();
const studyGroupController = require('../controllers/studyGroup.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const { checkUserStatus } = require('../middleware/checkUserStatus');
const updateLastActive = require('../middleware/updateLastActive');
const upload = require('../middleware/upload');



router.use(authenticate);

// ==================== SUB-RECURSOS: GRUPOS DE ESTUDO ====================
router.post('/:communityId/groups', 
  checkUserStatus(),
  studyGroupController.createStudyGroup);

router.get('/:communityId/groups', 
  studyGroupController.getCommunityGroups);

router.get('/:communityId/groups/:groupId',
    updateLastActive,
  studyGroupController.getStudyGroupDetails
);
router.get('/groups/:groupId/membership', 
  studyGroupController.getUserMembership
);

// Grupos de Estudo (PUT/PATCH/DELETE)
router.patch('/:groupId', 
  studyGroupController.verifyGroupMember,
  authorize(['instructor', 'leader', 'co-leader']),
  studyGroupController.updateGroup
);

router.delete('/:groupId', 
  studyGroupController.verifyGroupMember,
  authorize(['leader']),
  studyGroupController.deleteGroup
);


router.get('/:communityId/:groupId/members', 
  studyGroupController.getActiveMembers
);

router.post('/:groupId/members', 
  studyGroupController.addMember
);

router.delete('/:groupId/members/:userId',
  authorize(['instructor', 'leader', 'co-leader']),
  studyGroupController.removeMember
);

router.patch('/:groupId/members/:userId/role',
  authorize(['instructor', 'leader', 'co-leader']),
  studyGroupController.updateMemberRole
);

router.post('/group/:groupId/join', 
  studyGroupController.joinPublicGroup
);

router.post('/group/:groupId/join-request', 
  studyGroupController.requestToJoinGroup
);

router.get('/groups/:groupId/pending-members',
  authorize(['leader', 'co-leader', 'moderator', 'instructor']),
    updateLastActive,
  studyGroupController.getPendingMembers
);

router.patch('/groups/:groupId/members/:userId/approve',
  authorize(['leader', 'co-leader', 'moderator']),
  studyGroupController.approveMember
);

router.patch('/groups/:groupId/members/:userId/reject',
  authorize(['leader', 'co-leader', 'moderator']),
  studyGroupController.rejectMember
);

router.post('/groups/:groupId/invite',
  authorize(['leader', 'co-leader', 'moderator', 'instructor']),
  studyGroupController.inviteUserToGroup
);

router.get('/groups/:groupId/invite/:code',
  studyGroupController.verifyInviteCode
);

router.get('/:groupId/meetings', 
  updateLastActive,
  studyGroupController.verifyGroupMember,
  studyGroupController.getGroupMeetings
);
router.post('/:groupId/meetings',
  updateLastActive,
  studyGroupController.verifyGroupMember,
  studyGroupController.scheduleMeeting
);

module.exports = router;