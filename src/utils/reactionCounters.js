module.exports.updateReactionCounters = async (sequelize, postId, reactionType, operation, transaction) => {
    const op = operation === 'increment' ? '+ 1' : '- 1';
    await sequelize.query(
      `
      UPDATE community_posts
      SET stats = jsonb_set(
        stats,
        '{reactions,"${reactionType}"}',
        to_jsonb(GREATEST((COALESCE((stats->'reactions'->>'${reactionType}')::int, 0) ${op}), 0)),
        true
      )
      WHERE "postId" = :postId
      `,
      {
        replacements: { postId },
        transaction
      }
    );
  };
  