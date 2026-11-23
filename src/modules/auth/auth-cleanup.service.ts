import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/** Limpeza diária: registos pendentes expirados e refresh tokens expirados ou revogados há mais de 30 dias. */
@Injectable()
export class AuthCleanupService {
  private readonly logger = new Logger(AuthCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purge() {
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [temp, tokens] = await Promise.all([
      this.prisma.tempUser.deleteMany({ where: { tokenExpires: { lt: now } } }),
      this.prisma.token.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { revoked: true, updatedAt: { lt: monthAgo } }] },
      }),
    ]);
    this.logger.log(`Limpeza: ${temp.count} registos pendentes, ${tokens.count} tokens`);
  }
}
