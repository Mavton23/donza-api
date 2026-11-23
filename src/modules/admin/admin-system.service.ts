import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import * as os from 'node:os';
import { PrismaService } from '../prisma/prisma.service';

const MB = 1024 * 1024;
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

@Injectable()
export class AdminSystemService implements OnModuleDestroy {
  private readonly loop = monitorEventLoopDelay({ resolution: 20 });

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {
    this.loop.enable();
  }

  onModuleDestroy() { this.loop.disable(); }

  private async dbPing() {
    const t = process.hrtime.bigint();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: round(Number(process.hrtime.bigint() - t) / 1e6, 2) };
    } catch {
      return { ok: false, latencyMs: null };
    }
  }

  /** Estado das dependências. Nunca devolve segredos: só se estão configuradas. */
  async status() {
    const db = await this.dbPing();
    const has = (k: string) => !!this.config.get<string>(k);
    const services = {
      database: db,
      mail: { configured: has('SMTP_HOST'), note: has('SMTP_HOST') ? undefined : 'sem SMTP_HOST os emails só vão para o log' },
      storage: { configured: has('CLOUDINARY_CLOUD_NAME') && has('CLOUDINARY_API_KEY') && has('CLOUDINARY_API_SECRET') },
      scheduler: { enabled: this.config.get<string>('SCHEDULER_ENABLED') !== 'false' },
    };
    return {
      success: true,
      data: {
        status: db.ok ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        version: process.env.npm_package_version ?? null,
        environment: this.config.get<string>('NODE_ENV') ?? 'development',
        node: process.version,
        services,
      },
    };
  }

  async metrics() {
    const mem = process.memoryUsage();
    const [dbSize, conns, tables] = await Promise.all([
      this.prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`.catch(() => []),
      this.prisma.$queryRaw<{ total: number; active: number }[]>`
        SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE state = 'active')::int AS active
        FROM pg_stat_activity WHERE datname = current_database()`.catch(() => []),
      this.prisma.$queryRaw<{ table: string; rows: number }[]>`
        SELECT relname AS "table", n_live_tup::int AS rows FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 10`.catch(() => []),
    ]);
    const [l1, l5, l15] = os.loadavg();
    return {
      success: true,
      data: {
        process: { uptimeSeconds: Math.round(process.uptime()), rssMb: round(mem.rss / MB), heapUsedMb: round(mem.heapUsed / MB), heapTotalMb: round(mem.heapTotal / MB), externalMb: round(mem.external / MB) },
        eventLoop: { meanMs: round(this.loop.mean / 1e6, 2), p99Ms: round(this.loop.percentile(99) / 1e6, 2), maxMs: round(this.loop.max / 1e6, 2) },
        host: { cpus: os.cpus().length, loadAverage: { m1: round(l1, 2), m5: round(l5, 2), m15: round(l15, 2) }, totalMemMb: round(os.totalmem() / MB, 0), freeMemMb: round(os.freemem() / MB, 0) },
        database: { sizeMb: dbSize[0] ? round(Number(dbSize[0].bytes) / MB) : null, connections: conns[0] ?? null, largestTables: tables },
      },
    };
  }
}
