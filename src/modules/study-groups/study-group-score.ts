import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Pontos de contribuição (revertidos quando a acção é desfeita, para não se poder "farmar" pontos). */
export const POINTS = { task: 10, content: 5, topic: 3, reply: 2, solution: 5 } as const;

type Db = PrismaService | Prisma.TransactionClient;

/** Soma `delta` (≥0 no total) à pontuação do membro e marca-o como activo agora. */
export async function award(db: Db, groupId: string, userId: string, delta: number) {
  await db.$executeRaw`
    UPDATE study_group_members
    SET "contributionScore" = GREATEST(0, "contributionScore" + ${delta}), "lastActiveAt" = now()
    WHERE "groupId" = ${groupId}::uuid AND "userId" = ${userId}::uuid`;
}
