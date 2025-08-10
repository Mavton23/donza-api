const { ChatMember} = require('../models');


module.exports = (models) => {
    const afterCreateStudyGroupMember = async (member, options) => {
        try {
            await ChatMember.findOrCreate({
                where: {
                    chatId: member.groupId,
                    userId: member.userId
                },
                transaction: options.transaction
            });

        } catch (error) {
            console.log("ERRO NO HOOK (afterCreateStudyGroupMember): ", error instanceof Error ? error.message : error);
        }
    }
}