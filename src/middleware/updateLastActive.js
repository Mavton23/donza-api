const { StudyGroupMember } = require('../models');

module.exports = async (req, res, next) => {
  if (req.user && req.params.groupId) {
    await StudyGroupMember.update(
      { lastActiveAt: new Date() },
      { 
        where: { 
          userId: req.user.userId, 
          groupId: req.params.groupId 
        } 
      }
    );
  }
  next();
};
