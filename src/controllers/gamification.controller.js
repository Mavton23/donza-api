const { StudyGroupMember, Achievement } = require('../models');

module.exports = {
    getLeaderboard: async (req, res, next) => {
        try {
            const { groupId } = req.params;
            const leaderboard = await StudyGroupMember.findAll({
            where: { groupId },
            order: [['contributionScore', 'DESC']],
            include: ['user']
            });

            res.json({
            success: true,
            data: leaderboard
            });
        } catch (error) {
            next(error);
        }
    }
}