import { Injectable, Logger } from '@nestjs/common';
import { ActivityEntityType, ActivityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ActivityInput {
  userId: string;
  type: ActivityType;
  entityType: ActivityEntityType;
  entityId: string;
  groupId?: string;
  courseId?: string;
  /** segundos */
  duration?: number;
  metadata?: Prisma.InputJsonObject;
}

/**
 * Registo de actividade (alimenta estatísticas, relatórios e conquistas dos grupos).
 * NUNCA lança: tal como as notificações, é um efeito secundário que não pode rebentar a operação.
 * Chamar depois do commit; aceita `tx` quando a actividade deve ser atómica com a acção.
 */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(input: ActivityInput, tx?: Prisma.TransactionClient): Promise<void> {
    try {
      const { metadata, ...rest } = input;
      await (tx ?? this.prisma).activity.create({ data: { ...rest, ...(metadata && { metadata }) } });
    } catch (err) {
      this.logger.error(`Falha ao registar actividade (${input.type})`, err instanceof Error ? err.stack : String(err));
    }
  }

  /** Actividade diária de um grupo: utilizadores distintos e nº de acções por dia (UTC). */
  dailyGroupActivity(groupId: string, since: Date) {
    return this.prisma.$queryRaw<{ date: Date; activeUsers: number; actions: number }[]>`
      SELECT DATE("createdAt") AS date, COUNT(DISTINCT "userId")::int AS "activeUsers", COUNT(*)::int AS actions
      FROM activities
      WHERE "groupId" = ${groupId}::uuid AND "createdAt" >= ${since}
      GROUP BY 1 ORDER BY 1`;
  }
}
