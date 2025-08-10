const { sequelize } = require('../configs/db');
const { Review, User, Course, Event, Enrollment } = require('../models');


module.exports = {
  async getEntityReviews({ entityType, entityId, page, limit, sort, rating, hasComment }) {
    const offset = (page - 1) * limit;
    const where = { entityType, entityId };
    
    if (rating) where.rating = rating;
    if (hasComment) where.comment = { [Op.ne]: null };
    
    const order = sort === 'recent' ? [['createdAt', 'DESC']] : [['rating', 'DESC']];
    
    const { count, rows } = await Review.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'user',
        attributes: ['userId', 'username', 'avatarUrl']
      }],
      order,
      limit,
      offset,
      distinct: true
    });
    
    return {
      reviews: rows,
      page,
      totalPages: Math.ceil(count / limit),
      totalItems: count
    };
  },
  
  async getReviewSummary(entityType, entityId) {
    const result = await Review.findAll({
      where: { entityType, entityId },
      attributes: [
        [sequelize.fn('AVG', sequelize.col('rating')), 'average'],
        [sequelize.fn('COUNT', sequelize.col('reviewId')), 'total'],
        [sequelize.fn('COUNT', sequelize.literal('CASE WHEN "comment" IS NOT NULL THEN 1 END')), 'withComments']
      ],
      raw: true
    });
    
    return {
      average: parseFloat(result[0].average) || 0,
      total: parseInt(result[0].total) || 0,
      withComments: parseInt(result[0].withComments) || 0,
      distribution: await this.getRatingDistribution(entityType, entityId)
    };
  },
  
  async getRatingDistribution(entityType, entityId) {
    const result = await Review.findAll({
      where: { entityType, entityId },
      attributes: [
        'rating',
        [sequelize.fn('COUNT', sequelize.col('rating')), 'count']
      ],
      group: ['rating'],
      raw: true
    });
    
    const distribution = Array(5).fill(0).map((_, i) => ({
      rating: i + 1,
      count: 0
    }));
    
    result.forEach(item => {
      distribution[item.rating - 1].count = parseInt(item.count);
    });
    
    return distribution;
  },
  
  async canUserReview({ userId, entityType, entityId }) {
    if (entityType === 'course') {
      const enrollment = await Enrollment.findOne({
        where: { userId, courseId: entityId, status: 'completed' }
      });
      return !!enrollment;
    }
    
    if (entityType === 'event') {
      const participation = await EventParticipant.findOne({
        where: { userId, eventId: entityId }
      });
      return !!participation;
    }
    
    return false;
  },
  
  async submitReview({ userId, entityType, entityId, rating, comment }) {
    const canReview = await this.canUserReview({ userId, entityType, entityId });
    if (!canReview) throw new Error('User not eligible to review this entity');
    
    const existingReview = await Review.findOne({
      where: { userId, entityType, entityId }
    });
    
    if (existingReview) throw new Error('User already reviewed this entity');
    
    return Review.create({
      userId,
      entityType,
      entityId,
      rating,
      comment
    });
  },
  
  async submitReply({ reviewId, userId, reply }) {
    const review = await Review.findByPk(reviewId, {
      include: [{
        model: Course,
        as: 'course',
        where: { instructorId: userId }
      }]
    });
    
    if (!review) throw new Error('Review not found');
    if (!review.course) throw new Error('Not authorized to reply to this review');
    
    return review.update({
      instructorReply: reply,
      replyDate: new Date()
    });
  },
  
  async getAnalytics({ institutionId, dateRange, instructorId, minRating }) {
    const where = {
      entityType: 'course',
      '$course.institutionId$': institutionId
    };
    
    if (dateRange) {
      const [start, end] = dateRange.split('_');
      where.createdAt = {
        [Op.between]: [new Date(start), new Date(end)]
      };
    }
    
    if (instructorId) {
      where['$course.instructorId$'] = instructorId;
    }
    
    if (minRating) {
      where.rating = { [Op.gte]: parseInt(minRating) };
    }
    
    const reviews = await Review.findAll({
      where,
      include: [{
        model: Course,
        as: 'course',
        attributes: ['courseId', 'title'],
        include: [{
          model: User,
          as: 'instructor',
          attributes: ['userId', 'name']
        }]
      }, {
        model: User,
        as: 'user',
        attributes: ['userId', 'name']
      }],
      order: [['createdAt', 'DESC']]
    });
    
    const summary = await Review.findAll({
      where,
      attributes: [
        [sequelize.fn('AVG', sequelize.col('rating')), 'average'],
        [sequelize.fn('COUNT', sequelize.col('reviewId')), 'total']
      ],
      include: [{
        model: Course,
        as: 'course',
        attributes: [],
        where: { institutionId }
      }],
      group: ['course.courseId'],
      raw: true
    });
    
    return {
      reviews,
      summary
    };
  }
};