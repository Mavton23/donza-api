import { Prisma } from '@prisma/client';
import { PrismaService } from '@/modules/prisma/prisma.service';

const DAY = 86_400_000;
export type SeriesPeriod = '7d' | '30d' | '90d' | '12m';

/** Intervalo e rótulos (dias, ou meses em `12m`) preenchidos mesmo sem registos. */
export function seriesWindow(period: SeriesPeriod, now = new Date()) {
  const monthly = period === '12m';
  const start = monthly
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (parseInt(period, 10) - 1) * DAY);
  const labels: string[] = [];
  for (let d = new Date(start); d <= now; d = monthly ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)) : new Date(d.getTime() + DAY)) {
    labels.push(d.toISOString().slice(0, monthly ? 7 : 10));
  }
  return { start, labels, unit: monthly ? ('month' as const) : ('day' as const), monthly };
}

/**
 * Contagem por dia/mês de `column` em `from` (fragmentos SQL escritos no código, nunca vindos do pedido),
 * com um filtro opcional. Devolve um array alinhado com `labels`.
 */
export async function countSeries(
  prisma: PrismaService, win: ReturnType<typeof seriesWindow>,
  src: { from: Prisma.Sql; column: Prisma.Sql; where?: Prisma.Sql },
): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ d: string; n: number }[]>`
    SELECT to_char(date_trunc(${win.unit}, ${src.column}), ${win.monthly ? 'YYYY-MM' : 'YYYY-MM-DD'}) AS d, COUNT(*)::int AS n
    FROM ${src.from} WHERE ${src.column} >= ${win.start} ${src.where ? Prisma.sql`AND ${src.where}` : Prisma.empty}
    GROUP BY 1`;
  const m = new Map(rows.map((r) => [r.d, r.n]));
  return win.labels.map((l) => m.get(l) ?? 0);
}
