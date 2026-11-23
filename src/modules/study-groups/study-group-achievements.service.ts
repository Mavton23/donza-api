import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AchievementType, ActivityEntityType, ActivityType, NotificationType } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import type { AuthUser } from '@/common/types/auth-user';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { groupContext, requireMember } from './study-group-access';

/** Critérios e bónus (pontos de contribuição) de cada conquista. Cada tipo ganha-se uma vez por membro. */
export const ACHIEVEMENTS: Record<AchievementType, { label: string; points: number; description: string }> = {
  TASK_COMPLETER: { label: 'Cumpridor de tarefas', points: 20, description: 'Concluiu 5 tarefas do grupo' },
  DISCUSSION_LEADER: { label: 'Líder de discussões', points: 20, description: 'Publicou 10 tópicos ou respostas' },
  RESOURCE_PROVIDER: { label: 'Fornecedor de recursos', points: 20, description: 'Partilhou 5 conteúdos' },
  TOP_CONTRIBUTOR: { label: 'Maior contribuidor', points: 50, description: 'Lidera a classificação com pelo menos 100 pontos (grupo com 3+ membros)' },
};
const THRESHOLD = { tasks: 5, posts: 10, contents: 5, topScore: 100, minMembers: 3 } as const;

@Injectable()
export class StudyGroupAchievementsService {
  private readonly logger = new Logger(StudyGroupAchievementsService.name);

  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService, private readonly activity: ActivityService) {}

  /** Conquistas de um membro (visível a membros do grupo). */
  async ofMember(user: AuthUser, groupId: string, membershipId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    requireMember(ctx);
    const m = await this.prisma.studyGroupMember.findFirst({
      where: { membershipId, groupId },
      select: { membershipId: true, contributionScore: true, user: { select: { userId: true, username: true, fullName: true, avatarUrl: true } }, earnedAchievements: { orderBy: { createdAt: 'desc' }, select: { achievementId: true, type: true, points: true, createdAt: true } } },
    });
    if (!m) throw new NotFoundException({ message: 'Membro não encontrado', code: 'MEMBER_NOT_FOUND' });
    const earned = new Set(m.earnedAchievements.map((a) => a.type));
    return {
      success: true,
      data: {
        member: { membershipId: m.membershipId, points: m.contributionScore, ...m.user },
        achievements: m.earnedAchievements.map((a) => ({ ...a, ...ACHIEVEMENTS[a.type] })),
        available: (Object.keys(ACHIEVEMENTS) as AchievementType[]).filter((t) => !earned.has(t)).map((t) => ({ type: t, ...ACHIEVEMENTS[t] })),
      },
    };
  }

  /** Avaliação manual pelo líder/co-líder (o agendador faz o mesmo semanalmente). */
  async evaluateAsManager(user: AuthUser, groupId: string) {
    const ctx = await groupContext(this.prisma, groupId, user);
    if (!ctx.canManage) throw new ForbiddenException('Apenas o líder ou co-líder avaliam conquistas');
    const awarded = await this.evaluateGroup(groupId);
    return { success: true, data: { awarded: awarded.length, achievements: awarded } };
  }

  /** Atribui as conquistas em falta. Idempotente: o índice único (membro, tipo) decide quem ganha de facto. */
  async evaluateGroup(groupId: string): Promise<{ userId: string; type: AchievementType; points: number }[]> {
    const live = { groupId, status: { in: ['active', 'muted'] as ('active' | 'muted')[] } };
    const members = await this.prisma.studyGroupMember.findMany({ where: live, select: { membershipId: true, userId: true, contributionScore: true, joinedAt: true } });
    if (!members.length) return [];
    const [tasks, topics, replies, contents] = await Promise.all([
      this.prisma.taskAssignment.groupBy({ by: ['userId'], where: { task: { groupId }, status: 'completed' }, _count: { _all: true } }),
      this.prisma.discussionTopic.groupBy({ by: ['authorId'], where: { groupId }, _count: { _all: true } }),
      this.prisma.discussionReply.groupBy({ by: ['authorId'], where: { topic: { groupId } }, _count: { _all: true } }),
      this.prisma.sharedContent.groupBy({ by: ['uploaderId'], where: { groupId }, _count: { _all: true } }),
    ]);
    const n = (rows: { _count: { _all: number } }[] & unknown[], key: string) => new Map((rows as any[]).map((r) => [r[key] as string, r._count._all as number]));
    const taskN = n(tasks, 'userId'), topicN = n(topics, 'authorId'), replyN = n(replies, 'authorId'), contentN = n(contents, 'uploaderId');

    const top = [...members].sort((a, b) => b.contributionScore - a.contributionScore || a.joinedAt.getTime() - b.joinedAt.getTime())[0];
    const wanted: { m: (typeof members)[number]; type: AchievementType }[] = [];
    for (const m of members) {
      if ((taskN.get(m.userId) ?? 0) >= THRESHOLD.tasks) wanted.push({ m, type: 'TASK_COMPLETER' });
      if ((topicN.get(m.userId) ?? 0) + (replyN.get(m.userId) ?? 0) >= THRESHOLD.posts) wanted.push({ m, type: 'DISCUSSION_LEADER' });
      if ((contentN.get(m.userId) ?? 0) >= THRESHOLD.contents) wanted.push({ m, type: 'RESOURCE_PROVIDER' });
    }
    if (members.length >= THRESHOLD.minMembers && top.contributionScore >= THRESHOLD.topScore) wanted.push({ m: top, type: 'TOP_CONTRIBUTOR' });

    const awarded: { userId: string; type: AchievementType; points: number }[] = [];
    for (const { m, type } of wanted) {
      try {
        const got = await this.prisma.$transaction(async (tx) => {
          const inserted = await tx.$queryRaw<{ achievementId: string }[]>`
            INSERT INTO achievements ("achievementId", "membershipId", "type", "points", "updatedAt")
            VALUES (gen_random_uuid(), ${m.membershipId}::uuid, ${type}::"AchievementType", ${ACHIEVEMENTS[type].points}, now())
            ON CONFLICT ("membershipId", "type") DO NOTHING RETURNING "achievementId"`;
          if (!inserted.length) return null;
          await tx.$executeRaw`
            UPDATE study_group_members
            SET "contributionScore" = "contributionScore" + ${ACHIEVEMENTS[type].points},
                "achievements" = CASE WHEN ${type} = ANY("achievements") THEN "achievements" ELSE array_prepend(${type}, "achievements") END
            WHERE "membershipId" = ${m.membershipId}::uuid`;
          return inserted[0].achievementId;
        });
        if (!got) continue;
        awarded.push({ userId: m.userId, type, points: ACHIEVEMENTS[type].points });
        void this.activity.log({ userId: m.userId, groupId, type: ActivityType.achievement_earned, entityType: ActivityEntityType.achievement, entityId: got, metadata: { type } });
        void this.notifications.notify(m.userId, NotificationType.ACHIEVEMENT_EARNED, {
          title: `Nova conquista: ${ACHIEVEMENTS[type].label}`, message: `${ACHIEVEMENTS[type].description}. +${ACHIEVEMENTS[type].points} pontos.`, relatedEntityId: groupId, metadata: { type },
        });
      } catch (err) {
        this.logger.error(`Falha ao atribuir ${type} a ${m.userId}`, err instanceof Error ? err.stack : String(err));
      }
    }
    return awarded;
  }
}
