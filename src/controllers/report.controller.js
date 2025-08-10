const reportService = require('../services/report.service');
const { GroupTask } = require('../models');

module.exports = {
    getWeeklyReport: async (req, res, next) => {
        try {
            const { groupId } = req.params;
            const report = await reportService.generateWeeklyReport(groupId);
            
            res.json({
            success: true,
            data: report
            });
        } catch (error) {
            next(error);
        }
    },

    getTaskReport: async (req, res, next) => {
        try {
            const { groupId } = req.params;
            const tasks = await GroupTask.findAll({
            where: { groupId },
            include: ['assignees']
            });

            const report = {
            total: tasks.length,
            completed: tasks.filter(t => t.status === 'completed').length,
            overdue: tasks.filter(t => t.deadline < new Date() && t.status !== 'completed').length
            };

            res.json({
            success: true,
            data: report
            });
        } catch (error) {
            next(error);
        }
    },
}