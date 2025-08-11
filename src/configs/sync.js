const models = require('../models');
const logger = require('../utils/logger');

// Ordem correta de sincronização baseada nas dependências
const syncOrder = [
    'Token',
    'TempUser',
    'UserDocument',
    'User',
    'UserRelationship',
    'Activity',
    'Course',
    'Event',
    'Module',
    'Lesson',
    'Enrollment',
    'UserLesson',
    'Certificate',
    'EventParticipant',
    'Review',
    'Assignment',
    'Achievement',
    'Billing',
    'Invoice',
    'Submission',
    'Notification',
    'Message',
    'Conversation',
    'ConversationParticipant',
    'Community',
    'CommunityPost',
    'CommunityRole',
    'CommunityMember',
    'CommunityMemberRole',
    'CommunityInvite',
    'StudyGroup',
    'GroupMeeting',
    'StudyGroupMember',
    'StudyGroupPendingMember',
    'PostComment',
    'CommentReaction',
    'PostReaction',
    'PostAttachment',
    'PostView',
    'LearningObjective',
    'Tag',
    'PostObjectives',
    'PostTags',
    'DiscussionTopic',
    'DiscussionReply',
    'ReplyVote',
    'SharedContent',
    'GroupTask',
    'TaskAssignment',
    'MeetingParticipant',
    'GroupChat',
    'GroupReport',
    'GroupMeeting',
    'ChatMessage',
    'ChatMember',
    'ContentReport',
    'ModerationPermissions',
    'ContentScanResult',
    'HelpArticle',
    'HelpFeedback',
    'HelpCategory'
];

const syncDatabase = async (options = {}) => {
  const syncOptions = {
    force: options.force || false,
    alter: options.alter || false,
    logging: options.logging || console.log
  };

  try {
    logger.info('Iniciando sincronização de modelos...');
    
    // Verifica se todos os modelos estão carregados
    const missingModels = syncOrder.filter(model => !models[model]);
    if (missingModels.length > 0) {
      throw new Error(`Modelos não encontrados: ${missingModels.join(', ')}`);
    }

    // Sincroniza na ordem correta
    for (const modelName of syncOrder) {
      try {
        logger.info(`Sincronizando modelo: ${modelName}`);
        await models[modelName].sync(syncOptions);
        logger.info(`✅ ${modelName} sincronizado com sucesso`);
      } catch (error) {
        logger.error(`❌ Falha ao sincronizar ${modelName}:`, error instanceof Error ? error.message : error);
        throw error; // Interrompe o processo se um modelo falhar
      }
    }

    logger.info('🎉 Todos os modelos foram sincronizados na ordem correta!');
    return { success: true, message: 'Sincronização concluída' };
  } catch (error) {
    console.log("ERRO: ", error instanceof Error ? error.message : error);
    logger.error('❌ Erro crítico na sincronização:', {
      error: error instanceof Error ? error.message : error,
      stack: error.stack
    });
    throw new Error(`Falha na sincronização: ${error.message}`);
  }
};

module.exports = syncDatabase;