const { 
    StudyGroup, 
    StudyGroupMember, 
    GroupTask, 
    DiscussionTopic,
    GroupReport
  } = require('../models');
  
  module.exports = {
    /**
     * Gera um relatório semanal de atividade
     */
    generateWeeklyReport: async (groupId) => {
      const [members, tasks, topics] = await Promise.all([
        StudyGroupMember.findAll({
          where: { groupId },
          include: ['user']
        }),
        GroupTask.findAll({
          where: { 
            groupId,
            createdAt: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }
        }),
        DiscussionTopic.findAll({
          where: { 
            groupId,
            createdAt: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }
        })
      ]);
  
      const reportData = {
        members: members.map(m => ({
          userId: m.userId,
          name: m.user.username,
          score: m.contributionScore,
          tasksCompleted: 0
        })),
        tasksCompleted: tasks.filter(t => t.status === 'completed').length,
        newTopics: topics.length
      };
  
      await GroupReport.create({
        type: 'WEEKLY_ACTIVITY',
        data: reportData,
        groupId,
        generatedBy: 'system',
        periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        periodEnd: new Date()
      });
  
      return reportData;
    }
  };