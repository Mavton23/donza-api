const { CommunityPost, CommunityMember } = require('../models')

const validReactionTypes = ['like', 'helpful', 'creative', 'confused', 'celebrate', 'insightful'];

const validateReactionType = (reactionType) => {
  if (!validReactionTypes.includes(reactionType.toLowerCase())) {
    throw new BadRequestError('Tipo de reação inválido');
  }
};

const verifyPostExists = async (postId, transaction) => {
  const post = await CommunityPost.findOne({
    where: { 
      postId,
      status: 'published'
    },
    transaction
  });

  if (!post) {
    throw new NotFoundError('Post não encontrado ou não disponível');
  }
  return post;
};

const verifyCommunityMembership = async (communityId, userId, transaction) => {
  const isMember = await CommunityMember.findOne({
    where: {
      communityId,
      userId,
      status: 'active'
    },
    transaction
  });

  if (!isMember) {
    throw new ForbiddenError('Apenas membros podem reagir a posts');
  }
};

module.exports = {
    validateReactionType,
    verifyPostExists,
    verifyCommunityMembership
}