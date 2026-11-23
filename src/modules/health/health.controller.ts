import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@/common/decorators/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Vivacidade: o processo responde (não toca na BD). */
  @Get('live') live() { return { status: 'ok' }; }

  /** Prontidão: a BD responde. 503 se não, para o orquestrador tirar a instância do balanceador. */
  @Get('ready') ready() { return this.check(); }
  @Get() health() { return this.check(); }

  private async check() {
    const t = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: { status: 'down' } });
    }
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()), database: { status: 'up', latencyMs: Date.now() - t } };
  }
}
